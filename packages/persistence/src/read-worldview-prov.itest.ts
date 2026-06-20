import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";
import { readWorldView } from "./read";

beforeAll(async () => {
  await migrate(); await resetWorld();
  await getPool().query(`INSERT INTO events (id,day,type,actor_id,target_id,decision_id,payload,zg_root_hash)
    VALUES ('e1',1,'work','ada',null,null,'{}','0xfeed')`);
});
afterAll(async () => { await closePool(); });

it("readWorldView carries each event's 0G root hash", async () => {
  const v = await readWorldView(getPool(), 10);
  const e = v.recentEvents.find((x) => x.id === "e1");
  expect(e?.rootHash).toBe("0xfeed");
});
