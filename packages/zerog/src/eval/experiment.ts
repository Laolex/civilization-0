import { evaluate as opikEvaluate, Opik, type EvaluateOptions, type EvaluationResult } from "opik";
import type { BrainProvider, DecisionContext } from "@civ/brain";
import type { DecisionJudge } from "../judge";
import { getOpikClient } from "../opik-tracing";
import { InCharacterMetric } from "./judge-metric";
import type { DecisionScenario } from "./scenarios";

export const DEFAULT_DATASET = "civ-decisions-seed";

export interface ExperimentOptions {
  scenarios: DecisionScenario[];
  brain: BrainProvider;
  judge: DecisionJudge;
  experimentName: string;
  experimentConfig?: Record<string, unknown>;
  datasetName?: string;
}

/** Injectable seams so the harness is testable without network or 0G spend. */
export interface ExperimentDeps {
  client: { getOrCreateDataset(name: string): Promise<{ insert(items: Record<string, unknown>[]): Promise<void> }> };
  evaluate: (options: EvaluateOptions) => Promise<EvaluationResult>;
}

function defaultDeps(): ExperimentDeps {
  const client = getOpikClient();
  if (!client) {
    throw new Error("Opik is not configured — set OPIK_API_KEY to run experiments.");
  }
  return {
    client: client as unknown as InstanceType<typeof Opik>,
    evaluate: (options) => opikEvaluate(options),
  };
}

/**
 * Run one prompt/model variant over a scenario set: seed the dataset, run the
 * brain on each scenario, grade with the judge, and log an Opik experiment.
 * Run twice with different brains to compare variants in the Opik UI.
 */
export async function runDecisionExperiment(
  opts: ExperimentOptions,
  deps: ExperimentDeps = defaultDeps(),
): Promise<EvaluationResult> {
  const dataset = await deps.client.getOrCreateDataset(opts.datasetName ?? DEFAULT_DATASET);
  await dataset.insert(opts.scenarios.map((s) => ({ scenarioId: s.id, context: s.context })));

  const task = async (item: Record<string, unknown>): Promise<Record<string, unknown>> => {
    const context = (item as { context: DecisionContext }).context;
    const decision = await opts.brain.decide(context);
    return { decision };
  };

  return deps.evaluate({
    dataset: dataset as never,
    task: task as never,
    scoringMetrics: [new InCharacterMetric(opts.judge)],
    experimentName: opts.experimentName,
    experimentConfig: opts.experimentConfig,
  });
}
