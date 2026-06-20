import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { WorldRepository } from "./repository";
import { runCitizenTick, type TickDeps } from "@civ/engine";
import { FakeBrain } from "@civ/brain";
import { FakeStorage } from "@civ/storage";
import { FakeEmbedder, MemoryIndex } from "@civ/memory";
import { RuleBasedBeliefReviser } from "@civ/beliefs";
import { ExplainabilityService } from "@civ/explainability";

const repo = new WorldRepository();

beforeAll(async () => {
  await migrate();
  await getPool().query("DELETE FROM memories; DELETE FROM citizens;");
  await repo.upsertCitizenRow({ id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
  await repo.addMemoryRow({ id: "m1", citizenId: "ada", day: 1, type: "event",
    importance: 8, summary: "Lost job", embedding: new Array(64).fill(0).map((_, i) => (i === 0 ? 1 : 0)) });
});
afterAll(async () => { await closePool(); });

describe("WorldRepository.loadContext", () => {
  it("hydrates an InMemoryWorldStore with the citizen and memories", async () => {
    const store = await repo.loadContext("ada");
    expect(store.getCitizen("ada")?.name).toBe("Ada");
    expect(store.getMemories("ada")).toHaveLength(1);
    expect(store.getMemories("ada")[0].embedding).toHaveLength(64);
  });
});

it("persists a tick so its event survives a reload", async () => {
  const store = await repo.loadContext("ada");
  let n = 0; const idgen = () => `t${n++}`;
  const embedder = new FakeEmbedder();
  const deps: TickDeps = { store, embedder, memoryIndex: new MemoryIndex(store, embedder),
    reviser: new RuleBasedBeliefReviser(), brain: new FakeBrain((ctx) => ({ action: "work", targetId: null,
      reasoning: "keep building", memoryWeights: {}, beliefWeights: {} })),
    storage: new FakeStorage(), explain: new ExplainabilityService(new FakeStorage()),
    clock: { day: 2 }, idgen };
  const result = await runCitizenTick(deps, "ada");
  await repo.persistTick(store, result, "ada");

  const { rows } = await getPool().query("SELECT COUNT(*)::int AS c FROM events WHERE actor_id = 'ada'");
  expect(rows[0].c).toBeGreaterThanOrEqual(1);
});
