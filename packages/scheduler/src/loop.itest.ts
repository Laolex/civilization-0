import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPool, closePool, WorldRepository, migrate, resetWorld } from "@civ/persistence";
import { runDay } from "./loop";
import { FakeBrain } from "@civ/brain";
import { FakeStorage } from "@civ/storage";
import { FakeEmbedder, MemoryIndex } from "@civ/memory";
import { RuleBasedBeliefReviser } from "@civ/beliefs";
import { ExplainabilityService } from "@civ/explainability";
import { InMemoryWorldStore } from "@civ/store";

const repo = new WorldRepository();
beforeAll(async () => {
  await migrate();
  await resetWorld(); // FK-safe TRUNCATE...CASCADE (Task 4b helper) — idempotent on non-fresh DB
  await repo.upsertCitizenRow({ id: "founder", name: "F", occupation: "Founder", age: 30,
    traits: { ambition: 90, empathy: 50, loyalty: 50, curiosity: 70, discipline: 70, riskTolerance: 60 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
});
afterAll(async () => { await closePool(); });

it("runDay ticks tier-3 and persists", async () => {
  let n = 0; const idgen = () => `r${n++}`;
  const makeTickDeps = (store: InMemoryWorldStore, day: number) => {
    const embedder = new FakeEmbedder();
    return { store, embedder, memoryIndex: new MemoryIndex(store, embedder),
      reviser: new RuleBasedBeliefReviser(),
      brain: new FakeBrain(() => ({ action: "work", targetId: null, reasoning: "build", memoryWeights: {}, beliefWeights: {} })),
      storage: new FakeStorage(), explain: new ExplainabilityService(new FakeStorage()),
      clock: { day }, idgen };
  };
  const out = await runDay({ repo, makeTickDeps, citizens: [{ id: "founder", tier: 3 }] }, 3);
  expect(out.ticked).toContain("founder");
  const { rows } = await getPool().query("SELECT day FROM world_state WHERE id = 1");
  expect(rows[0].day).toBe(3);
});
