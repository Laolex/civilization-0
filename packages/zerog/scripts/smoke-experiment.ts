/**
 * Verify the offline experiment harness end-to-end against the REAL Opik
 * evaluate(), using a fake brain + fake judge so it spends ZERO 0G. Confirms the
 * dataset/task/metric wiring (especially that the metric receives the task's
 * decision output) and that an experiment with scores lands in Opik.
 *
 *   pnpm --filter @civ/zerog exec tsx scripts/smoke-experiment.ts
 */
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
loadDotenv({ path: resolve(import.meta.dirname, "../../../.env") });

import { FakeBrain } from "@civ/brain";
import type { DecisionJudge, JudgeResult } from "../src/judge";
import { runDecisionExperiment } from "../src/eval/experiment";
import { SEED_SCENARIOS } from "../src/eval/scenarios";
import { getOpikClient, flushOpik } from "../src/opik-tracing";

// Deterministic fake judge: scores by how ambitious the citizen is, so the
// numbers vary across scenarios and we can see them aggregate.
const fakeJudge: DecisionJudge = {
  async grade(ctx, decision): Promise<JudgeResult> {
    const amb = (ctx.citizen.traits.ambition ?? 50) / 100;
    return {
      scores: { inCharacter: Math.min(1, 0.5 + amb / 2), goalAlignment: Math.min(1, 0.4 + amb / 2) },
      reasoning: `fake grade for ${ctx.citizen.name} choosing ${decision.action}`,
      raw: { content: "{}", provider: "0xfake", model: "fake-judge", verified: true, usage: { total_tokens: 1 } },
      prompt: [{ role: "user", content: "grade" }],
    };
  },
};

async function main() {
  if (!getOpikClient()) {
    console.log("OPIK_API_KEY not set — cannot run an experiment. Set it in .env.");
    return;
  }
  const brain = new FakeBrain((ctx) => ({
    action: ctx.availableActions[0], targetId: null,
    reasoning: `${ctx.citizen.name} acts`, memoryWeights: {}, beliefWeights: {},
  }));

  console.log(`Running fake experiment over ${SEED_SCENARIOS.length} scenarios (no 0G spend)…\n`);
  const result = await runDecisionExperiment({
    scenarios: SEED_SCENARIOS,
    brain,
    judge: fakeJudge,
    experimentName: `smoke-fake-${Date.now()}`,
    experimentConfig: { kind: "smoke", brain: "fake" },
  });

  await flushOpik();
  void result;
  console.log("\nExperiment logged — see the summary box above for the Opik dashboard link.");
}

main().catch((err) => { console.error(err); process.exit(1); });
