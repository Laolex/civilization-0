import { describe, it, expect } from "vitest";
import { ALL_ACTIONS, cosineSimilarity, type Citizen } from "./index";

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

  it("types a citizen", () => {
    const c: Citizen = {
      id: "c1", name: "Ada", occupation: "Engineer", age: 29,
      traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
      wealth: 0, reputation: 50, tier: 3, createdDay: 0,
    };
    expect(c.name).toBe("Ada");
  });
});
