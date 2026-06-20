# Economics / Treasury — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development. Steps use checkbox (`- [ ]`) syntax.

**Goal:** Give the world economic stakes — each citizen tick adjusts the citizen's wealth and each org tick adjusts the org's treasury, by a deterministic per-action delta, so wealth/treasury actually move over the autonomous days (visible on `/citizens/[id]` and `/orgs/[id]`) and feed back into reasoning (next tick's loadContext reads updated wealth).

**Architecture:** Post-decision economics applied in the **scheduler + persistence** layers — the engine (`packages/engine`) and WorldStore (`packages/store`) stay **byte-for-byte unchanged**. A pure `economicDelta(action)` maps an action to a signed delta. Citizen wealth: new `WorldRepository.adjustWealth(id, delta)` called in `runDay` after `persistTick`. Org treasury: `persistOrgTick` ALREADY applies its `treasuryDelta` arg (org-repository.ts:59) — `runOrgDay` just passes `economicDelta(action)` instead of `0`.

**Tech Stack:** pnpm 9.15.4 / Node 20, TypeScript ESM, Vitest, Postgres 16.

## Global Constraints
- **Engine + WorldStore UNCHANGED:** `git diff --stat 20a2c48..HEAD -- packages/engine packages/store` EMPTY at every task.
- **DB ISOLATION (critical — a live demo + autonomous scheduler share the civ0 DB):** run ALL integration tests against the isolated test DB by PREFIXING the command with `DATABASE_URL="postgres://civ:civ-local@127.0.0.1:5432/civ0_test"` — e.g. `DATABASE_URL="postgres://civ:civ-local@127.0.0.1:5432/civ0_test" pnpm test:it <path>`. dotenv-cli does NOT override an already-set env var, so this routes itests to civ0_test and NEVER touches the live civ0 data. NEVER run `pnpm test:it` without that prefix.
- `economics.ts` is pure (no imports beyond `@civ/shared` types if needed). Unit tests are network-free `*.test.ts`.
- **Commits:** NO `Co-Authored-By`. **Subagents' git is sandbox-denied** — do ALL work + gates, STAGE NOTHING; the controller commits.
- Shell resets cwd between bash calls — prefix `cd /opt/civilization-0 && `.
- Branch: `feat/economics-treasury` (already checked out; base `20a2c48`).

---

### Task 1: pure `economicDelta` module

**Files:** Create `packages/scheduler/src/economics.ts`; Test `packages/scheduler/src/economics.test.ts`.

**Interfaces — Produces:** `export function economicDelta(action: string): number;`

- [ ] **Step 1: failing test** — `packages/scheduler/src/economics.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { economicDelta } from "./economics";

describe("economicDelta", () => {
  it("rewards productive actions and charges for big moves", () => {
    expect(economicDelta("work")).toBeGreaterThan(0);
    expect(economicDelta("partner")).toBeGreaterThan(0);
    expect(economicDelta("start_company")).toBeLessThan(0);
    expect(economicDelta("hire")).toBeLessThan(0);
    expect(economicDelta("invest")).toBeLessThan(0);
  });
  it("is deterministic and 0 for unknown/neutral actions", () => {
    expect(economicDelta("join")).toBe(0);
    expect(economicDelta("something_else")).toBe(0);
    expect(economicDelta("work")).toBe(economicDelta("work"));
  });
});
```
- [ ] **Step 2:** `cd /opt/civilization-0 && pnpm test economics` → FAIL.
- [ ] **Step 3: implement** `packages/scheduler/src/economics.ts`
```ts
// Deterministic per-action economic delta applied to a citizen's wealth or an
// org's treasury after each tick. Post-decision only — the engine is unchanged.
const DELTA: Record<string, number> = {
  work: 8, trade: 6, partner: 5, lead: 3,
  invest: -15, hire: -12, create_org: -10, start_company: -25,
  join: 0, leave: 0,
};
export function economicDelta(action: string): number {
  return DELTA[action] ?? 0;
}
```
- [ ] **Step 4:** `pnpm test economics` → PASS.
- [ ] **Step 5: (Controller) commit** `feat(scheduler): economicDelta per-action ledger` — files `economics.ts`, `economics.test.ts`.

---

### Task 2: citizen wealth — `adjustWealth` + wire into `runDay`

**Files:** Modify `packages/persistence/src/repository.ts` (add `adjustWealth`); Modify `packages/scheduler/src/loop.ts` (call it); Test `packages/scheduler/src/economics-citizen.itest.ts`.

**Interfaces:**
- Produces: `WorldRepository.adjustWealth(citizenId: string, delta: number): Promise<void>` — `UPDATE citizens SET wealth = GREATEST(0, wealth + $2) WHERE id = $1` (floored at 0).
- `runDay` calls `await deps.repo.adjustWealth(id, economicDelta(result.decision.action))` right after `persistTick` (only when delta ≠ 0 is fine, but calling with 0 is harmless).

- [ ] **Step 1: failing itest** — `packages/scheduler/src/economics-citizen.itest.ts` (uses civ0_test; cleans its own rows, NO resetWorld so it never wipes shared data)
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool, migrate, WorldRepository } from "@civ/persistence";

const repo = new WorldRepository();
beforeAll(async () => {
  await migrate();
  await getPool().query("DELETE FROM citizens WHERE id = 'econ-zoe'");
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,wealth) VALUES ('econ-zoe','Zoe','Builder',28,'{}',100)`);
});
afterAll(async () => { await getPool().query("DELETE FROM citizens WHERE id = 'econ-zoe'"); await closePool(); });

describe("adjustWealth", () => {
  it("adds a positive delta", async () => {
    await repo.adjustWealth("econ-zoe", 8);
    const r = await getPool().query("SELECT wealth FROM citizens WHERE id='econ-zoe'");
    expect(Number(r.rows[0].wealth)).toBe(108);
  });
  it("floors wealth at 0 on a large negative delta", async () => {
    await repo.adjustWealth("econ-zoe", -1000);
    const r = await getPool().query("SELECT wealth FROM citizens WHERE id='econ-zoe'");
    expect(Number(r.rows[0].wealth)).toBe(0);
  });
});
```
- [ ] **Step 2:** `cd /opt/civilization-0 && DATABASE_URL="postgres://civ:civ-local@127.0.0.1:5432/civ0_test" pnpm test:it packages/scheduler/src/economics-citizen.itest.ts` → FAIL (adjustWealth missing).
- [ ] **Step 3a: add to `WorldRepository`** (`packages/persistence/src/repository.ts`), near `setDay`:
```ts
  async adjustWealth(citizenId: string, delta: number): Promise<void> {
    if (!delta) return;
    await this.pool.query("UPDATE citizens SET wealth = GREATEST(0, wealth + $2) WHERE id = $1", [citizenId, delta]);
  }
```
- [ ] **Step 3b: wire into `runDay`** (`packages/scheduler/src/loop.ts`). Add import `import { economicDelta } from "./economics";`. After `await deps.repo.persistTick(store, result, id);` add:
```ts
    await deps.repo.adjustWealth(id, economicDelta(result.decision.action));
```
- [ ] **Step 4:** re-run the itest (civ0_test prefix) → PASS (both). Then `cd /opt/civilization-0 && pnpm test && pnpm typecheck` (unit + types; unit is DB-free).
- [ ] **Step 5: confirm engine/store untouched** `git diff --stat 20a2c48..HEAD -- packages/engine packages/store` → empty.
- [ ] **Step 6: (Controller) commit** `feat(economics): citizen wealth moves per tick` — files `repository.ts`, `loop.ts`, `economics-citizen.itest.ts`.

---

### Task 3: org treasury — wire `economicDelta` into `runOrgDay`

**Files:** Modify `packages/scheduler/src/org-loop.ts`; Test `packages/scheduler/src/economics-org.itest.ts`.

**Interfaces:** `runOrgDay` passes `economicDelta(result.action)` as the `treasuryDelta` to `persistOrgTick` (which already applies it — org-repository.ts:59).

- [ ] **Step 1: failing itest** — `packages/scheduler/src/economics-org.itest.ts` (civ0_test; FakeBrain/FakeStorage; asserts treasury MOVED by economicDelta of the action). Model it on the existing `org-loop.itest.ts` (read it for the FakeBrain/FakeStorage/ExplainabilityService deps + OrgRepository setup), but: seed an org with a known starting treasury, force the brain to a known action (e.g. `hire`), run `runOrgDay`, and assert the org's treasury changed by `economicDelta("hire")` (= -12). Clean its own org rows in beforeAll (DELETE WHERE id), NO resetWorld.
```ts
// after runOrgDay with FakeBrain returning action "hire" on org "econ-o1" (treasury 500):
const r = await getPool().query("SELECT treasury FROM organizations WHERE id='econ-o1'");
expect(Number(r.rows[0].treasury)).toBe(500 + economicDelta("hire")); // 488
```
- [ ] **Step 2:** `cd /opt/civilization-0 && DATABASE_URL="postgres://civ:civ-local@127.0.0.1:5432/civ0_test" pnpm test:it packages/scheduler/src/economics-org.itest.ts` → FAIL (treasury still 500, delta is 0).
- [ ] **Step 3: edit `runOrgDay`** (`packages/scheduler/src/org-loop.ts`): add `import { economicDelta } from "./economics";` and change `persistOrgTick(orgId, result.event, result.trace, 0)` → `persistOrgTick(orgId, result.event, result.trace, economicDelta(result.action))`.
- [ ] **Step 4:** re-run itest (civ0_test prefix) → PASS. Then `pnpm test && pnpm typecheck`. Confirm engine/store empty diff.
- [ ] **Step 5: (Controller) commit** `feat(economics): org treasury moves per tick` — files `org-loop.ts`, `economics-org.itest.ts`.

---

## Self-Review
- Coverage: per-action delta (T1), citizen wealth applied per tick + floored (T2), org treasury applied per tick (T3, reusing persistOrgTick's existing delta path). Visible on existing `/citizens/[id]` (wealth stat) and `/orgs/[id]` (treasury stat) with no UI change. Feeds back into reasoning via loadContext. ✓
- Types: `economicDelta(action:string):number` (T1) consumed in T2 (loop.ts) + T3 (org-loop.ts). `adjustWealth` (T2) consumed in runDay. ✓
- Engine/store untouched (economics is scheduler+persistence only). ✓
- DB isolation: every itest prefixed with civ0_test DATABASE_URL; itests clean their own rows (no resetWorld) so even on civ0_test they're hermetic. ✓

## Execution Handoff
Subagent-driven; controller commits. After Task 3: controller merges to master, rebuilds + restarts the web server, and re-enables the paused autonomy timer (so the next tick applies economics live).
