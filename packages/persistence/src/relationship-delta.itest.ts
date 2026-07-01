import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool } from ".";
import { append } from "@civ/history/src/append";
import { loadWorldEvents } from "@civ/history/src/append";
import { eventKind } from "@civ/history/src/types";

// persistTick is heavy; test the extracted helper appendRelationshipDeltas directly.
import { appendRelationshipDeltas } from "./repository";

async function seedRel(world: string, a: string, b: string, trust: number, friendship: number, influence: number) {
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,world_id)
    VALUES ($1,'C','x',30,'{}'::jsonb,$2) ON CONFLICT (id) DO UPDATE SET world_id=$2`, [a, world]);
  await getPool().query(`INSERT INTO relationships VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (citizen_id,other_id) DO UPDATE SET trust=$3,friendship=$4,influence=$5`, [a, b, trust, friendship, influence]);
}
const relDeltas = async (world: string) =>
  (await loadWorldEvents(getPool(), world)).map((r) => r.event).filter((e) => eventKind(e) === "RelationshipDelta");

describe("RelationshipDelta coupling", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wr'");
    await getPool().query("DELETE FROM relationships WHERE citizen_id IN (SELECT id FROM citizens WHERE world_id='wr')");
    await getPool().query("DELETE FROM citizens WHERE world_id = 'wr'");
  });
  afterAll(async () => { await closePool(); });

  it("appends one delta per changed field with new-minus-old magnitude", async () => {
    await seedRel("wr", "a", "b", 10, 10, 10);
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      // new state: trust 14 (+4), friendship 10 (0 → no event), influence 7 (-3)
      await appendRelationshipDeltas(client, "wr", 3, "a", "b", { trust: 14, friendship: 10, influence: 7 }, "d1");
      await client.query("COMMIT");
    } finally { client.release(); }
    const ds = (await relDeltas("wr")).map((e) => ({ field: (e as any).field, delta: (e as any).delta }));
    expect(ds).toEqual(expect.arrayContaining([{ field: "trust", delta: 4 }, { field: "influence", delta: -3 }]));
    expect(ds.find((d) => d.field === "friendship")).toBeUndefined();
  });
});
