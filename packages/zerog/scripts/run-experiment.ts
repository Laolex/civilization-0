/**
 * A/B two decision-prompt variants on the real 0G brain, graded by the real 0G
 * judge, logged as two Opik experiments you can compare side-by-side.
 *
 *   pnpm --filter @civ/zerog exec tsx scripts/run-experiment.ts
 *
 * COST: ~2 variants x N scenarios x (1 decision + 1 judge) 0G calls. With the 5
 * seed scenarios that is ~20 calls. Needs OPIK_* and ZG_* configured in .env.
 */
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
loadDotenv({ path: resolve(import.meta.dirname, "../../../.env") });

import { ZeroGComputeBrain } from "../src/brain";
import { RealChat } from "../src/real-chat";
import { ZeroGJudge } from "../src/judge";
import { loadZeroGConfig } from "../src/config";
import { runDecisionExperiment } from "../src/eval/experiment";
import { SEED_SCENARIOS } from "../src/eval/scenarios";
import { promptV1, promptV2 } from "../src/eval/prompt-variants";
import { getOpikClient, flushOpik } from "../src/opik-tracing";

async function main() {
  if (!getOpikClient()) {
    console.log("OPIK_API_KEY not set — set it in .env to log experiments.");
    return;
  }
  const config = loadZeroGConfig(process.env);
  const chat = await RealChat.create(config);
  const judge = new ZeroGJudge(chat);

  const variants = [
    { name: "prompt-v1-baseline", builder: promptV1 },
    { name: "prompt-v2-trait-first", builder: promptV2 },
  ];

  console.log(`A/B over ${SEED_SCENARIOS.length} scenarios x ${variants.length} variants on real 0G…\n`);
  for (const v of variants) {
    console.log(`\n=== Variant: ${v.name} ===`);
    const brain = new ZeroGComputeBrain(chat, chat.modelName, v.builder);
    await runDecisionExperiment({
      scenarios: SEED_SCENARIOS,
      brain,
      judge,
      experimentName: `${v.name}-${Date.now()}`,
      experimentConfig: { variant: v.name, model: chat.modelName },
    });
  }

  await flushOpik();
  console.log("\nBoth experiments logged. Compare them in the Opik dashboard (same dataset).");
}

main().catch((err) => { console.error(err); process.exit(1); });
