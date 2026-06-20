import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";
import { searchEvents, listEventTypes } from "./read";

beforeAll(async () => {
  await migrate();
  await resetWorld();
  // citizen-authored event with a trace carrying reasoning + root hash
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits) VALUES ('ada','Ada','Engineer',30,'{}')`);
  await getPool().query(`INSERT INTO decisions (id,citizen_id,goal_id,day,reasoning,action,target_id,brain_provider,brain_model)
    VALUES ('d1','ada',null,2,'I will build','work',null,'p','m')`);
  await getPool().query(`INSERT INTO events (id,day,type,actor_id,target_id,decision_id,payload)
    VALUES ('e1',2,'work','ada',null,'d1','{}')`);
  await getPool().query(`INSERT INTO traces (id,decision_id,trace,zg_root_hash)
    VALUES ('t1','d1','{"reasoning":"I will build"}','0xaaa')`);
  // org event with reasoning + root in payload/trace
  await getPool().query(`INSERT INTO events (id,day,type,actor_id,target_id,decision_id,payload,zg_root_hash)
    VALUES ('e2',3,'invest','ada-collective','ada','d2','{"orgTick":true,"reasoning":"grow"}','0xbbb')`);
});
afterAll(async () => { await closePool(); });

describe("searchEvents", () => {
  it("finds events where the citizen is actor or target, newest first, with 0G provenance", async () => {
    const rows = await searchEvents(getPool(), { actorId: "ada" });
    expect(rows.map((r) => r.id)).toEqual(["e2", "e1"]); // e2 day3 (target=ada), e1 day2 (actor=ada)
    expect(rows[1]).toMatchObject({ id: "e1", reasoning: "I will build", rootHash: "0xaaa" });
    expect(rows[0]).toMatchObject({ id: "e2", reasoning: "grow", rootHash: "0xbbb" });
  });
  it("filters by type", async () => {
    const rows = await searchEvents(getPool(), { type: "invest" });
    expect(rows.map((r) => r.id)).toEqual(["e2"]);
  });
  it("listEventTypes returns distinct types", async () => {
    const types = await listEventTypes(getPool());
    expect(types).toContain("work"); expect(types).toContain("invest");
  });
});
