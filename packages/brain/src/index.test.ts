import { describe, it, expect } from "vitest";
import { FakeBrain, type DecisionContext } from "./index";

const ctx: DecisionContext = {
  citizen: { id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 },
  goal: null, memories: [{ id: "m1", citizenId: "ada", day: 1, type: "event",
    importance: 8, summary: "Lost job", embedding: [1, 0] }],
  beliefs: [{ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy",
    confidence: 0.9, sourceMemoryIds: ["m0"], updatedDay: 2 }],
  relationships: [], worldState: { day: 3, economy: {}, headline: "" },
  availableActions: ["work", "start_company"],
};

describe("FakeBrain", () => {
  it("returns the scripted decision and reports its identity", async () => {
    const brain = new FakeBrain((c) => ({
      action: "start_company", targetId: null,
      reasoning: "Have funding belief, lost job",
      memoryWeights: { [c.memories[0].id]: 1 },
      beliefWeights: { [c.beliefs[0].id]: 0.9 },
    }));
    expect(brain.name).toBe("fake");
    const d = await brain.decide(ctx);
    expect(d.action).toBe("start_company");
    expect(d.memoryWeights["m1"]).toBe(1);
    expect(d.beliefWeights["b1"]).toBe(0.9);
  });

  it("a DecisionResult can carry execution meta", async () => {
    const brain = new FakeBrain((c) => ({
      action: "work", targetId: null, reasoning: "r",
      memoryWeights: {}, beliefWeights: {},
      meta: { provider: "0xp", model: "m", verified: true },
    }));
    const d = await brain.decide(ctx);
    expect(d.meta?.verified).toBe(true);
  });
});
