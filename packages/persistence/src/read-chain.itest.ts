import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";
import { readDecisionChainRaw } from "./read";

beforeAll(async () => {
  await migrate(); await resetWorld();
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits) VALUES ('zoe','Zoe','Builder',28,'{}')`);
  await getPool().query(`INSERT INTO memories (id,citizen_id,day,type,importance,summary) VALUES ('m1','zoe',1,'obs',5,'Met Kai')`);
  await getPool().query(`INSERT INTO beliefs (id,citizen_id,statement,confidence,updated_day) VALUES ('b1','zoe','Trust pays off',0.8,1)`);
  await getPool().query(`INSERT INTO decisions (id,citizen_id,goal_id,day,reasoning,action,target_id,brain_provider,brain_model,meta)
    VALUES ('d1','zoe',null,2,'Back Kai','invest','kai','0xprov','qwen','{"verified":true,"provider":"0xprov","model":"qwen"}')`);
  await getPool().query(`INSERT INTO decision_memories (decision_id,memory_id,weight) VALUES ('d1','m1',0.7)`);
  await getPool().query(`INSERT INTO decision_beliefs (decision_id,belief_id,weight) VALUES ('d1','b1',0.9)`);
  await getPool().query(`INSERT INTO events (id,day,type,actor_id,target_id,decision_id) VALUES ('e1',2,'invest','zoe','kai','d1')`);
  await getPool().query(`INSERT INTO traces (id,decision_id,trace,zg_root_hash,zg_tx_hash) VALUES ('t1','d1','{}','0xroot','0xtx')`);
});
afterAll(async () => { await closePool(); });

it("readDecisionChainRaw assembles the latest decision's full chain", async () => {
  const c = await readDecisionChainRaw(getPool(), "zoe");
  expect(c?.decisionId).toBe("d1");
  expect(c?.action).toBe("invest"); expect(c?.verified).toBe(true);
  expect(c?.memories).toEqual([{ id: "m1", summary: "Met Kai", day: 1, weight: 0.7 }]);
  expect(c?.beliefs[0]).toMatchObject({ id: "b1", weight: 0.9 });
  expect(c?.event).toMatchObject({ id: "e1", type: "invest" });
  expect(c?.rootHash).toBe("0xroot");
});
it("returns null for a citizen with no decisions", async () => {
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits) VALUES ('new','New','Idle',20,'{}')`);
  expect(await readDecisionChainRaw(getPool(), "new")).toBeNull();
});
