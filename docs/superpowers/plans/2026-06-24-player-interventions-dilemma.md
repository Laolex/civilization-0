# Player Interventions — Dilemma Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authorized player force a target citizen, on their next tick, into a constrained decision — a short *framing line* plus a *whitelist of 2+ allowed actions* — both consumed one-shot, after which the citizen returns to normal.

**Architecture:** The framing line reuses the existing pinned-memory substrate wholesale (importance-10 pin keyed `dl-${iv.id}`, cleared by the existing `consumedPins` path). The only new substrate is a one-shot per-citizen action constraint: a nullable `citizens.forced_actions JSONB` column, mirrored in the store, loaded by `loadContext`, read by the engine tick to narrow `availableActions`, and cleared one-shot by the day loop. The drain gains a `dilemma` branch (`makeDilemmaApplier`) and `/api/interventions` gains a `dilemma` branch; a server-gated `DilemmaBox` on the citizen page posts it.

**Tech Stack:** TypeScript (ESM), pnpm workspaces, Postgres (`pg`), Next.js 14 App Router, vitest (unit `.test.ts` via `pnpm test` / `npx vitest run`; integration `.itest.ts` via `pnpm test:it`), `@testing-library/react` for component tests.

## Global Constraints

- This branch (`feat/player-interventions-dilemma`) is stacked on `feat/player-interventions-world-event`; the intervention substrate (queue, drain, `canIntervene`, `/api/interventions`, the day-start drain, the pinned-memory lifecycle) already exists.
- The framing line is delivered as a **pinned importance-10 memory** with deterministic id `dl-${iv.id}` — exactly the whisper pin shape — so it clears via the existing `TickResult.consumedPins` → `repo.unpinMemory` path. No new clear logic for the text.
- A dilemma must offer a **real choice**: `actions` is a subset of `ALL_ACTIONS` (the 13 verbs) with **length ≥ 2**. Enforced identically at the API (primary gate) and the applier (self-defending).
- Framing text cap: **280 chars** (`MAX_TEXT`); reject empty/over-cap with `400`.
- A dilemma targets a citizen: `targetCitizenId` is the citizen, `payload = { text, actions }`.
- One-shot: the action constraint and the framing pin both clear after the citizen's next tick. If the citizen is not selected to tick that day, the dilemma persists in the DB until they do.
- Last-wins: if two dilemmas are queued for the same citizen before they tick, `setForcedActions` overwrites (last constraint wins); both framing pins are present and both clear on the next tick.
- `forced_actions` is additive and nullable; `null` ⇒ no dilemma. Existing citizens default to `null`. Whisper/World-event paths are untouched.
- Shared world id is `"genesis"` (no owner); premium plans are `"pro"`/`"research"`. `canIntervene` already encodes: world owner always; shared `genesis` gated to `pro`/`research`. The API enforces it independently of the UI gate.
- The drain must keep its never-throw bookkeeping and still leave truly-unknown intervention types pending (not failed).
- Integration tests use `.itest.ts` and run via `pnpm test:it`; unit tests `.test.ts`. The local Postgres from `.env` is reachable and already has the substrate schema applied.
- Commits: no `Co-Authored-By` trailer, no Claude/AI attribution.

---

### Task 1: Schema — `citizens.forced_actions` column

**Files:**
- Modify: `packages/persistence/src/schema.sql`

**Interfaces:**
- Produces: column `citizens.forced_actions JSONB` (nullable, no default — absence is SQL `NULL`).

- [ ] **Step 1: Add the column to schema.sql**

In `packages/persistence/src/schema.sql`, immediately after the existing line
`ALTER TABLE citizens ADD COLUMN IF NOT EXISTS world_id TEXT NOT NULL DEFAULT 'genesis';`
(and its `CREATE INDEX ... citizens_world_idx` line), add:

```sql
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS forced_actions JSONB;
```

- [ ] **Step 2: Apply it to the local dev DB**

Run (loads `DATABASE_URL` from `.env`):

```bash
cd /opt/civilization-0 && psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" -v ON_ERROR_STOP=1 -c "ALTER TABLE citizens ADD COLUMN IF NOT EXISTS forced_actions JSONB;"
```

Expected: `ALTER TABLE`.

- [ ] **Step 3: Verify**

Run:

```bash
cd /opt/civilization-0 && psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" -tA -c "SELECT column_name, is_nullable, data_type FROM information_schema.columns WHERE table_name='citizens' AND column_name='forced_actions';"
```

Expected: `forced_actions|YES|jsonb`.

- [ ] **Step 4: Commit**

```bash
git add packages/persistence/src/schema.sql
git commit -m "feat(interventions): add citizens.forced_actions column for dilemmas"
```

---

### Task 2: Store — per-citizen forced-actions accessor

**Files:**
- Modify: `packages/store/src/index.ts` (`WorldStore` interface + `InMemoryWorldStore`)
- Test: `packages/store/src/index.test.ts` (extend)

**Interfaces:**
- Produces (on `WorldStore` + `InMemoryWorldStore`):
  - `getForcedActions(citizenId: string): ActionType[] | null` — `null` when no dilemma is set.
  - `setForcedActions(citizenId: string, actions: ActionType[] | null): void` — `null` clears.

- [ ] **Step 1: Write the failing test**

In `packages/store/src/index.test.ts`, add inside the `describe("InMemoryWorldStore", ...)` block:

```typescript
  it("sets, reads, and clears per-citizen forced actions (absence => null)", () => {
    const s = new InMemoryWorldStore();
    expect(s.getForcedActions("ada")).toBeNull();
    s.setForcedActions("ada", ["work", "quit_job"]);
    expect(s.getForcedActions("ada")).toEqual(["work", "quit_job"]);
    s.setForcedActions("ada", null);
    expect(s.getForcedActions("ada")).toBeNull();
  });
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run packages/store/src/index.test.ts`
Expected: fail — `s.getForcedActions is not a function`.

- [ ] **Step 3: Add `ActionType` to the imports**

In `packages/store/src/index.ts`, the top import currently reads:

```typescript
import type {
  Belief, Citizen, Decision, DecisionBelief, DecisionMemory, DecisionTrace,
  Goal, Memory, Relationship, WorldEvent, WorldState, WorldSnapshot,
} from "@civ/shared";
```

Add `ActionType` to that list:

```typescript
import type {
  ActionType, Belief, Citizen, Decision, DecisionBelief, DecisionMemory, DecisionTrace,
  Goal, Memory, Relationship, WorldEvent, WorldState, WorldSnapshot,
} from "@civ/shared";
```

- [ ] **Step 4: Add the methods to the `WorldStore` interface**

In the `WorldStore` interface, add these two members (e.g. immediately after `clearPin(memoryId: string): void;`):

```typescript
  getForcedActions(citizenId: string): ActionType[] | null;
  setForcedActions(citizenId: string, actions: ActionType[] | null): void;
```

- [ ] **Step 5: Implement them on `InMemoryWorldStore`**

Add a backing field alongside the other private maps (e.g. after `private memories: Memory[] = [];`):

```typescript
  private forcedActions = new Map<string, ActionType[]>();
```

And add the methods (e.g. after the `clearPin` method):

```typescript
  getForcedActions(citizenId: string): ActionType[] | null { return this.forcedActions.get(citizenId) ?? null; }
  setForcedActions(citizenId: string, actions: ActionType[] | null): void {
    if (actions === null) this.forcedActions.delete(citizenId);
    else this.forcedActions.set(citizenId, actions);
  }
```

- [ ] **Step 6: Run, expect PASS**

Run: `npx vitest run packages/store/src/index.test.ts`
Expected: all pass (existing tests + the new one).

- [ ] **Step 7: Commit**

```bash
git add packages/store/src/index.ts packages/store/src/index.test.ts
git commit -m "feat(interventions): per-citizen forced-actions accessor on the store"
```

---

### Task 3: Engine — narrow `availableActions` + report `consumedDilemma`

**Files:**
- Modify: `packages/engine/src/index.ts` (`TickResult`, `runCitizenTick`)
- Test: `packages/engine/src/index.test.ts` (extend)

**Interfaces:**
- Consumes: `store.getForcedActions(citizenId)` (Task 2).
- Produces: `TickResult` gains `consumedDilemma: boolean` (true when a forced set was active for this tick).
- Produces: `runCitizenTick` passes `availableActions: forced ?? ALL_ACTIONS` to `brain.decide`.

- [ ] **Step 1: Write the failing tests**

In `packages/engine/src/index.test.ts`, add to the `describe("runCitizenTick", ...)` block. These reuse the existing `setup()` helper (which seeds citizen `ada` and a `FakeBrain`) and override `deps.brain` with a fresh `FakeBrain` that captures the available actions it was handed:

```typescript
  it("narrows availableActions to the forced set and reports consumedDilemma=true", async () => {
    const { store, deps } = setup();
    store.setForcedActions("ada", ["work", "quit_job"]);
    let seen: string[] = [];
    deps.brain = new FakeBrain((ctx) => {
      seen = [...ctx.availableActions];
      return { action: "work", targetId: null, reasoning: "forced", memoryWeights: {}, beliefWeights: {} };
    });
    const result = await runCitizenTick(deps, "ada");
    expect(seen).toEqual(["work", "quit_job"]);
    expect(result.consumedDilemma).toBe(true);
  });

  it("uses all actions and consumedDilemma=false when no dilemma is set", async () => {
    const { deps } = setup();
    let seen: string[] = [];
    deps.brain = new FakeBrain((ctx) => {
      seen = [...ctx.availableActions];
      return { action: "work", targetId: null, reasoning: "normal", memoryWeights: {}, beliefWeights: {} };
    });
    const result = await runCitizenTick(deps, "ada");
    expect(seen).toHaveLength(13);
    expect(result.consumedDilemma).toBe(false);
  });
```

(`FakeBrain` is already imported at the top of this test file.)

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run packages/engine/src/index.test.ts`
Expected: fail — the forced test sees 13 actions (not the narrowed set) and `result.consumedDilemma` is `undefined`.

- [ ] **Step 3: Add `consumedDilemma` to `TickResult`**

In `packages/engine/src/index.ts`, the `TickResult` interface currently ends with `consumedPins: string[];`. Add a field:

```typescript
export interface TickResult {
  decision: Decision;
  event: WorldEvent;
  trace: DecisionTrace;
  storedMemory: Memory | null;
  consumedPins: string[];
  consumedDilemma: boolean;
}
```

- [ ] **Step 4: Read the forced set and narrow `availableActions`**

In `runCitizenTick`, the block `// 3-4. Build context + decide` currently reads:

```typescript
  // 3-4. Build context + decide
  const result = await brain.decide({
    citizen, goal, memories, beliefs, relationships, worldState, availableActions: ALL_ACTIONS,
  });
```

Replace it with:

```typescript
  // 3-4. Build context + decide. A queued dilemma narrows the choice set for
  // this one tick; the brain honors it at both the prompt and the parse layer.
  const forced = store.getForcedActions(citizenId);
  const result = await brain.decide({
    citizen, goal, memories, beliefs, relationships, worldState, availableActions: forced ?? ALL_ACTIONS,
  });
```

- [ ] **Step 5: Report it in the returned `TickResult`**

The function's final return currently reads:

```typescript
  return { decision, event, trace, storedMemory, consumedPins };
```

Replace it with:

```typescript
  return { decision, event, trace, storedMemory, consumedPins, consumedDilemma: forced != null };
```

- [ ] **Step 6: Run, expect PASS**

Run: `npx vitest run packages/engine/src/index.test.ts`
Expected: all pass (existing causality/pin tests + the two new ones).

- [ ] **Step 7: Typecheck the engine**

Run: `npx tsc --noEmit -p packages/engine/tsconfig.json`
Expected: no errors. (`runCitizenTick` is the only constructor of `TickResult`; `scenario.ts` only collects its results, so the new required field is satisfied everywhere.)

- [ ] **Step 8: Commit**

```bash
git add packages/engine/src/index.ts packages/engine/src/index.test.ts
git commit -m "feat(interventions): engine narrows availableActions to the dilemma's forced set"
```

---

### Task 4: Persistence — `setForcedActions`/`clearForcedActions` + `loadContext` hydration

**Files:**
- Modify: `packages/persistence/src/repository.ts` (add two methods; hydrate in `loadContext`)
- Test: `packages/persistence/src/dilemma-forced-actions.itest.ts`

**Interfaces:**
- Consumes: `citizens.forced_actions` column (Task 1); `store.setForcedActions` / `store.getForcedActions` (Task 2).
- Produces (on `WorldRepository`):
  - `setForcedActions(citizenId: string, actions: ActionType[]): Promise<void>`
  - `clearForcedActions(citizenId: string): Promise<void>`
- Produces: `loadContext(citizenId)` hydrates a non-empty `forced_actions` array into the store.

- [ ] **Step 1: Write the failing integration test**

Create `packages/persistence/src/dilemma-forced-actions.itest.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPool, closePool } from "./pool";
import { WorldRepository } from "./repository";

const wid = "itest-dl-world";
const cid = "itest-dl-citizen";
const repo = new WorldRepository();

beforeAll(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM citizens WHERE id = $1", [cid]);
  await pool.query("DELETE FROM worlds WHERE id = $1", [wid]);
  await pool.query(
    "INSERT INTO worlds (id,name,owner_id,visibility,population_cap) VALUES ($1,'DL','itest-u','private',50)",
    [wid]);
  await pool.query(
    `INSERT INTO citizens (id,name,occupation,age,traits,wealth,reputation,tier,created_day,world_id)
     VALUES ($1,'Cit','Engineer',30,'{}'::jsonb,0,50,3,0,$2)`,
    [cid, wid]);
});

afterAll(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM citizens WHERE id = $1", [cid]);
  await pool.query("DELETE FROM worlds WHERE id = $1", [wid]);
  await closePool();
});

describe("forced actions persistence", () => {
  it("loadContext hydrates a forced_actions set written by setForcedActions", async () => {
    await repo.setForcedActions(cid, ["work", "quit_job"]);
    const store = await repo.loadContext(cid);
    expect(store.getForcedActions(cid)).toEqual(["work", "quit_job"]);
  });

  it("clearForcedActions resets the column to null (loadContext sees no dilemma)", async () => {
    await repo.setForcedActions(cid, ["work", "invest"]);
    await repo.clearForcedActions(cid);
    const store = await repo.loadContext(cid);
    expect(store.getForcedActions(cid)).toBeNull();
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm test:it dilemma-forced-actions`
Expected: fail — `repo.setForcedActions is not a function`.

- [ ] **Step 3: Add `ActionType` to the repository imports**

In `packages/persistence/src/repository.ts`, the second import line currently reads:

```typescript
import type { Citizen, Memory } from "@civ/shared";
```

Change it to:

```typescript
import type { ActionType, Citizen, Memory } from "@civ/shared";
```

- [ ] **Step 4: Add the two repository methods**

In `WorldRepository`, add (e.g. immediately after the existing `setWorldHeadline` method):

```typescript
  async setForcedActions(citizenId: string, actions: ActionType[]): Promise<void> {
    await this.pool.query("UPDATE citizens SET forced_actions = $2 WHERE id = $1",
      [citizenId, JSON.stringify(actions)]);
  }

  async clearForcedActions(citizenId: string): Promise<void> {
    await this.pool.query("UPDATE citizens SET forced_actions = NULL WHERE id = $1", [citizenId]);
  }
```

(JSONB columns take a JSON string param, matching how `traits` is written via `JSON.stringify`.)

- [ ] **Step 5: Hydrate `forced_actions` in `loadContext`**

In `loadContext`, the citizen is loaded via `SELECT * FROM citizens WHERE id = $1` into `c`, and the `if (c.rows[0]) { const r = c.rows[0]; store.upsertCitizen({...}); }` block runs. Inside that block, immediately after the `store.upsertCitizen({ ... });` call, add:

```typescript
      if (Array.isArray(r.forced_actions) && r.forced_actions.length > 0) {
        store.setForcedActions(r.id, r.forced_actions as ActionType[]);
      }
```

(pg parses a JSONB array column into a JS array, so no `JSON.parse` is needed on read.)

- [ ] **Step 6: Run it, expect PASS**

Run: `pnpm test:it dilemma-forced-actions`
Expected: 2 passed.

- [ ] **Step 7: Typecheck the persistence package**

Run: `npx tsc --noEmit -p packages/persistence/tsconfig.json`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/persistence/src/repository.ts packages/persistence/src/dilemma-forced-actions.itest.ts
git commit -m "feat(interventions): persist + hydrate citizen forced_actions in loadContext"
```

---

### Task 5: Loop — clear the forced set one-shot after the tick

**Files:**
- Modify: `packages/scheduler/src/loop.ts` (`runDay`)
- Test: `packages/scheduler/src/loop.test.ts` (extend)

**Interfaces:**
- Consumes: `result.consumedDilemma` (Task 3); `repo.clearForcedActions` (Task 4).
- Produces: `runDay` calls `deps.repo.clearForcedActions(id)` after `persistTick` whenever the tick consumed a dilemma — alongside the existing one-shot unpin loop.

- [ ] **Step 1: Write the failing test**

In `packages/scheduler/src/loop.test.ts`, add a new test (after the existing one):

```typescript
it("clears the forced action set after a tick that consumed a dilemma", async () => {
  const calls: string[] = [];
  const repo = {
    loadContext: async () => ({} as never),
    persistTick: async () => {},
    adjustWealth: async () => {},
    setDay: async () => {},
    unpinMemory: async () => {},
    clearForcedActions: async (id: string) => { calls.push(`clear:${id}`); },
  };
  const deps = {
    repo: repo as unknown as DayDeps["repo"],
    makeTickDeps: () => ({} as never),
    citizens: [{ id: "ada", tier: 3 as const }],
    runTick: async () => ({ decision: { action: "work" }, consumedPins: [], consumedDilemma: true } as never),
  };
  await runDay(deps as unknown as DayDeps, 5);
  expect(calls).toContain("clear:ada");
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run packages/scheduler/src/loop.test.ts`
Expected: fail — `clearForcedActions` is never called (no `calls` entry).

- [ ] **Step 3: Clear the forced set in `runDay`**

In `packages/scheduler/src/loop.ts`, the inner per-citizen loop in `runDay` currently reads:

```typescript
    await deps.repo.persistTick(store, result, id);
    for (const pinId of result.consumedPins ?? []) await deps.repo.unpinMemory(pinId);
    await deps.repo.adjustWealth(id, economicDelta(result.decision.action));
```

Immediately after the `for (const pinId ...) await deps.repo.unpinMemory(pinId);` line, add:

```typescript
    if (result.consumedDilemma) await deps.repo.clearForcedActions(id);
```

- [ ] **Step 4: Run, expect PASS**

Run: `npx vitest run packages/scheduler/src/loop.test.ts`
Expected: both tests pass (the existing unpin test has no `consumedDilemma`, so `clearForcedActions` is not called there).

- [ ] **Step 5: Typecheck the scheduler**

Run: `npx tsc --noEmit -p packages/scheduler/tsconfig.json`
Expected: no errors (`DayDeps["repo"]` is `WorldRepository`, which now has `clearForcedActions` from Task 4).

- [ ] **Step 6: Commit**

```bash
git add packages/scheduler/src/loop.ts packages/scheduler/src/loop.test.ts
git commit -m "feat(interventions): clear a citizen's forced actions one-shot after their tick"
```

---

### Task 6: Drain dispatch + dilemma applier

**Files:**
- Modify: `packages/scheduler/src/interventions.ts` (`DrainDeps`, dispatch, `makeDilemmaApplier`)
- Modify: `packages/scheduler/scripts/run-scheduler.ts` (wire `applyDilemma`)
- Test: `packages/scheduler/src/interventions.test.ts` (extend)

**Interfaces:**
- Consumes: `repo.getCitizenWorldId`, `repo.setForcedActions` (Task 4), `repo.addPinnedMemory` (existing); `Embedder`; existing `Intervention`, `DrainDeps`, `drainInterventions`.
- Produces: `DrainDeps.applyDilemma?: (iv: Intervention, day: number) => Promise<void>`.
- Produces: `makeDilemmaApplier(repo: { getCitizenWorldId(id: string): Promise<string | null>; setForcedActions(citizenId: string, actions: ActionType[]): Promise<void>; addPinnedMemory(m: Memory): Promise<void> }, embedder: Embedder): (iv: Intervention, day: number) => Promise<void>`.

- [ ] **Step 1: Write the failing tests**

In `packages/scheduler/src/interventions.test.ts`, first update the imports. The current import lines are:

```typescript
import type { Memory } from "@civ/shared";
import type { Intervention } from "@civ/persistence/src/intervention-write";
import { drainInterventions, makeWhisperApplier, makeWorldEventApplier, type DrainDeps } from "./interventions";
```

Change them to:

```typescript
import type { ActionType, Memory } from "@civ/shared";
import type { Intervention } from "@civ/persistence/src/intervention-write";
import { drainInterventions, makeWhisperApplier, makeWorldEventApplier, makeDilemmaApplier, type DrainDeps } from "./interventions";
```

Next, the existing test `"leaves a truly unknown type pending (not applied/failed)"` uses `type: "dilemma"` as its stand-in for "unknown". Since `dilemma` becomes a known type in this task, change that test's type to a still-unknown verb so it keeps testing the intended path. Replace:

```typescript
      pending: async () => [ivOf({ id: "x1", type: "dilemma" })],
```

with:

```typescript
      pending: async () => [ivOf({ id: "x1", type: "prophecy" })],
```

Then add, inside the `describe("drainInterventions", ...)` block, a dispatch test:

```typescript
  it("dispatches a dilemma to applyDilemma", async () => {
    const calls: string[] = [];
    const deps: DrainDeps = {
      pending: async () => [ivOf({ id: "d1", type: "dilemma" })],
      applyWhisper: async () => { throw new Error("should not be called"); },
      applyDilemma: async (iv) => { calls.push(`dilemma:${iv.id}`); },
      markApplied: async () => {}, markFailed: async () => {},
    };
    const out = await drainInterventions(deps, 5);
    expect(out).toEqual({ applied: 1, failed: 0 });
    expect(calls).toEqual(["dilemma:d1"]);
  });
```

And add applier tests:

```typescript
  it("makeDilemmaApplier sets the forced action set and writes a framing pin", async () => {
    const setCalls: Array<[string, ActionType[]]> = [];
    const pins: Memory[] = [];
    const repo = {
      getCitizenWorldId: async () => "w1",
      setForcedActions: async (id: string, a: ActionType[]) => { setCalls.push([id, a]); },
      addPinnedMemory: async (m: Memory) => { pins.push(m); },
    };
    const apply = makeDilemmaApplier(repo, { embed: () => [1] });
    await apply(ivOf({ id: "d1", type: "dilemma", worldId: "w1", targetCitizenId: "ada",
      payload: { text: "  Stay or go?  ", actions: ["work", "quit_job"] } }), 3);
    expect(setCalls).toEqual([["ada", ["work", "quit_job"]]]);
    expect(pins[0].id).toBe("dl-d1");
    expect(pins[0].pinned).toBe(true);
    expect(pins[0].importance).toBe(10);
    expect(pins[0].summary).toBe("Stay or go?"); // trimmed
  });

  it("makeDilemmaApplier rejects fewer than 2 actions and writes nothing", async () => {
    const setCalls: unknown[] = [];
    const pins: unknown[] = [];
    const repo = {
      getCitizenWorldId: async () => "w1",
      setForcedActions: async () => { setCalls.push(1); },
      addPinnedMemory: async () => { pins.push(1); },
    };
    const apply = makeDilemmaApplier(repo, { embed: () => [1] });
    await expect(apply(ivOf({ id: "d2", type: "dilemma", worldId: "w1", targetCitizenId: "ada",
      payload: { text: "x", actions: ["work"] } }), 3)).rejects.toThrow();
    expect(setCalls).toEqual([]);
    expect(pins).toEqual([]);
  });

  it("makeDilemmaApplier rejects an unknown action verb", async () => {
    const repo = {
      getCitizenWorldId: async () => "w1",
      setForcedActions: async () => {},
      addPinnedMemory: async () => {},
    };
    const apply = makeDilemmaApplier(repo, { embed: () => [1] });
    await expect(apply(ivOf({ id: "d3", type: "dilemma", worldId: "w1", targetCitizenId: "ada",
      payload: { text: "x", actions: ["work", "fly"] } }), 3)).rejects.toThrow();
  });

  it("makeDilemmaApplier rejects a citizen not in the intervention world", async () => {
    const repo = {
      getCitizenWorldId: async () => "other-world",
      setForcedActions: async () => {},
      addPinnedMemory: async () => {},
    };
    const apply = makeDilemmaApplier(repo, { embed: () => [1] });
    await expect(apply(ivOf({ id: "d4", type: "dilemma", worldId: "w1", targetCitizenId: "ada",
      payload: { text: "x", actions: ["work", "quit_job"] } }), 3)).rejects.toThrow();
  });
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run packages/scheduler/src/interventions.test.ts`
Expected: fail — `makeDilemmaApplier` not exported and `applyDilemma` not in `DrainDeps`.

- [ ] **Step 3: Update the imports in `interventions.ts`**

In `packages/scheduler/src/interventions.ts`, the first import line currently reads:

```typescript
import type { Memory } from "@civ/shared";
```

Change it to (note: `ALL_ACTIONS` is a value, so it is a regular import):

```typescript
import { ALL_ACTIONS, type ActionType, type Memory } from "@civ/shared";
```

- [ ] **Step 4: Add `applyDilemma` to `DrainDeps` and dispatch by type**

Extend the `DrainDeps` interface — add the optional member after `applyWorldEvent?`:

```typescript
export interface DrainDeps {
  pending(): Promise<Intervention[]>;
  applyWhisper(iv: Intervention, day: number): Promise<void>;
  applyWorldEvent?(iv: Intervention, day: number): Promise<void>;
  applyDilemma?(iv: Intervention, day: number): Promise<void>;
  markApplied(id: string, day: number): Promise<void>;
  markFailed(id: string): Promise<void>;
}
```

In `drainInterventions`, the dispatch map currently reads:

```typescript
    const applier =
      iv.type === "whisper" ? deps.applyWhisper :
      iv.type === "world_event" ? deps.applyWorldEvent :
      undefined;
```

Add a `dilemma` arm:

```typescript
    const applier =
      iv.type === "whisper" ? deps.applyWhisper :
      iv.type === "world_event" ? deps.applyWorldEvent :
      iv.type === "dilemma" ? deps.applyDilemma :
      undefined;
```

- [ ] **Step 5: Add `makeDilemmaApplier`**

In the same file, after `makeWorldEventApplier`, add:

```typescript
export function makeDilemmaApplier(
  repo: {
    getCitizenWorldId(id: string): Promise<string | null>;
    setForcedActions(citizenId: string, actions: ActionType[]): Promise<void>;
    addPinnedMemory(m: Memory): Promise<void>;
  },
  embedder: Embedder,
) {
  return async (iv: Intervention, day: number): Promise<void> => {
    const citizenId = iv.targetCitizenId;
    const text = typeof iv.payload.text === "string" ? iv.payload.text.trim() : "";
    const rawActions = iv.payload.actions;
    if (!citizenId || !text) throw new Error("dilemma missing target or text");
    if (!Array.isArray(rawActions)) throw new Error("dilemma missing actions");
    const actions = rawActions.filter(
      (a): a is ActionType => typeof a === "string" && (ALL_ACTIONS as string[]).includes(a));
    // A real choice means 2+ valid verbs, and no junk verbs slipped through.
    if (actions.length < 2 || actions.length !== rawActions.length) {
      throw new Error("dilemma actions must be 2+ valid action verbs");
    }
    const world = await repo.getCitizenWorldId(citizenId);
    if (world !== iv.worldId) throw new Error("target citizen not in intervention world");
    await repo.setForcedActions(citizenId, actions);
    await repo.addPinnedMemory({
      // Deterministic id keyed off the intervention so a re-apply collides on the
      // PK and is dropped by addPinnedMemory's ON CONFLICT (id) DO NOTHING.
      id: `dl-${iv.id}`, citizenId, day, type: "relationship", importance: 10,
      summary: text, embedding: embedder.embed(text), pinned: true,
    });
  };
}
```

- [ ] **Step 6: Run, expect PASS**

Run: `npx vitest run packages/scheduler/src/interventions.test.ts`
Expected: all pass (existing whisper/world-event tests + the dispatch test + the four applier tests + the now-`"prophecy"` unknown-type test).

- [ ] **Step 7: Wire `applyDilemma` into the scheduler**

In `packages/scheduler/scripts/run-scheduler.ts`, the import currently reads:

```typescript
import { drainInterventions, makeWhisperApplier, makeWorldEventApplier } from "../src/interventions";
```

Change it to:

```typescript
import { drainInterventions, makeWhisperApplier, makeWorldEventApplier, makeDilemmaApplier } from "../src/interventions";
```

The drain construction currently reads:

```typescript
  const applyWhisper = makeWhisperApplier(repo, embedder);
  const applyWorldEvent = makeWorldEventApplier(repo);
  const drain = (day: number) => drainInterventions(
    { pending: pendingInterventions, applyWhisper, applyWorldEvent, markApplied: markInterventionApplied, markFailed: markInterventionFailed },
    day);
```

Change it to add `applyDilemma`:

```typescript
  const applyWhisper = makeWhisperApplier(repo, embedder);
  const applyWorldEvent = makeWorldEventApplier(repo);
  const applyDilemma = makeDilemmaApplier(repo, embedder);
  const drain = (day: number) => drainInterventions(
    { pending: pendingInterventions, applyWhisper, applyWorldEvent, applyDilemma, markApplied: markInterventionApplied, markFailed: markInterventionFailed },
    day);
```

- [ ] **Step 8: Run the scheduler suite + typecheck**

Run: `npx vitest run packages/scheduler` → all green.
Run: `npx tsc --noEmit -p packages/scheduler/tsconfig.json` → no errors.

- [ ] **Step 9: Commit**

```bash
git add packages/scheduler/src/interventions.ts packages/scheduler/src/interventions.test.ts packages/scheduler/scripts/run-scheduler.ts
git commit -m "feat(interventions): dilemma drain dispatch + applier"
```

---

### Task 7: API — `dilemma` branch in `/api/interventions`

**Files:**
- Modify: `apps/web/app/api/interventions/route.ts`
- Test: `apps/web/app/api/interventions/route.test.ts` (extend)

**Interfaces:**
- Consumes: `getCurrentUser`, `readWorld`, `canIntervene`, `enqueueIntervention`, `getPool` (existing); `ALL_ACTIONS`.
- Produces: `POST` accepts `{ worldId, type: "dilemma", targetCitizenId, text, actions }` → enqueues `{ type: "dilemma", targetCitizenId, payload: { text, actions } }` → 201; 400 on bad text/actions; 404 missing world; 403 `!canIntervene`; 400 citizen-not-in-world.

- [ ] **Step 1: Write the failing tests**

In `apps/web/app/api/interventions/route.test.ts`, the mocks at the top already cover `getCurrentUser` (user `{ id: "u1", plan: "free" }`), `readWorld` (world owned by `u1`), `enqueueIntervention`, and `getPool` (citizen query returns `{ world_id: "w1" }`).

First, the existing test `"rejects an unknown type (400)"` uses `type: "dilemma"` as its unknown-type stand-in. Since `dilemma` becomes valid, change it to a still-unknown type. Replace:

```typescript
  it("rejects an unknown type (400)", async () => {
    const res = await POST(req({ worldId: "w1", type: "dilemma", headline: "x" }));
    expect(res.status).toBe(400);
  });
```

with:

```typescript
  it("rejects an unknown type (400)", async () => {
    const res = await POST(req({ worldId: "w1", type: "prophecy", headline: "x" }));
    expect(res.status).toBe(400);
  });
```

Then add a new describe block:

```typescript
describe("POST /api/interventions — dilemma", () => {
  it("enqueues a valid dilemma (201) with text + actions payload", async () => {
    const res = await POST(req({ worldId: "w1", type: "dilemma", targetCitizenId: "ada",
      text: "Stay or leave?", actions: ["work", "quit_job"] }));
    expect(res.status).toBe(201);
    expect(enqueue).toHaveBeenCalledOnce();
    const arg = enqueue.mock.calls[0][0];
    expect(arg.type).toBe("dilemma");
    expect(arg.targetCitizenId).toBe("ada");
    expect(arg.payload).toEqual({ text: "Stay or leave?", actions: ["work", "quit_job"] });
  });
  it("rejects fewer than 2 actions (400)", async () => {
    const res = await POST(req({ worldId: "w1", type: "dilemma", targetCitizenId: "ada",
      text: "x", actions: ["work"] }));
    expect(res.status).toBe(400);
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("rejects an unknown action verb (400)", async () => {
    const res = await POST(req({ worldId: "w1", type: "dilemma", targetCitizenId: "ada",
      text: "x", actions: ["work", "fly"] }));
    expect(res.status).toBe(400);
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("rejects empty text (400)", async () => {
    const res = await POST(req({ worldId: "w1", type: "dilemma", targetCitizenId: "ada",
      text: "", actions: ["work", "quit_job"] }));
    expect(res.status).toBe(400);
  });
  it("returns 404 when the world is missing (dilemma)", async () => {
    const { readWorld } = await import("@civ/persistence/src/read");
    vi.mocked(readWorld).mockResolvedValueOnce(null);
    const res = await POST(req({ worldId: "w1", type: "dilemma", targetCitizenId: "ada",
      text: "x", actions: ["work", "quit_job"] }));
    expect(res.status).toBe(404);
    expect(enqueue).not.toHaveBeenCalled();
  });
  it("returns 403 when the user is not authorized (dilemma)", async () => {
    const { getCurrentUser } = await import("../../../lib/auth");
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: "u2", plan: "free", email: null, wallet: null, hasApiKey: false });
    const res = await POST(req({ worldId: "w1", type: "dilemma", targetCitizenId: "ada",
      text: "x", actions: ["work", "quit_job"] }));
    expect(res.status).toBe(403);
    expect(enqueue).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run apps/web/app/api/interventions/route.test.ts`
Expected: the dilemma cases fail (route currently 400s anything but whisper/world_event).

- [ ] **Step 3: Import `ALL_ACTIONS` in the route**

In `apps/web/app/api/interventions/route.ts`, after the existing imports (e.g. after the `getCurrentUser` import), add:

```typescript
import { ALL_ACTIONS } from "@civ/shared";
```

- [ ] **Step 4: Allow `dilemma` in the type guard**

The guard currently reads:

```typescript
  if (type !== "whisper" && type !== "world_event") {
    return NextResponse.json({ error: "unsupported intervention type" }, { status: 400 });
  }
```

Change it to:

```typescript
  if (type !== "whisper" && type !== "world_event" && type !== "dilemma") {
    return NextResponse.json({ error: "unsupported intervention type" }, { status: 400 });
  }
```

- [ ] **Step 5: Add the `dilemma` branch**

The whisper branch is a self-contained `if (type === "whisper") { ... return ...; }` block that ends with `return NextResponse.json(row, { status: 201 });`. Immediately after that whisper block's closing `}` (and before the `// type === "world_event"` comment), insert the dilemma branch:

```typescript
  if (type === "dilemma") {
    const targetCitizenId = typeof body.targetCitizenId === "string" ? body.targetCitizenId : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    const rawActions = Array.isArray(body.actions) ? body.actions : [];
    const actions = rawActions.filter(
      (a): a is string => typeof a === "string" && (ALL_ACTIONS as string[]).includes(a));
    if (!targetCitizenId) return NextResponse.json({ error: "targetCitizenId is required" }, { status: 400 });
    if (!text || text.length > MAX_TEXT) return NextResponse.json({ error: `text must be 1..${MAX_TEXT} chars` }, { status: 400 });
    if (actions.length < 2 || actions.length !== rawActions.length) {
      return NextResponse.json({ error: "actions must be 2+ valid action verbs" }, { status: 400 });
    }
    const world = await readWorld(getPool(), worldId);
    if (!world) return NextResponse.json({ error: "world not found" }, { status: 404 });
    if (!canIntervene({ id: user.id, plan: user.plan }, { id: world.id, ownerId: world.ownerId })) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const cw = await getPool().query("SELECT world_id FROM citizens WHERE id = $1", [targetCitizenId]);
    if ((cw.rows[0]?.world_id ?? null) !== worldId) {
      return NextResponse.json({ error: "citizen not in world" }, { status: 400 });
    }
    const row = await enqueueIntervention({
      id: `iv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      worldId, userId: user.id, type: "dilemma", targetCitizenId, payload: { text, actions },
    });
    return NextResponse.json(row, { status: 201 });
  }
```

- [ ] **Step 6: Run, expect PASS**

Run: `npx vitest run apps/web/app/api/interventions/route.test.ts`
Expected: all pass (existing whisper + world_event tests + the new dilemma block + the updated unknown-type test).

- [ ] **Step 7: Commit**

```bash
git add apps/web/app/api/interventions/route.ts apps/web/app/api/interventions/route.test.ts
git commit -m "feat(interventions): accept dilemma in /api/interventions"
```

---

### Task 8: UI — `DilemmaBox` on the citizen page

**Files:**
- Create: `apps/web/components/DilemmaBox.tsx`
- Create: `apps/web/components/DilemmaBox.test.tsx`
- Modify: `apps/web/app/citizens/[id]/page.tsx`

**Interfaces:**
- Consumes: `POST /api/interventions` dilemma branch (Task 7); `ALL_ACTIONS`; the existing `showWhisper` server gate (`canIntervene`) on the citizen page.
- Produces: `<DilemmaBox worldId citizenId citizenName />` client component, rendered only when `canIntervene` allows.

- [ ] **Step 1: Write the failing component test**

Create `apps/web/components/DilemmaBox.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { DilemmaBox } from "./DilemmaBox";

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ id: "iv1" }), { status: 201 })) as never;
});

describe("DilemmaBox", () => {
  it("does not post until 2+ actions are selected", async () => {
    render(<DilemmaBox worldId="genesis" citizenId="ada" citizenName="Ada" />);
    fireEvent.change(screen.getByPlaceholderText(/frame the choice/i), { target: { value: "Stay or go?" } });
    fireEvent.click(screen.getByLabelText("work")); // only one action → button stays disabled
    fireEvent.click(screen.getByRole("button", { name: /force dilemma/i }));
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("posts the framing text + selected actions and shows confirmation", async () => {
    render(<DilemmaBox worldId="genesis" citizenId="ada" citizenName="Ada" />);
    fireEvent.change(screen.getByPlaceholderText(/frame the choice/i), { target: { value: "Stay or go?" } });
    fireEvent.click(screen.getByLabelText("work"));
    fireEvent.click(screen.getByLabelText("quit_job"));
    fireEvent.click(screen.getByRole("button", { name: /force dilemma/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    const fetchMock = global.fetch as unknown as { mock: { calls: unknown[][] } };
    const body = JSON.parse((fetchMock.mock.calls[0][1] as { body: string }).body);
    expect(body.type).toBe("dilemma");
    expect(body.text).toBe("Stay or go?");
    expect(body.actions).toEqual(["work", "quit_job"]);
    expect(await screen.findByText(/will face this/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run apps/web/components/DilemmaBox.test.tsx`
Expected: fail — module `./DilemmaBox` not found.

- [ ] **Step 3: Implement `DilemmaBox.tsx`**

Create `apps/web/components/DilemmaBox.tsx`:

```tsx
"use client";
import React from "react";
import { ALL_ACTIONS } from "@civ/shared";

const MAX = 280;

export function DilemmaBox({ worldId, citizenId, citizenName }: { worldId: string; citizenId: string; citizenName: string }) {
  const [text, setText] = React.useState("");
  const [actions, setActions] = React.useState<string[]>([]);
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");

  function toggle(a: string) {
    setActions((prev) => (prev.includes(a) ? prev.filter((x) => x !== a) : [...prev, a]));
  }

  const ready = text.trim().length > 0 && text.trim().length <= MAX && actions.length >= 2;

  async function send() {
    if (!ready) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/interventions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worldId, type: "dilemma", targetCitizenId: citizenId, text: text.trim(), actions }),
      });
      if (!res.ok) { setStatus("error"); return; }
      setText(""); setActions([]); setStatus("sent");
    } catch { setStatus("error"); }
  }

  return (
    <div className="whisper-box">
      <label className="whisper-label">Force a dilemma on {citizenName}</label>
      <textarea className="whisper-input" placeholder={`Frame the choice for ${citizenName}…`}
        maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} />
      <fieldset className="dilemma-actions">
        <legend className="whisper-label">Allowed actions (pick 2 or more)</legend>
        {ALL_ACTIONS.map((a) => (
          <label key={a} className="dilemma-action mono">
            <input type="checkbox" checked={actions.includes(a)} onChange={() => toggle(a)} /> {a}
          </label>
        ))}
      </fieldset>
      <div className="whisper-actions">
        <span className="whisper-count mono">{text.length}/{MAX} · {actions.length} action{actions.length === 1 ? "" : "s"}</span>
        <button onClick={send} disabled={!ready || status === "sending"}>Force dilemma</button>
      </div>
      {status === "sent" && <p className="whisper-sent">{citizenName} will face this on their next day.</p>}
      {status === "error" && <p className="whisper-error">Couldn&apos;t send — you may not have rights on this world.</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npx vitest run apps/web/components/DilemmaBox.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Render it on the citizen page, behind the same gate**

In `apps/web/app/citizens/[id]/page.tsx`, the page already computes `showWhisper` via `canIntervene` and renders `WhisperBox` behind `{showWhisper && citizen.worldId && (...)}`. The dilemma reuses the **same** authorization.

Add the import alongside the existing `WhisperBox` import:

```typescript
import { DilemmaBox } from "../../../components/DilemmaBox";
```

The existing whisper render block reads:

```tsx
      {showWhisper && citizen.worldId && (
        <section className="cz-section">
          <WhisperBox worldId={citizen.worldId} citizenId={id} citizenName={citizen.name} />
        </section>
      )}
```

Immediately after that block, add a parallel dilemma block (same gate):

```tsx
      {showWhisper && citizen.worldId && (
        <section className="cz-section">
          <DilemmaBox worldId={citizen.worldId} citizenId={id} citizenName={citizen.name} />
        </section>
      )}
```

- [ ] **Step 6: Typecheck + web suite**

Run: `npx vitest run apps/web` → all green.
Run: `npx tsc --noEmit -p apps/web/tsconfig.json` → no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/DilemmaBox.tsx apps/web/components/DilemmaBox.test.tsx apps/web/app/citizens/[id]/page.tsx
git commit -m "feat(interventions): dilemma control on the citizen page"
```

---

### Task 9: Changelog entry

**Files:**
- Modify: `CHANGELOG.md`

**Interfaces:**
- Consumes: nothing (documentation).

- [ ] **Step 1: Add the `[Unreleased]` entry**

In `CHANGELOG.md`, under `## [Unreleased]` → `### Added`, add a new bullet as the **first** item (above the "World event (v2)" bullet):

```markdown
- **Player interventions — Dilemma (v2)** — third interventions mechanic, the
  first that constrains a citizen's *choice*. An authorized player forces a
  target citizen, on their next tick, into a framed decision: a short framing
  line plus a whitelist of 2+ allowed actions. The framing line reuses the
  whisper pinned-memory substrate (importance-10 pin `dl-${iv.id}`, cleared via
  the existing one-shot `consumedPins` path); the only new substrate is a
  nullable `citizens.forced_actions` column that narrows the engine's
  `availableActions` for exactly one tick (the 0G brain honors it at both the
  prompt and the parse layer), then is cleared one-shot by the day loop. The
  drain dispatches `dilemma` through `makeDilemmaApplier`, which validates a 2+
  subset of the 13 action verbs, confirms the citizen is in the world, sets the
  column, and writes the framing pin. `POST /api/interventions` accepts
  `type: "dilemma"` (`payload = { text, actions }`) behind the same
  `canIntervene` authz, enforced independently of the UI. A server-gated
  `DilemmaBox` on the citizen page posts it. One-shot, last-wins, additive and
  back-compatible.
```

- [ ] **Step 2: Commit**

```bash
git add CHANGELOG.md
git commit -m "docs(interventions): changelog entry for dilemma (v2)"
```

---

## Final verification

- [ ] `npx vitest run` — full unit suite green.
- [ ] `pnpm test:it dilemma-forced-actions` — forced-actions persistence/hydration green (needs `DATABASE_URL`).
- [ ] `npx tsc --noEmit -p packages/engine/tsconfig.json`, `-p packages/store/tsconfig.json`, `-p packages/persistence/tsconfig.json`, `-p packages/scheduler/tsconfig.json`, and the web tsconfig — no new errors.
- [ ] Manual: as a world-owner (or premium on `genesis`) user, POST a `dilemma` for a citizen with `text` + `actions: ["work","quit_job"]`; run one scheduler day; confirm (a) the citizen's next decision's action is one of the two allowed verbs, (b) the framing line appears among the decision's drivers/memories, and (c) after that tick the `forced_actions` column is `NULL` and the `dl-*` pin is unpinned (the next day's decision is unconstrained).

## Spec coverage check

- `citizens.forced_actions` nullable JSONB column → Task 1.
- Store `getForcedActions`/`setForcedActions` (absence ⇒ null) → Task 2.
- Engine reads `forced ?? ALL_ACTIONS` + `consumedDilemma` → Task 3.
- Repository `setForcedActions`/`clearForcedActions` + `loadContext` hydration → Task 4.
- Loop clears the forced set one-shot on `consumedDilemma` → Task 5.
- Drain `dilemma` dispatch + `makeDilemmaApplier` (2+ subset, citizen-in-world, framing pin) + scheduler wiring → Task 6.
- API `dilemma` branch (text 1..280, actions 2+ subset, authz order, citizen-in-world) → Task 7.
- Server-gated `DilemmaBox` on the citizen page → Task 8.
- One-shot / last-wins / back-compat → inherent in the pin lifecycle + `setForcedActions` overwrite + nullable column (no extra logic).
- Auditability (narrowed set in prompt, framing pin in drivers) → emergent from Tasks 3 + 6 (no separate surface, per spec).
- Out of scope (per-owned-world dilemma dashboards, multi-tick dilemmas, play-as-citizen, rate-limiting) → not in this plan.
