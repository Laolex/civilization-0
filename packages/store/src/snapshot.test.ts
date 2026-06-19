import { describe, it, expect } from "vitest";
import { InMemoryWorldStore } from "./index";

describe("InMemoryWorldStore.snapshot", () => {
  it("dumps all collections", () => {
    const s = new InMemoryWorldStore();
    s.upsertCitizen({ id: "ada", name: "Ada", occupation: "Engineer", age: 29, traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 }, wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
    s.upsertGoal({ id: "g1", citizenId: "ada", kind: "wealth", description: "independence", progress: 0.1, active: true });
    s.addMemory({ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job", embedding: [1, 2] });
    s.upsertBelief({ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.8, sourceMemoryIds: ["m1"], updatedDay: 1 });
    s.addDecision({ id: "d1", citizenId: "ada", goalId: "g1", day: 12, reasoning: "r", action: "invest", targetId: "marcus", brainProvider: "0g-compute", brainModel: "qwen" });
    s.addDecisionMemories([{ decisionId: "d1", memoryId: "m1", weight: 0.6 }]);
    s.addDecisionBeliefs([{ decisionId: "d1", beliefId: "b1", weight: 0.8 }]);
    s.addEvent({ id: "e1", day: 12, type: "invest", actorId: "ada", targetId: "marcus", decisionId: "d1", payload: {} });
    s.addTrace({ id: "t1", decisionId: "d1", trace: { decision: "invest", goal: "independence", retrievedMemories: ["m1"], beliefs: ["Marcus is trustworthy"], reasoning: "r", eventId: "e1" } });
    s.setWorldState({ day: 12, economy: { inflation: 8 }, headline: "Recession" });

    const snap = s.snapshot();
    expect(typeof snap.capturedAt).toBe("string");
    expect(snap.citizens).toHaveLength(1);
    expect(snap.goals).toHaveLength(1);
    expect(snap.memories[0].id).toBe("m1");
    expect(snap.beliefs[0].id).toBe("b1");
    expect(snap.decisions[0].id).toBe("d1");
    expect(snap.decisionMemories).toEqual([{ decisionId: "d1", memoryId: "m1", weight: 0.6 }]);
    expect(snap.decisionBeliefs).toEqual([{ decisionId: "d1", beliefId: "b1", weight: 0.8 }]);
    expect(snap.events[0].id).toBe("e1");
    expect(snap.traces[0].id).toBe("t1");
    expect(snap.worldState.day).toBe(12);
  });
});
