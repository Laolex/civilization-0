import { describe, it, expect } from "vitest";
import { ALL_ACTIONS, cosineSimilarity, type Citizen, type ExecutionMeta } from "./index";

describe("shared", () => {
  it("exposes the MVP action verbs", () => {
    expect(ALL_ACTIONS).toContain("start_company");
    expect(ALL_ACTIONS).toContain("betray");
    expect(ALL_ACTIONS).toHaveLength(10);
  });

  it("computes cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("returns 0 when either vector is all zeros", () => {
    expect(cosineSimilarity([0, 0], [1, 0])).toBe(0);
  });

  it("throws on mismatched vector lengths", () => {
    expect(() => cosineSimilarity([1, 0, 0], [1, 0])).toThrow(/length mismatch/);
  });

  it("types a citizen", () => {
    const c: Citizen = {
      id: "c1", name: "Ada", occupation: "Engineer", age: 29,
      traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
      wealth: 0, reputation: 50, tier: 3, createdDay: 0,
    };
    expect(c.name).toBe("Ada");
  });
});

describe("ExecutionMeta", () => {
  it("can be attached to a Decision and a DecisionTrace", () => {
    const meta: ExecutionMeta = { provider: "0xprov", model: "llama-3.3-70b-instruct", verified: true };
    const decision: import("./index").Decision = {
      id: "d1", citizenId: "ada", goalId: null, day: 1, reasoning: "x",
      action: "work", targetId: null, brainProvider: "0g-compute", brainModel: "llama", meta,
    };
    const trace: import("./index").DecisionTrace = {
      id: "t1", decisionId: "d1",
      trace: { decision: "work", goal: null, retrievedMemories: [], beliefs: [], reasoning: "x", eventId: "e1", meta },
    };
    expect(decision.meta?.verified).toBe(true);
    expect(trace.trace.meta?.provider).toBe("0xprov");
  });
});
