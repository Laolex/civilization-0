import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { createWorld, worldPopulation, PLAN_LIMITS } from "./world-write";

beforeAll(async () => { await migrate(); await getPool().query("DELETE FROM worlds WHERE owner_id LIKE 'itest-%'"); });
afterAll(async () => { await getPool().query("DELETE FROM worlds WHERE owner_id LIKE 'itest-%'"); await closePool(); });

describe("world-write", () => {
  it("a free user cannot create a private world", async () => {
    await expect(createWorld({ ownerId: "itest-free", ownerPlan: "free", name: "W", visibility: "private" })).rejects.toThrow();
  });
  it("a pro user creates a private world with the pro population cap", async () => {
    const { id } = await createWorld({ ownerId: "itest-pro", ownerPlan: "pro", name: "Atlas", visibility: "private" });
    const r = await getPool().query("SELECT visibility, population_cap FROM worlds WHERE id = $1", [id]);
    expect(r.rows[0]).toMatchObject({ visibility: "private", population_cap: PLAN_LIMITS.pro.populationCap });
    expect(await worldPopulation(id)).toBe(0);
  });
});
