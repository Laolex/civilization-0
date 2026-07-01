import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool, WorldRepository } from ".";

async function seed(id: string, wealth: number) {
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,wealth,world_id)
    VALUES ($1,'C','x',30,'{}'::jsonb,$2,'wpa') ON CONFLICT (id) DO UPDATE SET wealth=$2, world_id='wpa'`, [id, wealth]);
}

describe("Proof A — transactional faithfulness", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    delete process.env.HISTORY_ENFORCE;
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wpa'");
    await getPool().query("DELETE FROM citizens WHERE world_id = 'wpa'");
  });
  afterAll(async () => { await closePool(); });

  it("a faithful wealth mutation commits under enforcement", async () => {
    process.env.HISTORY_ENFORCE = "1";
    await seed("c1", 100);
    await expect(new WorldRepository().adjustWealth("c1", 8, "d1")).resolves.toBeUndefined();
    const w = await getPool().query("SELECT wealth FROM citizens WHERE id='c1'");
    expect(Number(w.rows[0].wealth)).toBe(108);
  });
});
