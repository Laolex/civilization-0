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
