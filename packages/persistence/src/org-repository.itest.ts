import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";
import { OrgRepository } from "./org-repository";

const repo = new OrgRepository();
beforeAll(async () => {
  await migrate();
  await resetWorld();
  await repo.createOrg({ id: "o1", name: "Ada Collective", kind: "guild",
    founderId: "ada", treasury: 1000, reputation: 50, goal: "grow influence", createdDay: 0 });
  await repo.addMembership({ orgId: "o1", citizenId: "ada", role: "founder", joinedDay: 0 });
  await repo.addMembership({ orgId: "o1", citizenId: "marcus", role: "member", joinedDay: 1 });
});
afterAll(async () => { await closePool(); });

describe("OrgRepository", () => {
  it("round-trips org + members via loadOrgContext", async () => {
    const ctx = await repo.loadOrgContext("o1");
    expect(ctx?.org.name).toBe("Ada Collective");
    expect(ctx?.org.treasury).toBe(1000);
    expect(ctx?.members).toHaveLength(2);
  });
  it("persistOrgTick writes an event (actor_id=org) + trace and bumps treasury", async () => {
    await repo.persistOrgTick("o1",
      { id: "oe1", day: 1, type: "hire", actorId: "o1", targetId: "lena", decisionId: "od1",
        payload: { orgTick: true, reasoning: "scale up", action: "hire", targetId: "lena" } },
      { id: "ot1", decisionId: "od1", trace: { decision: "hire", goal: "grow influence",
        retrievedMemories: [], beliefs: [], reasoning: "scale up", eventId: "oe1" },
        zgRootHash: "0xroot", zgTxHash: "0xtx" },
      250);
    const { getPool } = await import("./pool");
    const ev = await getPool().query("SELECT COUNT(*)::int c FROM events WHERE actor_id='o1'");
    const org = await repo.getOrg("o1");
    expect(ev.rows[0].c).toBeGreaterThanOrEqual(1);
    expect(org?.treasury).toBe(1250);
  });
});
