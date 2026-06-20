import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";
import { createCitizen } from "./citizen-write";
import { readCitizen, readGoals } from "./read";

beforeAll(async () => { await migrate(); await resetWorld(); });
afterAll(async () => { await closePool(); });

it("createCitizen inserts a citizen, a backstory memory, and a goal", async () => {
  await createCitizen({ id: "zoe", name: "Zoe", occupation: "Builder", age: 28,
    traits: { ambition: 80, empathy: 40, loyalty: 50, curiosity: 60, discipline: 70, riskTolerance: 55 },
    tier: 2, createdDay: 3, backstory: "Grew up fixing engines.", goal: "Build a workshop." });
  const c = await readCitizen(getPool(), "zoe");
  expect(c).toMatchObject({ id: "zoe", name: "Zoe", tier: 2, reputation: 50 });
  const g = await readGoals(getPool(), "zoe");
  expect(g[0]?.description).toBe("Build a workshop.");
  const m = await getPool().query("SELECT type, summary FROM memories WHERE citizen_id = 'zoe'");
  expect(m.rows[0]).toMatchObject({ type: "backstory", summary: "Grew up fixing engines." });
});
it("the backstory memory carries a 64-dim embedding (so the scheduler tick won't crash)", async () => {
  // Regression: a NULL-embedding memory makes the engine's cosineSimilarity throw
  // a length-mismatch (64 vs 0) on the next tick.
  const r = await getPool().query("SELECT embedding IS NOT NULL AS has_emb, vector_dims(embedding) AS dims FROM memories WHERE id = 'zoe-backstory'");
  expect(r.rows[0].has_emb).toBe(true);
  expect(r.rows[0].dims).toBe(64);
});
it("is idempotent on repeated id", async () => {
  await createCitizen({ id: "zoe", name: "Zoe2", occupation: "x", age: 1, traits: {}, tier: 1, createdDay: 0 });
  const c = await readCitizen(getPool(), "zoe");
  expect(c?.name).toBe("Zoe"); // original kept (ON CONFLICT DO NOTHING)
});
