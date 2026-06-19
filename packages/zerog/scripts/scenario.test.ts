import { describe, it, expect } from "vitest";
import { FakeStorage } from "@civ/storage";
import { FakeBrain } from "@civ/brain";
import { buildAdaScenario } from "./scenario";

// Scripted brain: Ada invests in Marcus, weighting memory m1 and belief b1.
const investBrain = new FakeBrain((ctx) => ({
  action: "invest",
  targetId: "marcus",
  reasoning: "Marcus helped me before; I trust him with this.",
  memoryWeights: ctx.memories.some((m) => m.id === "m1") ? { m1: 0.6 } : {},
  beliefWeights: ctx.beliefs.some((b) => b.id === "b1") ? { b1: 0.8 } : {},
  meta: { provider: "fake", model: "scripted-v0", verified: true },
}));

describe("buildAdaScenario", () => {
  it("seeds Ada's world and produces the invest decision via a tick", async () => {
    const store = await buildAdaScenario(investBrain, new FakeStorage());
    const snap = store.snapshot();

    expect(snap.citizens.map((c) => c.id).sort()).toEqual(["ada", "marcus"]);
    // 3 stimulus events (decisionId null) + 1 decision event
    const stimulus = snap.events.filter((e) => e.decisionId === null);
    const decided = snap.events.filter((e) => e.decisionId !== null);
    expect(stimulus).toHaveLength(3);
    expect(decided).toHaveLength(1);

    expect(snap.decisions).toHaveLength(1);
    const d = snap.decisions[0];
    expect(d.action).toBe("invest");
    expect(d.targetId).toBe("marcus");
    expect(snap.decisionMemories).toContainEqual({ decisionId: d.id, memoryId: "m1", weight: 0.6 });
    expect(snap.decisionBeliefs).toContainEqual({ decisionId: d.id, beliefId: "b1", weight: 0.8 });

    const trace = snap.traces.find((t) => t.decisionId === d.id)!;
    expect(trace.zgRootHash).toBeDefined(); // archived (fake root)
    expect(trace.trace.eventId).toBe(decided[0].id);
  });
});
