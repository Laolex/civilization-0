// Run from the zerog package dir with the require condition (the compute SDK's
// 0.8.4 ESM bundle is broken; --conditions require picks its working CJS build):
//   pnpm -C /opt/civilization-0/packages/zerog exec tsx --conditions require scripts/smoke-0g-compute.ts
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
loadDotenv({ path: resolve(import.meta.dirname, "../../../.env") });

import { loadZeroGConfig } from "../src/config";
import { createZeroGComputeBrain } from "../src/real-chat";
import type { DecisionContext } from "@civ/brain";

const ctx: DecisionContext = {
  citizen: {
    id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0,
  },
  goal: { id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true },
  memories: [{ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job during recession", embedding: [] }],
  beliefs: [{ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.8, sourceMemoryIds: ["m0"], updatedDay: 2 }],
  relationships: [],
  worldState: { day: 3, economy: {}, headline: "Recession deepens" },
  availableActions: ["work", "start_company", "invest"],
};

async function main() {
  const config = loadZeroGConfig(process.env);

  if (!config.computeProvider) {
    console.log("ZG_COMPUTE_PROVIDER not set. Listing providers via read-only broker so you can pin one in .env:");
    const { createZGComputeNetworkReadOnlyBroker } = await import("@0gfoundation/0g-compute-ts-sdk");
    const ro = await createZGComputeNetworkReadOnlyBroker(config.evmRpc);
    const services = await ro.inference.listService();
    // BigInt-safe serializer (SDK returns bigint fields in service metadata)
    const replacer = (_key: string, value: unknown) =>
      typeof value === "bigint" ? value.toString() : value;
    console.log(JSON.stringify(services, replacer, 2));
    return;
  }

  console.log("ZG_COMPUTE_PROVIDER set. Creating 0G Compute brain…");
  const brain = await createZeroGComputeBrain(config);
  console.log("Asking 0G Compute for Ada's decision…");
  const d = await brain.decide(ctx);
  console.log("decision:", { action: d.action, targetId: d.targetId, reasoning: d.reasoning });
  console.log("meta:    ", d.meta);
}

main().catch((e) => { console.error(e); process.exit(1); });
