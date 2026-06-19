import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
loadDotenv({ path: resolve(import.meta.dirname, "../../../.env") });
import { InMemoryWorldStore } from "@civ/store";
import { FakeEmbedder, MemoryIndex } from "@civ/memory";
import { RuleBasedBeliefReviser } from "@civ/beliefs";
import { ExplainabilityService } from "@civ/explainability";
import { runCitizenTick, type TickDeps } from "@civ/engine";
import { loadZeroGConfig } from "../src/config";
import { createZeroGStorage } from "../src/real-uploader";
import { createZeroGComputeBrain } from "../src/real-chat";

async function main() {
  const config = loadZeroGConfig(process.env);
  const store = new InMemoryWorldStore();
  const embedder = new FakeEmbedder();

  store.upsertCitizen({ id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
  store.upsertCitizen({ id: "marcus", name: "Marcus", occupation: "Investor", age: 41,
    traits: { ambition: 70, empathy: 60, loyalty: 65, curiosity: 50, discipline: 70, riskTolerance: 60 },
    wealth: 100000, reputation: 70, tier: 2, createdDay: 0 });
  store.upsertGoal({ id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true });
  store.addMemory({ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job during recession", embedding: embedder.embed("lost job during recession") });
  store.addMemory({ id: "m2", citizenId: "ada", day: 2, type: "relationship", importance: 7, summary: "marcus offered funding for a company", embedding: embedder.embed("marcus offered funding for a company") });
  store.upsertBelief({ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.7, sourceMemoryIds: ["m2"], updatedDay: 2 });
  store.setWorldState({ day: 3, economy: { inflation: 8 }, headline: "Recession deepens" });

  const storage = createZeroGStorage(config);
  const deps: TickDeps = {
    store, embedder, memoryIndex: new MemoryIndex(store, embedder),
    reviser: new RuleBasedBeliefReviser(),
    brain: await createZeroGComputeBrain(config),
    storage,
    explain: new ExplainabilityService(storage),
    clock: { day: 3 }, idgen: (() => { let n = 0; return () => `id${++n}`; })(),
  };

  console.log("Running ONE live tick: Ada thinks on 0G Compute, archives on 0G Storage…\n");
  const r = await runCitizenTick(deps, "ada");
  console.log("Decision:", r.decision.action, "->", r.decision.targetId);
  console.log("Reasoning:", r.decision.reasoning);
  console.log("Reasoned by:", r.decision.meta?.provider, "| model", r.decision.meta?.model, "| verified", r.decision.meta?.verified);
  console.log("decision_memories:", store.getDecisionMemories(r.decision.id));
  console.log("decision_beliefs: ", store.getDecisionBeliefs(r.decision.id));
  console.log("Trace archived on 0G:", r.trace.zgRootHash, r.trace.zgTxHash);
}

main().catch((e) => { console.error(e); process.exit(1); });
