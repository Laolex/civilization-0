import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool, migrate, resetWorld, OrgRepository, readOrg } from "@civ/persistence";
import { FakeBrain } from "@civ/brain";
import { FakeStorage } from "@civ/storage";
import { ExplainabilityService } from "@civ/explainability";
import { runOrgDay } from "./org-loop";
import type { OrgTickDeps } from "./org-tick";

const repo = new OrgRepository();
beforeAll(async () => {
  await migrate();
  await resetWorld();
  await repo.createOrg({ id: "o1", name: "Ada Collective", kind: "guild",
    founderId: "ada", treasury: 1000, reputation: 50, goal: "grow influence", createdDay: 0 });
  await repo.addMembership({ orgId: "o1", citizenId: "ada", role: "founder", joinedDay: 0 });
});
afterAll(async () => { await closePool(); });

it("runOrgDay ticks an org and persists its 0G-path decision", async () => {
  let n = 0; const idgen = () => `o-${n++}`;
  const makeOrgTickDeps = (day: number): OrgTickDeps => ({
    brain: new FakeBrain(() => ({ action: "hire", targetId: "lena", reasoning: "scale",
      memoryWeights: {}, beliefWeights: {} })),
    storage: new FakeStorage(), explain: new ExplainabilityService(new FakeStorage()),
    clock: { day }, idgen,
  });
  const out = await runOrgDay({ repo, makeOrgTickDeps, orgIds: ["o1"] }, 3);
  expect(out.ticked).toContain("o1");
  const ev = await getPool().query("SELECT COUNT(*)::int c FROM events WHERE actor_id = 'o1'");
  expect(ev.rows[0].c).toBeGreaterThanOrEqual(1);
});

it("org decision is read back via readOrg with a root hash (full chain)", async () => {
  let n = 0; const idgen = () => `c-${n++}`;
  const makeOrgTickDeps = (day: number): OrgTickDeps => ({
    brain: new FakeBrain(() => ({ action: "partner", targetId: "marcus", reasoning: "form an alliance",
      memoryWeights: {}, beliefWeights: {} })),
    storage: new FakeStorage(), explain: new ExplainabilityService(new FakeStorage()),
    clock: { day }, idgen,
  });
  await runOrgDay({ repo, makeOrgTickDeps, orgIds: ["o1"] }, 5);
  const view = await readOrg(getPool(), "o1");
  expect(view).not.toBeNull();
  const partner = view!.decisions.find((d) => d.action === "partner");
  expect(partner).toBeTruthy();
  expect(partner!.reasoning).toBe("form an alliance");
  expect(partner!.rootHash).toMatch(/^0xfake/);
});
