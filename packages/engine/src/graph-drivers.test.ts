import { describe, it, expect } from "vitest";
import { InMemoryWorldStore } from "@civ/store";
import { FakeEmbedder, MemoryIndex, GraphRetriever } from "@civ/memory";
import { RuleBasedBeliefReviser } from "@civ/beliefs";
import { FakeBrain } from "@civ/brain";
import { FakeStorage } from "@civ/storage";
import { ExplainabilityService } from "@civ/explainability";
import { runCitizenTick, type TickDeps } from "./index";
import type { DecisionContext } from "@civ/brain";

function setup() {
  const store = new InMemoryWorldStore();
  const embedder = new FakeEmbedder();
  store.upsertCitizen({ id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
  store.upsertGoal({ id: "g1", citizenId: "ada", kind: "wealth", description: "capital", progress: 0.1, active: true });
  store.setWorldState({ day: 5, economy: {}, headline: "Boom" });
  store.setNeighborCandidates("ada", [{
    id: "marcus", name: "Marcus", relationship: { trust: 70, friendship: 50, influence: 60 },
    latestAction: "invest", latestReasoning: "capital", topGoal: "capital", wealth: 100000, reputation: 70,
  }]);
  store.setOrgContext("ada", { id: "o1", name: "Collective", kind: "guild", latestAction: "partner", latestReasoning: "grow" });

  let captured: DecisionContext | null = null;
  const brain = new FakeBrain((ctx) => {
    captured = ctx;
    return { action: "work", targetId: null, reasoning: "r", memoryWeights: {}, beliefWeights: {} };
  });
  const storage = new FakeStorage();
  let n = 0;
  const deps: TickDeps = {
    store, embedder, memoryIndex: new MemoryIndex(store, embedder),
    graphRetriever: new GraphRetriever(embedder),
    reviser: new RuleBasedBeliefReviser(), brain, storage,
    explain: new ExplainabilityService(storage),
    clock: { day: 5 }, idgen: () => `id${++n}`,
  };
  return { deps, storage, getCaptured: () => captured };
}

describe("engine social retrieval", () => {
  it("passes selected neighbors + org into the brain context", async () => {
    const { deps, getCaptured } = setup();
    const r = await runCitizenTick(deps, "ada");
    const ctx = getCaptured()!;
    expect(ctx.neighbors?.[0].summary.id).toBe("marcus");
    expect(ctx.orgContext?.id).toBe("o1");
    expect(r.decision.action).toBe("work");
  });

  it("records socialDrivers + orgDriver in the archived trace record", async () => {
    const { deps, storage } = setup();
    const r = await runCitizenTick(deps, "ada");
    const rec = storage.calls.find((c) => c.key === `trace/${r.decision.id}`)!.data as any;
    expect(rec.drivers.socialDrivers[0].id).toBe("marcus");
    expect(rec.drivers.socialDrivers[0].blendedScore).toBeGreaterThan(0);
    expect(rec.drivers.orgDriver.id).toBe("o1");
    // raw retrieval inputs — needed for independent verifiability
    expect(typeof rec.drivers.socialDrivers[0].trust).toBe("number");
    expect(typeof rec.drivers.socialDrivers[0].influence).toBe("number");
    expect(rec.drivers.socialDrivers[0].neighborText.length).toBeGreaterThan(0);
    expect(typeof rec.drivers.socialQuery).toBe("string");
    expect(rec.drivers.socialQuery.length).toBeGreaterThan(0);
  });

  it("mirrors socialDrivers into decision.meta for the UI", async () => {
    const { deps } = setup();
    const result = await runCitizenTick(deps, "ada");
    const drivers = result.decision.meta?.socialDrivers;
    expect(Array.isArray(drivers)).toBe(true);
    expect(drivers!.length).toBeGreaterThan(0);
    const d = drivers![0];
    expect(d).toMatchObject({
      id: expect.any(String), name: expect.any(String),
      relationshipStrength: expect.any(Number), relevance: expect.any(Number),
      blendedScore: expect.any(Number), trust: expect.any(Number),
      influence: expect.any(Number), neighborText: expect.any(String),
    });
    expect(result.decision.meta?.socialQuery).toEqual(expect.any(String));
  });

  it("degrades to empty socialDrivers when no graphRetriever is wired", async () => {
    const { deps, storage } = setup();
    const r = await runCitizenTick({ ...deps, graphRetriever: undefined }, "ada");
    const rec = storage.calls.find((c) => c.key === `trace/${r.decision.id}`)!.data as any;
    expect(rec.drivers.socialDrivers).toEqual([]);
  });
});
