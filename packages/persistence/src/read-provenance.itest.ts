import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";
import { readWorlds, exportProvenance } from "./read";

beforeAll(async () => {
  await migrate(); await resetWorld();
  await getPool().query("DELETE FROM worlds WHERE id = 'w-it'");
  await getPool().query("INSERT INTO worlds (id,name,owner_id,visibility,population_cap) VALUES ('w-it','It','o1','private',100)");
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,world_id) VALUES ('zoe','Zoe','Builder',28,'{}','w-it')`);
  await getPool().query(`INSERT INTO decisions (id,citizen_id,goal_id,day,reasoning,action,target_id,brain_provider,brain_model,meta)
    VALUES ('d1','zoe',null,2,'Back Kai','invest','kai','p','m','{"verified":true}')`);
  await getPool().query(`INSERT INTO decision_memories (decision_id,memory_id,weight) VALUES ('d1','m1',0.7)`);
  await getPool().query(`INSERT INTO traces (id,decision_id,trace,zg_root_hash) VALUES ('t1','d1','{}','0xabc')`);
});
afterAll(async () => { await getPool().query("DELETE FROM worlds WHERE id = 'w-it'"); await closePool(); });

it("readWorlds returns public worlds plus the owner's private worlds with population", async () => {
  const pub = await readWorlds(getPool());
  expect(pub.find((w) => w.id === "genesis")).toBeTruthy();
  expect(pub.find((w) => w.id === "w-it")).toBeFalsy(); // private, not owned in this call
  const owned = await readWorlds(getPool(), "o1");
  const mine = owned.find((w) => w.id === "w-it");
  expect(mine).toMatchObject({ visibility: "private", population: 1 });
});
it("exportProvenance returns 0G-reasoned records with drivers + verifyUrl", async () => {
  const recs = await exportProvenance(getPool(), { worldId: "w-it" });
  expect(recs[0]).toMatchObject({ decisionId: "d1", agent: "zoe", verified: true, rootHash: "0xabc", verifyUrl: "/verify/0xabc" });
  expect(recs[0].decision.action).toBe("invest");
  expect(recs[0].drivers.memories[0]).toMatchObject({ id: "m1", weight: 0.7 });
});
