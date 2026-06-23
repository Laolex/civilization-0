import { describe, it, expect } from "vitest";
import type { DecisionContext, DecisionResult } from "@civ/brain";
import type { DecisionJudge, JudgeResult } from "../judge";
import { InCharacterMetric } from "./judge-metric";

const context = {
  citizen: { id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 },
  goal: { id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true },
  memories: [], beliefs: [], relationships: [],
  worldState: { day: 3, economy: {}, headline: "Recession" },
  availableActions: ["work", "start_company"],
} as DecisionContext;

const decision: DecisionResult = {
  action: "start_company", targetId: "marcus", reasoning: "build it",
  memoryWeights: {}, beliefWeights: {},
};

const judgeResult: JudgeResult = {
  scores: { inCharacter: 0.8, goalAlignment: 0.6 },
  reasoning: "on brand for an ambitious engineer",
  raw: { content: "{}", provider: "0xprov", model: "llama-x", verified: true },
  prompt: [{ role: "user", content: "grade" }],
};

describe("InCharacterMetric", () => {
  it("returns two named score results from the judge", async () => {
    const judge: DecisionJudge = { async grade() { return judgeResult; } };
    const metric = new InCharacterMetric(judge);

    const out = await metric.score({ context, decision });
    const results = Array.isArray(out) ? out : [out];

    expect(results.map((r) => r.name).sort()).toEqual(["goal_alignment", "in_character"]);
    expect(results.find((r) => r.name === "in_character")!.value).toBe(0.8);
    expect(results.find((r) => r.name === "goal_alignment")!.value).toBe(0.6);
    expect(results.find((r) => r.name === "in_character")!.reason).toContain("ambitious");
  });

  it("returns no scores (empty array) when the judge can't grade", async () => {
    const judge: DecisionJudge = { async grade() { return null; } };
    const metric = new InCharacterMetric(judge);

    const out = await metric.score({ context, decision });
    expect(out).toEqual([]);
  });

  it("exposes a metric name", () => {
    const metric = new InCharacterMetric({ async grade() { return null; } });
    expect(metric.name).toBe("in_character_judge");
  });
});
