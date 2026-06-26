import { InMemoryWorldStore } from "@civ/store";
import { FakeEmbedder, MemoryIndex, GraphRetriever } from "@civ/memory";
import { RuleBasedBeliefReviser } from "@civ/beliefs";
import { FakeBrain } from "@civ/brain";
import { FakeStorage } from "@civ/storage";
import { ExplainabilityService } from "@civ/explainability";
import type { ActionType } from "@civ/shared";
import { runCitizenTick, type TickDeps, type TickResult } from "./index";

export function seedAdaWorld(): { deps: TickDeps; storage: FakeStorage } {
  const store = new InMemoryWorldStore();
  const embedder = new FakeEmbedder();
  const storage = new FakeStorage();

  store.upsertCitizen({ id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
  store.upsertCitizen({ id: "marcus", name: "Marcus", occupation: "Investor", age: 41,
    traits: { ambition: 70, empathy: 60, loyalty: 65, curiosity: 50, discipline: 70, riskTolerance: 60 },
    wealth: 100000, reputation: 70, tier: 2, createdDay: 0 });
  store.upsertGoal({ id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true });
  store.addMemory({ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8,
    summary: "lost job during recession", embedding: embedder.embed("lost job during recession") });
  store.addMemory({ id: "m2", citizenId: "ada", day: 2, type: "relationship", importance: 7,
    summary: "marcus offered funding for a company", embedding: embedder.embed("marcus offered funding for a company") });
  store.upsertBelief({ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy",
    confidence: 0.7, sourceMemoryIds: ["m2"], updatedDay: 2 });
  store.setWorldState({ day: 3, economy: { inflation: 8 }, headline: "Recession deepens" });

  // Scripted brain: start a company with Marcus, then invest, then work.
  // The brain advances its own step per decide() call — one call per tick.
  const plan: ActionType[] = ["start_company", "invest", "work"];
  let step = 0;
  const brain = new FakeBrain((ctx) => {
    const action = plan[Math.min(step, plan.length - 1)];
    step++;
    const targetId = action === "work" ? null : "marcus";
    return {
      action, targetId,
      reasoning: `Day plan: ${action}; goal ${ctx.goal?.description ?? "none"}`,
      memoryWeights: Object.fromEntries(ctx.memories.map((m) => [m.id, 1])),
      beliefWeights: Object.fromEntries(ctx.beliefs.map((b) => [b.id, b.confidence])),
    };
  });

  let n = 0;
  const clock = { day: 3 };
  const deps: TickDeps = {
    store, embedder, memoryIndex: new MemoryIndex(store, embedder),
    graphRetriever: new GraphRetriever(embedder),
    reviser: new RuleBasedBeliefReviser(), brain, storage,
    explain: new ExplainabilityService(storage),
    clock, idgen: () => `id${++n}`,
  };
  return { deps, storage };
}

export async function runDays(deps: TickDeps, citizenId: string, days: number): Promise<TickResult[]> {
  const results: TickResult[] = [];
  for (let i = 0; i < days; i++) {
    const r = await runCitizenTick(deps, citizenId);
    results.push(r);
    deps.clock.day += 1;
  }
  return results;
}
