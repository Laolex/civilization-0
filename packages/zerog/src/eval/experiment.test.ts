import { describe, it, expect } from "vitest";
import { FakeBrain, type DecisionContext } from "@civ/brain";
import type { DecisionJudge } from "../judge";
import { InCharacterMetric } from "./judge-metric";
import { runDecisionExperiment, type ExperimentDeps } from "./experiment";
import type { DecisionScenario } from "./scenarios";

const scenario: DecisionScenario = {
  id: "s1",
  context: {
    citizen: { id: "ada", name: "Ada", occupation: "Engineer", age: 29,
      traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
      wealth: 0, reputation: 50, tier: 3, createdDay: 0 },
    goal: null, memories: [], beliefs: [], relationships: [],
    worldState: { day: 1, economy: {}, headline: "x" },
    availableActions: ["work", "start_company"],
  } as DecisionContext,
};

const judge: DecisionJudge = { async grade() { return null; } };

function fakeDeps() {
  const inserted: Record<string, unknown>[][] = [];
  let captured: Parameters<ExperimentDeps["evaluate"]>[0] | undefined;
  const dataset = { insert: async (items: Record<string, unknown>[]) => { inserted.push(items); } };
  const deps: ExperimentDeps = {
    client: { getOrCreateDataset: async () => dataset as never },
    evaluate: async (opts) => { captured = opts; return {} as never; },
  };
  return { deps, inserted, get captured() { return captured; } };
}

describe("runDecisionExperiment", () => {
  it("inserts scenario contexts into the named dataset", async () => {
    const f = fakeDeps();
    await runDecisionExperiment(
      { scenarios: [scenario], brain: new FakeBrain(() => ({ action: "work", targetId: null, reasoning: "", memoryWeights: {}, beliefWeights: {} })),
        judge, experimentName: "exp-v1", datasetName: "my-dataset" },
      f.deps,
    );
    expect(f.inserted[0][0]).toMatchObject({ scenarioId: "s1" });
    expect(JSON.stringify(f.inserted[0][0])).toContain("Ada");
  });

  it("passes experiment name/config and an InCharacterMetric to evaluate", async () => {
    const f = fakeDeps();
    await runDecisionExperiment(
      { scenarios: [scenario], brain: new FakeBrain(() => ({ action: "work", targetId: null, reasoning: "", memoryWeights: {}, beliefWeights: {} })),
        judge, experimentName: "exp-v2", experimentConfig: { variant: "v2" } },
      f.deps,
    );
    expect(f.captured!.experimentName).toBe("exp-v2");
    expect(f.captured!.experimentConfig).toEqual({ variant: "v2" });
    expect(f.captured!.scoringMetrics![0]).toBeInstanceOf(InCharacterMetric);
  });

  it("wires a task that runs the brain on each scenario's context", async () => {
    const f = fakeDeps();
    let decidedFor = "";
    const brain = new FakeBrain((ctx) => { decidedFor = ctx.citizen.name; return { action: "start_company", targetId: null, reasoning: "", memoryWeights: {}, beliefWeights: {} }; });
    await runDecisionExperiment({ scenarios: [scenario], brain, judge, experimentName: "exp" }, f.deps);

    const out = await f.captured!.task({ scenarioId: "s1", context: scenario.context });
    expect(decidedFor).toBe("Ada");
    expect((out as { decision: { action: string } }).decision.action).toBe("start_company");
  });
});
