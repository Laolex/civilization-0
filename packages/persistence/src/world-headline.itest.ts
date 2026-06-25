import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPool, closePool } from "./pool";
import { WorldRepository } from "./repository";

const wid = "itest-we-world";
const cid = "itest-we-citizen";
const repo = new WorldRepository();

beforeAll(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM citizens WHERE id = $1", [cid]);
  await pool.query("DELETE FROM worlds WHERE id = $1", [wid]);
  await pool.query(
    "INSERT INTO worlds (id,name,owner_id,visibility,population_cap,headline) VALUES ($1,'WE','itest-u','private',50,'')",
    [wid]);
  await pool.query(
    `INSERT INTO citizens (id,name,occupation,age,traits,wealth,reputation,tier,created_day,world_id)
     VALUES ($1,'Cit','Engineer',30,'{}'::jsonb,0,50,3,0,$2)`,
    [cid, wid]);
});

afterAll(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM citizens WHERE id = $1", [cid]);
  await pool.query("DELETE FROM worlds WHERE id = $1", [wid]);
  await closePool();
});

describe("world headline overlay", () => {
  it("overlays a non-empty world headline onto the citizen's world state", async () => {
    await repo.setWorldHeadline(wid, "A plague sweeps the land");
    const store = await repo.loadContext(cid);
    expect(store.getWorldState().headline).toBe("A plague sweeps the land");
  });

  it("falls back to the global world_state headline when the world headline is empty", async () => {
    await repo.setWorldHeadline(wid, "");
    const store = await repo.loadContext(cid);
    // global world_state.headline (seeded/whatever it is) — NOT the world override.
    const global = await getPool().query("SELECT headline FROM world_state WHERE id = 1");
    expect(store.getWorldState().headline).toBe(global.rows[0].headline);
  });
});
