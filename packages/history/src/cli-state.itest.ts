import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool, WorldRepository } from "@civ/persistence";
import { ensureEpoch } from "./genesis";
import { civState } from "../scripts/state";

async function seed(id: string, wealth: number) {
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,wealth,world_id)
    VALUES ($1,'C','x',30,'{}'::jsonb,$2,'ws') ON CONFLICT (id) DO UPDATE SET wealth=$2, world_id='ws'`, [id, wealth]);
}

describe("civ state", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    await getPool().query("DELETE FROM history_events WHERE world_id='ws'");
    await getPool().query("DELETE FROM citizens WHERE world_id='ws'");
  });
  afterAll(async () => { await closePool(); });

  it("reconstructs current world facts via fold(genesis ⊕ events)", async () => {
    await seed("c1", 100);
    await ensureEpoch(getPool(), "ws");
    await new WorldRepository().adjustWealth("c1", 8, "d1");
    await getPool().query("UPDATE world_state SET day = 9 WHERE id = 1");
    const out = await civState(getPool(), "ws", 9);
    expect(out.atEpochBaseline).toBe(false);
    expect(out.facts.wealth.find((w) => w.actor === "c1")?.wealth).toBe(108);
  });

  it("returns the Genesis baseline for a pre-epoch tick", async () => {
    await seed("c1", 100);
    const g = await ensureEpoch(getPool(), "ws");
    const out = await civState(getPool(), "ws", -1); // before epoch
    expect(out.atEpochBaseline).toBe(true);
    expect(out.epochId).toBe(g.epochId);
    expect(out.facts.wealth.find((w) => w.actor === "c1")?.wealth).toBe(100);
  });
});
