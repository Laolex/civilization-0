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
});
