import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool, migrate, WorldRepository } from "@civ/persistence";

const repo = new WorldRepository();
beforeAll(async () => {
  await migrate();
  await getPool().query("DELETE FROM citizens WHERE id = 'econ-zoe'");
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,wealth) VALUES ('econ-zoe','Zoe','Builder',28,'{}',100)`);
});
afterAll(async () => { await getPool().query("DELETE FROM citizens WHERE id = 'econ-zoe'"); await closePool(); });

describe("adjustWealth", () => {
  it("adds a positive delta", async () => {
    await repo.adjustWealth("econ-zoe", 8);
    const r = await getPool().query("SELECT wealth FROM citizens WHERE id='econ-zoe'");
    expect(Number(r.rows[0].wealth)).toBe(108);
  });
  it("floors wealth at 0 on a large negative delta", async () => {
    await repo.adjustWealth("econ-zoe", -1000);
    const r = await getPool().query("SELECT wealth FROM citizens WHERE id='econ-zoe'");
    expect(Number(r.rows[0].wealth)).toBe(0);
  });
});
