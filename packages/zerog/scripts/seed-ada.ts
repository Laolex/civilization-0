// packages/zerog/scripts/seed-ada.ts
import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
loadDotenv({ path: resolve(import.meta.dirname, "../../../.env") });
import { stripEmbeddings } from "@civ/shared";
import { loadZeroGConfig } from "../src/config";
import { createZeroGStorage } from "../src/real-uploader";
import { createZeroGComputeBrain } from "../src/real-chat";
import { buildAdaScenario } from "./scenario";

const OUT = resolve(import.meta.dirname, "../../../apps/web/data/world.json");

async function main() {
  const config = loadZeroGConfig(process.env);
  const storage = createZeroGStorage(config);
  const brain = await createZeroGComputeBrain(config);

  console.log("Seeding Ada's world on real 0G Compute + Storage…");
  const store = await buildAdaScenario(brain, storage);
  const snap = stripEmbeddings(store.snapshot());

  const decision = snap.decisions[0];
  console.log("Decision:", decision?.action, "->", decision?.targetId);
  console.log("Verified:", decision?.meta?.verified, "| provider:", decision?.meta?.provider);
  const trace = snap.traces.find((t) => t.decisionId === decision?.id);
  console.log("Trace root:", trace?.zgRootHash);

  if (decision?.action !== "invest" || decision?.meta?.verified !== true || !trace?.zgRootHash) {
    throw new Error("Seed did not produce a verified invest decision with an archived trace — re-run.");
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(snap, null, 2));
  console.log("Wrote", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
