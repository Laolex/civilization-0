import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool, OrgRepository } from ".";
import { loadWorldEvents } from "@civ/history/src/append";
import { eventKind } from "@civ/history/src/types";

async function seedFounder(id: string) {
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,world_id)
    VALUES ($1,'C','x',30,'{}'::jsonb,'wo') ON CONFLICT (id) DO UPDATE SET world_id='wo'`, [id]);
}
const orgDeltas = async () =>
  (await loadWorldEvents(getPool(), "wo")).map((r) => r.event).filter((e) => eventKind(e) === "OrganizationDelta");

describe("OrganizationDelta coupling", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wo'");
    await getPool().query("DELETE FROM memberships WHERE org_id LIKE 'o-wo-%'");
    await getPool().query("DELETE FROM organizations WHERE id LIKE 'o-wo-%'");
    await getPool().query("DELETE FROM citizens WHERE world_id = 'wo'");
  });
  afterAll(async () => { await closePool(); });

  it("appends a 'founded' delta atomically with the org row", async () => {
    await seedFounder("f1");
    await new OrgRepository().createOrgCoupled(
      { id: "o-wo-1", name: "x", kind: "guild", founderId: "f1", treasury: 0, reputation: 50, goal: "g", createdDay: 1 },
      "wo", 1, "d1");
    const ds = await orgDeltas();
    expect(ds.length).toBe(1);
    expect((ds[0] as any).op).toBe("founded");
    expect((ds[0] as any).orgId).toBe("o-wo-1");
  });

  it("appends a 'member_added' delta atomically with the membership row", async () => {
    await seedFounder("f1"); await seedFounder("m1");
    const repo = new OrgRepository();
    await repo.createOrgCoupled({ id: "o-wo-1", name: "x", kind: "guild", founderId: "f1", treasury: 0, reputation: 50, goal: "g", createdDay: 1 }, "wo", 1, "d1");
    await repo.addMembershipCoupled({ orgId: "o-wo-1", citizenId: "m1", role: "member", joinedDay: 2 }, "wo", 2, "d2");
    const added = (await orgDeltas()).filter((e) => (e as any).op === "member_added");
    expect(added.length).toBe(1);
    expect((added[0] as any).citizenId).toBe("m1");
  });
});
