import { describe, it, expect, beforeAll, beforeEach, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { WorldRepository } from "./repository";
import { resetWorld } from "./testutil";

const pool = getPool();
const repo = new WorldRepository();

async function seed() {
  await pool.query(`INSERT INTO worlds (id,name,owner_id,visibility,population_cap)
    VALUES ('w1','W1',NULL,'public',100),('w2','W2',NULL,'public',100) ON CONFLICT (id) DO NOTHING`);
  const cz = (id: string, world: string, wealth: number) => pool.query(
    `INSERT INTO citizens (id,name,occupation,age,traits,wealth,reputation,tier,created_day,world_id)
     VALUES ($1,$1,'x',30,'{}'::jsonb,$3,50,3,0,$2)`, [id, world, wealth]);
  await cz("ada", "w1", 0); await cz("marcus", "w1", 100000); await cz("lena", "w1", 5000);
  await cz("faraway", "w2", 9); // cross-world, must be excluded
  const rel = (a: string, b: string, t: number, f: number, i: number) => pool.query(
    `INSERT INTO relationships (citizen_id,other_id,trust,friendship,influence) VALUES ($1,$2,$3,$4,$5)`,
    [a, b, t, f, i]);
  await rel("ada", "marcus", 70, 50, 60);
  await rel("ada", "lena", 78, 72, 50);
  await rel("ada", "faraway", 90, 90, 90); // strongest but cross-world -> excluded
  await rel("ada", "ghost", 99, 99, 99);    // no citizens row -> excluded
  await pool.query(`INSERT INTO decisions (id,citizen_id,goal_id,day,reasoning,action,target_id,brain_provider,brain_model)
    VALUES ('d1','marcus',NULL,4,'backed ada','invest','ada','p','m')`);
  await pool.query(`INSERT INTO goals (id,citizen_id,kind,description,progress,active)
    VALUES ('mg','marcus','wealth','grow capital',0.9,true)`);
  await pool.query(`INSERT INTO beliefs (id,citizen_id,statement,confidence,source_memory_ids,updated_day)
    VALUES ('mb','marcus','Ada is promising',0.8,'{}',4)`);
  await pool.query(`INSERT INTO organizations (id,name,kind,founder_id,treasury,reputation,goal,created_day)
    VALUES ('o1','Collective','guild','ada',0,50,'grow',1)`);
  await pool.query(`INSERT INTO memberships (org_id,citizen_id,role,joined_day) VALUES ('o1','ada','founder',1)`);
  await pool.query(`INSERT INTO events (id,day,type,actor_id,target_id,decision_id,payload)
    VALUES ('oe1',3,'partner','o1',NULL,NULL,'{"reasoning":"expand"}'::jsonb)`);
}

beforeAll(async () => { await migrate(); });
afterAll(async () => { await closePool(); });

describe("loadContext graph hydration", () => {
  beforeEach(async () => { await resetWorld(); await seed(); });

  it("hydrates same-world neighbor candidates by trust+influence, with latest move/goal/belief/state", async () => {
    const store = await repo.loadContext("ada");
    const cands = store.getNeighborCandidates("ada");
    // faraway (cross-world) + ghost (no citizens row) excluded; ordered by (trust+influence) desc:
    // marcus 70+60=130 > lena 78+50=128
    expect(cands.map((c) => c.id)).toEqual(["marcus", "lena"]);
    const marcus = cands.find((c) => c.id === "marcus")!;
    expect(marcus.relationship.trust).toBe(70);
    expect(marcus.latestAction).toBe("invest");
    expect(marcus.latestReasoning).toBe("backed ada");
    expect(marcus.topGoal).toBe("grow capital");
    expect(marcus.strongestBelief).toBe("Ada is promising");
    expect(marcus.wealth).toBe(100000);
  });

  it("hydrates org context with the latest mandate", async () => {
    const store = await repo.loadContext("ada");
    const org = store.getOrgContext("ada");
    expect(org?.id).toBe("o1");
    expect(org?.latestAction).toBe("partner");
    expect(org?.latestReasoning).toBe("expand");
  });
});
