import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool } from "@civ/persistence";
import { ensureEpoch } from "./genesis";
import { loadGenesis } from "./read";
import { loadWorldEvents } from "./append";
import { GENESIS_PARENT } from "./index";

async function seedCitizen(id: string, world: string, wealth: number) {
  await getPool().query(
    `INSERT INTO citizens (id,name,occupation,age,traits,wealth,world_id)
     VALUES ($1,'C','x',30,'{}'::jsonb,$2,$3) ON CONFLICT (id) DO UPDATE SET wealth=$2, world_id=$3`,
    [id, wealth, world]);
}

describe("ensureEpoch / Genesis", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wg'");
    await getPool().query("DELETE FROM citizens WHERE world_id = 'wg'");
  });
  afterAll(async () => { await closePool(); });

  it("captures current facts as the chain root exactly once, idempotently", async () => {
    await seedCitizen("g1", "wg", 100);
    const g1 = await ensureEpoch(getPool(), "wg");
    expect(g1.kind).toBe("Genesis");
    expect(g1.header.parentHash).toBe(GENESIS_PARENT);
    expect(g1.facts.wealth.find((w) => w.actor === "g1")?.wealth).toBe(100);

    const again = await ensureEpoch(getPool(), "wg"); // idempotent
    expect(again.header.eventId).toBe(g1.header.eventId);

    const evs = await loadWorldEvents(getPool(), "wg");
    expect(evs.length).toBe(1); // only the genesis row
    const loaded = await loadGenesis(getPool(), "wg");
    expect(loaded?.worldHash).toBe(g1.worldHash);
  });

  it("computes a deterministic worldHash for identical facts", async () => {
    await seedCitizen("g1", "wg", 50);
    const a = await ensureEpoch(getPool(), "wg");
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wg'");
    const b = await ensureEpoch(getPool(), "wg");
    expect(a.worldHash).toBe(b.worldHash);
  });
});
