import { describe, it, expect } from "vitest";
import { fold, worldStateKey } from "./reduce";
import { GENESIS_PARENT, SCHEMA_VERSION, type CognitiveTransition } from "./index";

function ct(over: Partial<CognitiveTransition> & { tickId: number; actor: string; action: string }): CognitiveTransition {
  return {
    header: { eventId: `${over.actor}-${over.tickId}`, parentHash: GENESIS_PARENT, worldId: "w1",
      tickId: over.tickId, engineVersion: "t", schemaVersion: SCHEMA_VERSION, timestamp: "2026-06-27T00:00:00.000Z" },
    actor: over.actor, observation: { query: "q" }, retrievedMemories: [], retrievedBeliefs: [],
    socialDrivers: [], availableActions: ["work"], selectedAction: over.action, reasoning: "r",
    worldDelta: null, execution: { provider: "p", modelId: "m", modelVersion: "v", promptHash: "",
      worldHash: "", verified: true }, candidates: null, beliefDelta: null,
  };
}

describe("fold", () => {
  it("indexes latest transition per (world,tick,actor)", () => {
    const ws = fold([
      ct({ tickId: 1, actor: "c1", action: "work" }),
      ct({ tickId: 1, actor: "c2", action: "rest" }),
      ct({ tickId: 2, actor: "c1", action: "invest" }),
    ]);
    expect(ws.latest.get(worldStateKey("w1", 1, "c1"))?.selectedAction).toBe("work");
    expect(ws.latest.get(worldStateKey("w1", 2, "c1"))?.selectedAction).toBe("invest");
    expect(ws.latest.get(worldStateKey("w1", 1, "c2"))?.selectedAction).toBe("rest");
  });
  it("last write wins for a duplicate key", () => {
    const ws = fold([
      ct({ tickId: 1, actor: "c1", action: "work" }),
      ct({ tickId: 1, actor: "c1", action: "rest" }),
    ]);
    expect(ws.latest.get(worldStateKey("w1", 1, "c1"))?.selectedAction).toBe("rest");
  });
});

describe("worldStateKey", () => {
  it("does not collide when ids contain the printable ':' delimiter", () => {
    // distinct triples that would have collided under a ":"-joined key
    expect(worldStateKey("w:1", 1, "c1")).not.toBe(worldStateKey("w", 1, "1:c1"));
  });
  it("rejects ids containing the control separator", () => {
    expect(() => worldStateKey("w\x1F1", 1, "c1")).toThrow(/U\+001F/);
  });
});

import { worldFold } from "./reduce";
import { GENESIS_PARENT, SCHEMA_VERSION } from "./index";
import type { Genesis, WealthDelta, OrganizationDelta, HistoryEvent } from "./index";

const H = (id: string) => ({ eventId: id, parentHash: GENESIS_PARENT, worldId: "w1", tickId: 1,
  engineVersion: "t", schemaVersion: SCHEMA_VERSION, timestamp: "2026-06-30T00:00:00.000Z" });

const genesis: Genesis = { kind: "Genesis", header: H("g"), epochId: "epoch-w1", historyVersion: "1b-v1",
  worldHash: "0x0", capturedAt: "2026-06-30T00:00:00.000Z",
  facts: { wealth: [{ actor: "c1", wealth: 100 }], relationships: [], organizations: [] } };

describe("worldFold", () => {
  it("applies wealth deltas over the genesis baseline (floored at 0)", () => {
    const evs: HistoryEvent[] = [
      { kind: "WealthDelta", header: H("w1"), actor: "c1", delta: 8, decisionId: "d1" } as WealthDelta,
      { kind: "WealthDelta", header: H("w2"), actor: "c1", delta: -200, decisionId: "d2" } as WealthDelta,
    ];
    const facts = worldFold(genesis, evs);
    expect(facts.wealth.find((w) => w.actor === "c1")?.wealth).toBe(0); // 100+8-200 → floor 0
  });

  it("introduces actors/orgs that appear only in deltas", () => {
    const evs: HistoryEvent[] = [
      { kind: "WealthDelta", header: H("w"), actor: "c2", delta: 5, decisionId: null } as WealthDelta,
      { kind: "OrganizationDelta", header: H("o1"), op: "founded", orgId: "org1", founderId: "c1", decisionId: "d" } as OrganizationDelta,
      { kind: "OrganizationDelta", header: H("o2"), op: "member_added", orgId: "org1", citizenId: "c2", role: "member", decisionId: "d" } as OrganizationDelta,
    ];
    const f = worldFold(genesis, evs);
    expect(f.wealth.find((w) => w.actor === "c2")?.wealth).toBe(5);
    const org = f.organizations.find((o) => o.id === "org1");
    expect(org?.members.map((m) => m.citizenId).sort()).toEqual(["c1", "c2"]);
  });

  it("ignores cognition/anchor events", () => {
    const evs: HistoryEvent[] = [{ header: H("ct"), actor: "c1" } as any];
    expect(worldFold(genesis, evs).wealth.find((w) => w.actor === "c1")?.wealth).toBe(100);
  });
});
