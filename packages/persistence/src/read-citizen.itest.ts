import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";
import { readCitizen, readRelationships, readGoals } from "./read";

beforeAll(async () => {
  await migrate(); await resetWorld();
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,wealth,reputation,tier,created_day)
    VALUES ('zoe','Zoe','Builder',28,'{"ambition":80}',100,55,2,3)`);
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits) VALUES ('kai','Kai','Trader',40,'{}')`);
  await getPool().query(`INSERT INTO relationships (citizen_id,other_id,trust,friendship,influence) VALUES ('zoe','kai',0.6,0.4,0.5)`);
  await getPool().query(`INSERT INTO goals (id,citizen_id,kind,description,progress,active) VALUES ('g1','zoe','wealth','get rich',0.2,true)`);
});
afterAll(async () => { await closePool(); });

describe("citizen profile reads", () => {
  it("readCitizen returns the profile or null", async () => {
    const c = await readCitizen(getPool(), "zoe");
    expect(c).toMatchObject({ id: "zoe", name: "Zoe", occupation: "Builder", tier: 2, createdDay: 3 });
    expect(c?.traits.ambition).toBe(80);
    expect(await readCitizen(getPool(), "nobody")).toBeNull();
  });
  it("readRelationships returns the citizen's edges", async () => {
    const r = await readRelationships(getPool(), "zoe");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ otherId: "kai", trust: 0.6 });
  });
  it("readGoals returns the citizen's goals", async () => {
    const g = await readGoals(getPool(), "zoe");
    expect(g[0]).toMatchObject({ id: "g1", kind: "wealth", description: "get rich", active: true });
  });
});
