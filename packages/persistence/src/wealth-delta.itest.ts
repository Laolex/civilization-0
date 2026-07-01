import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool, WorldRepository } from ".";
import { loadWorldEvents } from "@civ/history/src/append";
import { eventKind } from "@civ/history/src/types";

async function seed(id: string, wealth: number) {
  await getPool().query(
    `INSERT INTO citizens (id,name,occupation,age,traits,wealth,world_id)
     VALUES ($1,'C','x',30,'{}'::jsonb,$2,'wd') ON CONFLICT (id) DO UPDATE SET wealth=$2, world_id='wd'`,
    [id, wealth]);
}
const wealthDeltas = async () =>
  (await loadWorldEvents(getPool(), "wd")).map((r) => r.event).filter((e) => eventKind(e) === "WealthDelta");

describe("adjustWealth coupling", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wd'");
    await getPool().query("DELETE FROM citizens WHERE world_id = 'wd'");
  });
  afterAll(async () => { await closePool(); });

  it("appends a WealthDelta recording the actual applied delta (unclamped case)", async () => {
    await seed("c1", 100);
    await new WorldRepository().adjustWealth("c1", 8, "d1");
    const ds = await wealthDeltas();
    expect(ds.length).toBe(1);
    expect((ds[0] as any).delta).toBe(8);
    expect((ds[0] as any).actor).toBe("c1");
  });

  it("records the CLAMPED actual delta, not the requested one", async () => {
    await seed("c1", 5);
    await new WorldRepository().adjustWealth("c1", -15, "d2"); // wealth 5 → 0, actual delta = -5
    const ds = await wealthDeltas();
    expect((ds[0] as any).delta).toBe(-5);
    const w = await getPool().query("SELECT wealth FROM citizens WHERE id='c1'");
    expect(Number(w.rows[0].wealth)).toBe(0);
  });

  it("no-ops (no event) when requested delta is 0", async () => {
    await seed("c1", 10);
    await new WorldRepository().adjustWealth("c1", 0);
    expect((await wealthDeltas()).length).toBe(0);
  });

  it("two same-actor same-tick calls with no decisionId both succeed and produce distinct events", async () => {
    await seed("c1", 100);
    const repo = new WorldRepository();
    await repo.adjustWealth("c1", 8);
    await repo.adjustWealth("c1", -1000);
    const ds = await wealthDeltas();
    expect(ds.length).toBe(2);
    expect((ds[0] as any).header.eventId).not.toBe((ds[1] as any).header.eventId);
  });
});
