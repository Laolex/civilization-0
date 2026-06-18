import { describe, it, expect } from "vitest";
import { InMemoryWorldStore } from "./index";

describe("InMemoryWorldStore", () => {
  it("stores and retrieves citizens and their memories", () => {
    const s = new InMemoryWorldStore();
    s.upsertCitizen({ id: "ada", name: "Ada", occupation: "Engineer", age: 29,
      traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
      wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
    s.addMemory({ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "Lost job", embedding: [1, 0] });
    expect(s.getCitizen("ada")?.name).toBe("Ada");
    expect(s.getMemories("ada")).toHaveLength(1);
    expect(s.getMemories("other")).toHaveLength(0);
  });

  it("records decision_memories and decision_beliefs joins", () => {
    const s = new InMemoryWorldStore();
    s.addDecisionMemories([{ decisionId: "d1", memoryId: "m1", weight: 1 }]);
    s.addDecisionBeliefs([{ decisionId: "d1", beliefId: "b1", weight: 0.9 }]);
    expect(s.getDecisionMemories("d1")).toEqual([{ decisionId: "d1", memoryId: "m1", weight: 1 }]);
    expect(s.getDecisionBeliefs("d1")[0].beliefId).toBe("b1");
  });

  it("updates archive hashes on events", () => {
    const s = new InMemoryWorldStore();
    s.addEvent({ id: "e1", day: 1, type: "start_company", actorId: "ada", targetId: null, decisionId: "d1", payload: {} });
    s.updateEventArchive("e1", "0xroot", "0xtx");
    expect(s.getEvent("e1")?.zgRootHash).toBe("0xroot");
  });

  it("upsertRelationship replaces the row for the same (citizenId, otherId) pair", () => {
    const s = new InMemoryWorldStore();
    s.upsertRelationship({ citizenId: "ada", otherId: "bob", trust: 10, friendship: 5, influence: 1 });
    s.upsertRelationship({ citizenId: "ada", otherId: "bob", trust: 80, friendship: 60, influence: 9 });
    const rels = s.getRelationships("ada");
    expect(rels).toHaveLength(1);
    expect(rels[0].trust).toBe(80);
  });

  it("updates archive hashes on memories and traces", () => {
    const s = new InMemoryWorldStore();
    s.addMemory({ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "Lost job", embedding: [1, 0] });
    s.updateMemoryArchive("m1", "0xmroot", "0xmtx");
    expect(s.getMemories("ada")[0].zgRootHash).toBe("0xmroot");
    expect(s.getMemories("ada")[0].zgTxHash).toBe("0xmtx");

    s.addTrace({ id: "t1", decisionId: "d1", trace: {
      decision: "start_company", goal: null, retrievedMemories: [], beliefs: [], reasoning: "", eventId: "e1" } });
    s.updateTraceArchive("t1", "0xtroot", "0xttx");
    expect(s.getTrace("d1")?.zgRootHash).toBe("0xtroot");
  });

  it("getActiveGoal ignores inactive goals", () => {
    const s = new InMemoryWorldStore();
    s.upsertGoal({ id: "g1", citizenId: "ada", kind: "career", description: "x", progress: 0, active: false });
    expect(s.getActiveGoal("ada")).toBeUndefined();
    s.upsertGoal({ id: "g2", citizenId: "ada", kind: "career", description: "y", progress: 0, active: true });
    expect(s.getActiveGoal("ada")?.id).toBe("g2");
  });

  it("round-trips world state", () => {
    const s = new InMemoryWorldStore();
    expect(s.getWorldState().day).toBe(0);
    s.setWorldState({ day: 5, economy: { gdp: 100 }, headline: "Boom" });
    expect(s.getWorldState()).toEqual({ day: 5, economy: { gdp: 100 }, headline: "Boom" });
  });
});
