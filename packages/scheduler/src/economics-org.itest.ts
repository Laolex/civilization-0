import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool, migrate, OrgRepository } from "@civ/persistence";
import { FakeBrain } from "@civ/brain";
import { FakeStorage } from "@civ/storage";
import { ExplainabilityService } from "@civ/explainability";
import { runOrgDay } from "./org-loop";
import { economicDelta } from "./economics";
import type { OrgTickDeps } from "./org-tick";

const repo = new OrgRepository();
beforeAll(async () => {
  await migrate();
  await getPool().query("DELETE FROM memberships WHERE org_id = 'econ-o1'");
  await getPool().query("DELETE FROM organizations WHERE id = 'econ-o1'");
  await repo.createOrg({ id: "econ-o1", name: "Econ Guild", kind: "guild",
    founderId: "econ-founder", treasury: 500, reputation: 50, goal: "grow influence", createdDay: 0 });
  await repo.addMembership({ orgId: "econ-o1", citizenId: "econ-founder", role: "founder", joinedDay: 0 });
});
afterAll(async () => {
  await getPool().query("DELETE FROM memberships WHERE org_id = 'econ-o1'");
  await getPool().query("DELETE FROM organizations WHERE id = 'econ-o1'");
  await closePool();
});

describe("org treasury economics", () => {
  it("moves the org treasury by economicDelta of the tick's action", async () => {
    let n = 0; const idgen = () => `econ-o-${n++}`;
    const makeOrgTickDeps = (day: number): OrgTickDeps => ({
      brain: new FakeBrain(() => ({ action: "hire", targetId: "lena", reasoning: "scale",
        memoryWeights: {}, beliefWeights: {} })),
      storage: new FakeStorage(), explain: new ExplainabilityService(new FakeStorage()),
      clock: { day }, idgen,
    });
    const out = await runOrgDay({ repo, makeOrgTickDeps, orgIds: ["econ-o1"] }, 3);
    expect(out.ticked).toContain("econ-o1");
    const r = await getPool().query("SELECT treasury FROM organizations WHERE id='econ-o1'");
    expect(Number(r.rows[0].treasury)).toBe(500 + economicDelta("hire"));
  });
});
