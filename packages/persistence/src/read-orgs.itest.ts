import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";
import { OrgRepository } from "./org-repository";
import { readOrg, readOrgList } from "./read";

const repo = new OrgRepository();
beforeAll(async () => {
  await migrate();
  await resetWorld();
  await repo.createOrg({ id: "o1", name: "Ada Collective", kind: "guild",
    founderId: "ada", treasury: 500, reputation: 60, goal: "grow influence", createdDay: 0 });
  await repo.addMembership({ orgId: "o1", citizenId: "ada", role: "founder", joinedDay: 0 });
  await repo.addMembership({ orgId: "o1", citizenId: "marcus", role: "member", joinedDay: 1 });
  await repo.persistOrgTick("o1",
    { id: "oe1", day: 2, type: "hire", actorId: "o1", targetId: "lena", decisionId: "od1",
      payload: { orgTick: true, reasoning: "scale the guild", action: "hire", targetId: "lena" } },
    { id: "ot1", decisionId: "od1", trace: { decision: "hire", goal: "grow influence",
      retrievedMemories: [], beliefs: [], reasoning: "scale the guild", eventId: "oe1" },
      zgRootHash: "0xroot123", zgTxHash: "0xtx" }, 0);
});
afterAll(async () => { await closePool(); });

describe("readOrg / readOrgList", () => {
  it("readOrg returns members and the org's 0G-archived decision", async () => {
    const v = await readOrg(getPool(), "o1");
    expect(v?.name).toBe("Ada Collective");
    expect(v?.members).toHaveLength(2);
    expect(v?.decisions[0]).toMatchObject({ action: "hire", reasoning: "scale the guild", rootHash: "0xroot123" });
  });
  it("readOrgList returns orgs with member counts", async () => {
    const list = await readOrgList(getPool());
    const o1 = list.find((o) => o.id === "o1");
    expect(o1?.memberCount).toBe(2);
  });
});
