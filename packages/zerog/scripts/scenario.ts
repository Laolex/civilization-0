import { InMemoryWorldStore } from "@civ/store";
import { FakeEmbedder, MemoryIndex } from "@civ/memory";
import { RuleBasedBeliefReviser } from "@civ/beliefs";
import { ExplainabilityService } from "@civ/explainability";
import { runCitizenTick, type TickDeps } from "@civ/engine";
import type { BrainProvider } from "@civ/brain";
import type { StorageProvider } from "@civ/storage";

/** Build Ada's canonical world and run one tick (the invest decision).
 *  Pure except for the injected brain/storage — use fakes in tests, real 0G in the seed. */
export async function buildAdaScenario(
  brain: BrainProvider,
  storage: StorageProvider,
): Promise<InMemoryWorldStore> {
  const store = new InMemoryWorldStore();
  const embedder = new FakeEmbedder();
  const mem = (id: string, day: number, type: "event" | "relationship", importance: number, summary: string) =>
    store.addMemory({ id, citizenId: "ada", day, type, importance, summary, embedding: embedder.embed(summary) });

  store.upsertCitizen({ id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
  store.upsertCitizen({ id: "marcus", name: "Marcus", occupation: "Investor", age: 41,
    traits: { ambition: 70, empathy: 60, loyalty: 65, curiosity: 50, discipline: 70, riskTolerance: 60 },
    wealth: 100000, reputation: 70, tier: 2, createdDay: 0 });
  store.upsertGoal({ id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true });
  store.upsertRelationship({ citizenId: "ada", otherId: "marcus", trust: 0.7, friendship: 0.5, influence: 0.4 });

  mem("m1", 1, "event", 8, "Marcus helped me when I lost my job");
  mem("m2", 3, "relationship", 7, "Met Marcus, an investor who believed in my idea");
  mem("m3", 7, "event", 7, "Received seed funding from Marcus");
  store.upsertBelief({ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.8, sourceMemoryIds: ["m1"], updatedDay: 7 });

  // Authored stimulus events (no decision) — the backstory the timeline shows.
  store.addEvent({ id: "evt-lostjob", day: 1, type: "quit_job", actorId: "ada", targetId: null, decisionId: null, payload: { label: "Lost her job" } });
  store.addEvent({ id: "evt-met", day: 3, type: "meet", actorId: "ada", targetId: "marcus", decisionId: null, payload: { label: "Met Marcus" } });
  store.addEvent({ id: "evt-funded", day: 7, type: "partner", actorId: "ada", targetId: "marcus", decisionId: null, payload: { label: "Received funding" } });

  store.setWorldState({ day: 12, economy: { inflation: 8 }, headline: "Markets recovering after the downturn" });

  const deps: TickDeps = {
    store, embedder, memoryIndex: new MemoryIndex(store, embedder),
    reviser: new RuleBasedBeliefReviser(), brain, storage,
    explain: new ExplainabilityService(storage),
    clock: { day: 12 }, idgen: (() => { let n = 0; return () => `tick-${++n}`; })(),
  };
  await runCitizenTick(deps, "ada");
  return store;
}
