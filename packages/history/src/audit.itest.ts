import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool, WorldRepository } from "@civ/persistence";
import { ensureEpoch } from "./genesis";
import { proofB, coverage } from "./audit";

async function seed(id: string, wealth: number) {
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,wealth,world_id)
    VALUES ($1,'C','x',30,'{}'::jsonb,$2,'wb') ON CONFLICT (id) DO UPDATE SET wealth=$2, world_id='wb'`, [id, wealth]);
}

describe("Proof B — historical completeness", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wb'");
    await getPool().query("DELETE FROM relationships WHERE citizen_id IN (SELECT id FROM citizens WHERE world_id='wb')");
    await getPool().query("DELETE FROM citizens WHERE world_id = 'wb'");
  });
  afterAll(async () => { await closePool(); });

  it("fold(genesis ⊕ deltas) == legacy, and coverage is 100% on a clean world", async () => {
    await seed("c1", 100);
    await ensureEpoch(getPool(), "wb");          // genesis captures wealth=100
    await new WorldRepository().adjustWealth("c1", 8, "d1"); // wealth→108, WealthDelta(+8)
    const r = await proofB(getPool(), "wb");
    expect(r.ok).toBe(true);
    expect(r.mismatches).toEqual([]);
    const cov = await coverage(getPool(), "wb");
    expect(cov.Economic).toBe(1);
  });

  it("reproduces BOTH directions of an asymmetric relationship pair (B1 regression)", async () => {
    // Legacy relationships are directional: c1→c2 and c2→c1 are independent rows with different
    // values. A canonical/undirected fold key would collapse them last-writer-wins and report
    // spurious Relational drift on this clean, zero-delta world (coverage 0.5 instead of 1).
    await seed("c1", 100);
    await seed("c2", 100);
    await getPool().query(
      `INSERT INTO relationships (citizen_id,other_id,trust,friendship,influence)
       VALUES ('c1','c2',65,55,70),('c2','c1',70,50,60)
       ON CONFLICT (citizen_id,other_id) DO UPDATE
         SET trust=EXCLUDED.trust, friendship=EXCLUDED.friendship, influence=EXCLUDED.influence`);
    await ensureEpoch(getPool(), "wb"); // genesis captures both directional rows
    const r = await proofB(getPool(), "wb");
    expect(r.ok).toBe(true);
    expect(r.mismatches).toEqual([]);
    const cov = await coverage(getPool(), "wb");
    expect(cov.Relational).toBe(1);
  });

  it("detects drift when legacy is mutated without a delta event", async () => {
    await seed("c1", 100);
    await ensureEpoch(getPool(), "wb");
    await getPool().query("UPDATE citizens SET wealth = 999 WHERE id = 'c1'"); // raw mutation, no event
    const r = await proofB(getPool(), "wb");
    expect(r.ok).toBe(false);
    expect(r.mismatches.some((m) => m.dim === "Economic")).toBe(true);
  });
});
