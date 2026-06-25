import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPool, closePool } from "./pool";
import { WorldRepository } from "./repository";

const wid = "itest-dl-world";
const cid = "itest-dl-citizen";
const repo = new WorldRepository();

beforeAll(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM citizens WHERE id = $1", [cid]);
  await pool.query("DELETE FROM worlds WHERE id = $1", [wid]);
  await pool.query(
    "INSERT INTO worlds (id,name,owner_id,visibility,population_cap) VALUES ($1,'DL','itest-u','private',50)",
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

describe("forced actions persistence", () => {
  it("loadContext hydrates a forced_actions set written by setForcedActions", async () => {
    await repo.setForcedActions(cid, ["work", "quit_job"]);
    const store = await repo.loadContext(cid);
    expect(store.getForcedActions(cid)).toEqual(["work", "quit_job"]);
  });

  it("clearForcedActions resets the column to null (loadContext sees no dilemma)", async () => {
    await repo.setForcedActions(cid, ["work", "invest"]);
    await repo.clearForcedActions(cid);
    const store = await repo.loadContext(cid);
    expect(store.getForcedActions(cid)).toBeNull();
  });
});
