import { describe, it, expect } from "vitest";
import type { DecisionContext } from "@civ/brain";
import { promptV1, promptV2 } from "./prompt-variants";

function ctxOf(): DecisionContext {
  return {
    citizen: { id: "ada", name: "Ada", occupation: "Engineer", age: 29,
      traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
      wealth: 0, reputation: 50, tier: 3, createdDay: 0 },
    goal: { id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true },
    memories: [{ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job", embedding: [] }],
    beliefs: [{ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.8, sourceMemoryIds: ["m1"], updatedDay: 2 }],
    relationships: [], worldState: { day: 3, economy: {}, headline: "Recession" },
    availableActions: ["work", "start_company"],
  };
}

describe("prompt variants", () => {
  it("promptV1 matches the default builder shape (system+user, schema + actions)", () => {
    const msgs = promptV1(ctxOf());
    expect(msgs.map((m) => m.role)).toEqual(["system", "user"]);
    expect(msgs[0].content).toContain("start_company");
    expect(msgs[1].content).toContain("Ada");
  });

  it("promptV2 is a distinct prompt but keeps the same structure and the action schema", () => {
    const v1 = promptV1(ctxOf());
    const v2 = promptV2(ctxOf());
    expect(v2.map((m) => m.role)).toEqual(["system", "user"]);
    expect(v2[0].content).not.toBe(v1[0].content); // different system framing
    expect(v2[0].content).toContain("start_company"); // still lists allowed actions
    expect(v2[1].content).toBe(v1[1].content); // same user payload, only framing changes
  });
});
