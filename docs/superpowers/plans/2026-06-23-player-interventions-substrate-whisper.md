# Player Interventions — Substrate + Whisper Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a signed-in player "whisper" a suggestion to a citizen that is guaranteed to influence that citizen's next 0G decision, via a reusable intervention queue + tick-time drain.

**Architecture:** A player POSTs an intervention; it is enqueued (pending) in a new `interventions` table after an authorization check. At the start of each scheduler day, a drain reads pending interventions and applies them — a whisper becomes a *pinned*, high-importance memory for the target citizen. The tick force-includes pinned memories in the decision context and clears the pin afterward (one-shot). World-event and dilemma mechanics (later sub-projects) add new appliers to the same drain.

**Tech Stack:** TypeScript (ESM), pnpm workspaces, Postgres (`pg`), Next.js 14 App Router, vitest (unit + `.itest.ts` integration via `vitest.integration.config.ts`).

## Global Constraints

- Whisper text cap: **280 chars**; reject empty/over-cap with `400`.
- Whisper memory: `importance = 10`, `type = "relationship"`, `pinned = true`.
- Shared world id is the string `"genesis"`; premium plans are `"pro"` and `"research"` (free plan = `"free"`).
- Every `memories` row MUST have a non-empty embedding or the memory index crashes — the drain embeds whisper text via the injected `Embedder`.
- Plans use `WorldRepository` (class) from `@civ/persistence`; deep imports like `@civ/persistence/src/pool` are the established pattern in API routes. Do not pull `@civ/engine`/`@civ/store` into the Next bundle.
- Integration tests use the `.itest.ts` suffix and run via `pnpm test:it`; pure unit tests use `.test.ts` and run via `pnpm test`.
- Commits: no `Co-Authored-By` trailer, no Claude/AI attribution.

---

### Task 1: Schema + `pinned` on the Memory type

**Files:**
- Modify: `packages/persistence/src/schema.sql`
- Modify: `packages/shared/src/index.ts` (the `Memory` interface, ~line 35)
- Test: `packages/shared/src/index.test.ts`

**Interfaces:**
- Produces: `Memory.pinned?: boolean`; SQL tables `interventions` and column `memories.pinned`.

- [ ] **Step 1: Add `pinned?` to the Memory type test**

In `packages/shared/src/index.test.ts`, add:

```typescript
it("Memory carries an optional pinned flag", () => {
  const m: import("./index").Memory = { id: "m1", citizenId: "ada", day: 1,
    type: "relationship", importance: 10, summary: "trust Marcus less", embedding: [1], pinned: true };
  expect(m.pinned).toBe(true);
});
```

- [ ] **Step 2: Run it, expect a TYPE failure**

Run: `npx vitest run packages/shared/src/index.test.ts`
Expected: fails to compile — `pinned` not on `Memory`.

- [ ] **Step 3: Add the field**

In `packages/shared/src/index.ts`, in `interface Memory`, add `pinned?: boolean;` after `embedding: number[];`.

- [ ] **Step 4: Run it, expect PASS**

Run: `npx vitest run packages/shared/src/index.test.ts` → PASS.

- [ ] **Step 5: Add the SQL**

In `packages/persistence/src/schema.sql`, after the `memories` table add:

```sql
ALTER TABLE memories ADD COLUMN IF NOT EXISTS pinned boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS interventions (
  id text PRIMARY KEY,
  world_id text NOT NULL,
  user_id text NOT NULL,
  type text NOT NULL,
  target_citizen_id text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'pending',
  created_at timestamptz NOT NULL DEFAULT now(),
  applied_day int
);
CREATE INDEX IF NOT EXISTS interventions_status_idx ON interventions (status);
```

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/index.ts packages/shared/src/index.test.ts packages/persistence/src/schema.sql
git commit -m "feat(interventions): schema + Memory.pinned flag"
```

---

### Task 2: `canIntervene` authorization

**Files:**
- Create: `packages/persistence/src/intervention-authz.ts`
- Test: `packages/persistence/src/intervention-authz.test.ts`

**Interfaces:**
- Produces: `canIntervene(user: { id: string; plan: string }, world: { id: string; ownerId: string | null }): boolean`
- Produces: `SHARED_WORLD_ID = "genesis"`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import { canIntervene } from "./intervention-authz";

const owner = { id: "u1", plan: "free" };
const other = { id: "u2", plan: "free" };
const proOther = { id: "u2", plan: "pro" };

describe("canIntervene", () => {
  it("allows the owner of a private world regardless of plan", () => {
    expect(canIntervene(owner, { id: "w1", ownerId: "u1" })).toBe(true);
  });
  it("denies a non-owner on a world they don't own", () => {
    expect(canIntervene(other, { id: "w1", ownerId: "u1" })).toBe(false);
  });
  it("allows premium plans on the shared world", () => {
    expect(canIntervene(proOther, { id: "genesis", ownerId: null })).toBe(true);
  });
  it("denies free plans on the shared world", () => {
    expect(canIntervene(other, { id: "genesis", ownerId: null })).toBe(false);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — Run: `npx vitest run packages/persistence/src/intervention-authz.test.ts` → module not found.

- [ ] **Step 3: Implement**

```typescript
export const SHARED_WORLD_ID = "genesis";
const PREMIUM_PLANS = new Set(["pro", "research"]);

export function canIntervene(
  user: { id: string; plan: string },
  world: { id: string; ownerId: string | null },
): boolean {
  if (world.ownerId && world.ownerId === user.id) return true;
  if (world.id === SHARED_WORLD_ID) return PREMIUM_PLANS.has(user.plan);
  return false;
}
```

- [ ] **Step 4: Run it, expect PASS.**

- [ ] **Step 5: Commit**

```bash
git add packages/persistence/src/intervention-authz.ts packages/persistence/src/intervention-authz.test.ts
git commit -m "feat(interventions): canIntervene authorization rule"
```

---

### Task 3: Intervention persistence (writes/reads + pin repo methods)

**Files:**
- Create: `packages/persistence/src/intervention-write.ts`
- Modify: `packages/persistence/src/repository.ts` (add `addPinnedMemory`, `unpinMemory`)
- Test: `packages/persistence/src/intervention-write.itest.ts`

**Interfaces:**
- Produces: `interface Intervention { id; worldId; userId; type; targetCitizenId: string | null; payload: Record<string, unknown>; status: string; appliedDay: number | null }`
- Produces: `enqueueIntervention(input: { id; worldId; userId; type; targetCitizenId?; payload }): Promise<Intervention>`
- Produces: `pendingInterventions(): Promise<Intervention[]>`
- Produces: `listInterventions(worldId: string, limit: number): Promise<Intervention[]>`
- Produces: `markInterventionApplied(id: string, day: number): Promise<void>`, `markInterventionFailed(id: string): Promise<void>`
- Produces (on `WorldRepository`): `addPinnedMemory(m: Memory): Promise<void>`, `unpinMemory(id: string): Promise<void>`

- [ ] **Step 1: Write the failing integration test**

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPool, closePool } from "./pool";
import {
  enqueueIntervention, pendingInterventions, listInterventions,
  markInterventionApplied,
} from "./intervention-write";

const wid = "itest-world", uid = "itest-user";

beforeAll(async () => {
  await getPool().query("DELETE FROM interventions WHERE world_id = $1", [wid]);
});
afterAll(async () => {
  await getPool().query("DELETE FROM interventions WHERE world_id = $1", [wid]);
  await closePool();
});

describe("intervention persistence", () => {
  it("enqueues, lists pending, and marks applied", async () => {
    const row = await enqueueIntervention({ id: `iv-${Date.now()}`, worldId: wid, userId: uid,
      type: "whisper", targetCitizenId: "ada", payload: { text: "trust Marcus less" } });
    expect(row.status).toBe("pending");
    expect(row.payload.text).toBe("trust Marcus less");

    const pend = await pendingInterventions();
    expect(pend.some((p) => p.id === row.id)).toBe(true);

    await markInterventionApplied(row.id, 7);
    const listed = await listInterventions(wid, 10);
    const found = listed.find((p) => p.id === row.id)!;
    expect(found.status).toBe("applied");
    expect(found.appliedDay).toBe(7);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL** — Run: `pnpm test:it intervention-write` → module not found.

- [ ] **Step 3: Implement `intervention-write.ts`**

```typescript
import { getPool } from "./pool";

export interface Intervention {
  id: string; worldId: string; userId: string; type: string;
  targetCitizenId: string | null; payload: Record<string, unknown>;
  status: string; appliedDay: number | null;
}

type Row = {
  id: string; world_id: string; user_id: string; type: string;
  target_citizen_id: string | null; payload: Record<string, unknown>;
  status: string; applied_day: number | null;
};
const toIv = (r: Row): Intervention => ({
  id: r.id, worldId: r.world_id, userId: r.user_id, type: r.type,
  targetCitizenId: r.target_citizen_id, payload: r.payload ?? {},
  status: r.status, appliedDay: r.applied_day,
});

export async function enqueueIntervention(input: {
  id: string; worldId: string; userId: string; type: string;
  targetCitizenId?: string | null; payload: Record<string, unknown>;
}): Promise<Intervention> {
  const r = await getPool().query(
    `INSERT INTO interventions (id, world_id, user_id, type, target_citizen_id, payload)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [input.id, input.worldId, input.userId, input.type, input.targetCitizenId ?? null, input.payload]);
  return toIv(r.rows[0]);
}

export async function pendingInterventions(): Promise<Intervention[]> {
  const r = await getPool().query("SELECT * FROM interventions WHERE status = 'pending' ORDER BY created_at");
  return r.rows.map(toIv);
}

export async function listInterventions(worldId: string, limit: number): Promise<Intervention[]> {
  const r = await getPool().query(
    "SELECT * FROM interventions WHERE world_id = $1 ORDER BY created_at DESC LIMIT $2", [worldId, limit]);
  return r.rows.map(toIv);
}

export async function markInterventionApplied(id: string, day: number): Promise<void> {
  await getPool().query("UPDATE interventions SET status = 'applied', applied_day = $2 WHERE id = $1", [id, day]);
}

export async function markInterventionFailed(id: string): Promise<void> {
  await getPool().query("UPDATE interventions SET status = 'failed' WHERE id = $1", [id]);
}
```

- [ ] **Step 4: Add repo pin methods**

In `packages/persistence/src/repository.ts`, add to `WorldRepository` (reuse the existing `addMemoryRow` vector formatting):

```typescript
async addPinnedMemory(m: Memory): Promise<void> {
  await this.pool.query(
    `INSERT INTO memories (id,citizen_id,day,type,importance,summary,embedding,pinned)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true) ON CONFLICT (id) DO NOTHING`,
    [m.id, m.citizenId, m.day, m.type, m.importance, m.summary,
     m.embedding.length ? `[${m.embedding.join(",")}]` : null]);
}

async unpinMemory(id: string): Promise<void> {
  await this.pool.query("UPDATE memories SET pinned = false WHERE id = $1", [id]);
}
```

(Ensure `Memory` is imported in `repository.ts`; it already is via `@civ/shared`.)

- [ ] **Step 5: Run it, expect PASS** — Run: `pnpm test:it intervention-write` → PASS.

- [ ] **Step 6: Commit**

```bash
git add packages/persistence/src/intervention-write.ts packages/persistence/src/intervention-write.itest.ts packages/persistence/src/repository.ts
git commit -m "feat(interventions): persistence writes/reads + pinned-memory repo methods"
```

---

### Task 4: Engine pin support (store + loadContext + tick force-include)

**Files:**
- Modify: `packages/store/src/index.ts` (interface + `InMemoryWorldStore`)
- Modify: `packages/persistence/src/repository.ts` (`loadContext` selects `pinned`)
- Modify: `packages/engine/src/index.ts` (`runCitizenTick` + `TickResult`)
- Test: `packages/engine/src/index.test.ts`, `packages/store/src/index.test.ts`

**Interfaces:**
- Produces (WorldStore): `getPinnedMemories(citizenId: string): Memory[]`, `clearPin(memoryId: string): void`
- Produces (TickResult): `consumedPins: string[]` (pinned memory ids force-included this tick)

- [ ] **Step 1: Store test**

In `packages/store/src/index.test.ts`:

```typescript
it("exposes and clears pinned memories", () => {
  const s = new InMemoryWorldStore();
  s.addMemory({ id: "p1", citizenId: "ada", day: 1, type: "relationship", importance: 10, summary: "whisper", embedding: [1], pinned: true });
  s.addMemory({ id: "m2", citizenId: "ada", day: 1, type: "event", importance: 5, summary: "normal", embedding: [1] });
  expect(s.getPinnedMemories("ada").map((m) => m.id)).toEqual(["p1"]);
  s.clearPin("p1");
  expect(s.getPinnedMemories("ada")).toHaveLength(0);
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run packages/store/src/index.test.ts`.

- [ ] **Step 3: Implement in `packages/store/src/index.ts`**

Add to the `WorldStore` interface:

```typescript
  getPinnedMemories(citizenId: string): Memory[];
  clearPin(memoryId: string): void;
```

Add to `InMemoryWorldStore`:

```typescript
  getPinnedMemories(citizenId: string) { return this.memories.filter((m) => m.citizenId === citizenId && m.pinned); }
  clearPin(memoryId: string) { const m = this.memories.find((x) => x.id === memoryId); if (m) m.pinned = false; }
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: `loadContext` carries `pinned`**

In `packages/persistence/src/repository.ts`, in `loadContext`, the memories loop's `store.addMemory({...})` — add `pinned: m.pinned ?? false,` to the object.

- [ ] **Step 6: Engine test for force-inclusion + consumedPins**

In `packages/engine/src/index.test.ts`, add a test that a pinned memory the similarity search would NOT return is still in the decision context, and is reported in `consumedPins`. Use the existing test's `FakeBrain`/store setup pattern; assert by capturing `ctx.memories` in a `FakeBrain` script:

```typescript
it("force-includes pinned memories and reports them in consumedPins", async () => {
  // store seeded so retrieval would return only m-normal; p-whisper is pinned.
  let sawPinned = false;
  const brain = new FakeBrain((ctx) => {
    sawPinned = ctx.memories.some((m) => m.id === "p-whisper");
    return { action: "work", targetId: null, reasoning: "", memoryWeights: {}, beliefWeights: {} };
  });
  // ... build deps with this brain, seed p-whisper (pinned) + several normal memories ...
  const result = await runCitizenTick(deps, "ada");
  expect(sawPinned).toBe(true);
  expect(result.consumedPins).toContain("p-whisper");
});
```

(Model the deps/seed on the existing engine test in this file; set `RETRIEVE_K` worth of higher-similarity normal memories so the pin would otherwise be excluded.)

- [ ] **Step 7: Run, expect FAIL** — `npx vitest run packages/engine/src/index.test.ts`.

- [ ] **Step 8: Implement in `packages/engine/src/index.ts`**

Add a tiny dedupe helper near the top:

```typescript
function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
}
```

In `runCitizenTick`, replace the memory retrieval line:

```typescript
  const retrieved = memoryIndex.retrieve(citizenId, query, RETRIEVE_K);
  const pinned = store.getPinnedMemories(citizenId);
  const memories = dedupeById([...pinned, ...retrieved]);
```

After the decision is recorded, clear pins in-memory and record them:

```typescript
  const consumedPins = pinned.map((m) => m.id);
  for (const id of consumedPins) store.clearPin(id);
```

Add `consumedPins` to the returned `TickResult` and to the `TickResult` interface (`consumedPins: string[];`).

- [ ] **Step 9: Run, expect PASS** (engine + store).

- [ ] **Step 10: Commit**

```bash
git add packages/store/src/index.ts packages/store/src/index.test.ts packages/persistence/src/repository.ts packages/engine/src/index.ts packages/engine/src/index.test.ts
git commit -m "feat(interventions): pinned-memory force-include in the tick"
```

---

### Task 5: Drain + whisper applier

**Files:**
- Create: `packages/scheduler/src/interventions.ts`
- Test: `packages/scheduler/src/interventions.test.ts`

**Interfaces:**
- Consumes: `Intervention`, `pendingInterventions`, `markInterventionApplied`, `markInterventionFailed` (Task 3); `Embedder` (`@civ/memory`).
- Produces: `interface DrainDeps { pending(): Promise<Intervention[]>; applyWhisper(iv: Intervention, day: number): Promise<void>; markApplied(id: string, day: number): Promise<void>; markFailed(id: string): Promise<void>; }`
- Produces: `drainInterventions(deps: DrainDeps, day: number): Promise<{ applied: number; failed: number }>`
- Produces: `makeWhisperApplier(repo: { getCitizenWorldId(id: string): Promise<string | null>; addPinnedMemory(m: Memory): Promise<void> }, embedder: Embedder, idgen: () => string)`

- [ ] **Step 1: Write the failing test**

```typescript
import { describe, it, expect } from "vitest";
import type { Intervention } from "@civ/persistence/src/intervention-write";
import { drainInterventions, type DrainDeps } from "./interventions";

function ivOf(over: Partial<Intervention> = {}): Intervention {
  return { id: "iv1", worldId: "w1", userId: "u1", type: "whisper",
    targetCitizenId: "ada", payload: { text: "trust Marcus less" },
    status: "pending", appliedDay: null, ...over };
}

describe("drainInterventions", () => {
  it("applies each pending whisper and marks it applied", async () => {
    const applied: string[] = [];
    const deps: DrainDeps = {
      pending: async () => [ivOf()],
      applyWhisper: async () => {},
      markApplied: async (id) => { applied.push(id); },
      markFailed: async () => {},
    };
    const out = await drainInterventions(deps, 5);
    expect(out).toEqual({ applied: 1, failed: 0 });
    expect(applied).toEqual(["iv1"]);
  });

  it("marks a whisper failed (without throwing) when the applier throws", async () => {
    const failed: string[] = [];
    const deps: DrainDeps = {
      pending: async () => [ivOf({ id: "bad" })],
      applyWhisper: async () => { throw new Error("unknown citizen"); },
      markApplied: async () => {},
      markFailed: async (id) => { failed.push(id); },
    };
    const out = await drainInterventions(deps, 5);
    expect(out).toEqual({ applied: 0, failed: 1 });
    expect(failed).toEqual(["bad"]);
  });

  it("ignores non-whisper types (left for later sub-projects)", async () => {
    const deps: DrainDeps = {
      pending: async () => [ivOf({ id: "we1", type: "world_event" })],
      applyWhisper: async () => { throw new Error("should not be called"); },
      markApplied: async () => {}, markFailed: async () => {},
    };
    const out = await drainInterventions(deps, 5);
    expect(out).toEqual({ applied: 0, failed: 0 });
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run packages/scheduler/src/interventions.test.ts`.

- [ ] **Step 3: Implement**

```typescript
import type { Memory } from "@civ/shared";
import type { Embedder } from "@civ/memory";
import type { Intervention } from "@civ/persistence/src/intervention-write";

export interface DrainDeps {
  pending(): Promise<Intervention[]>;
  applyWhisper(iv: Intervention, day: number): Promise<void>;
  markApplied(id: string, day: number): Promise<void>;
  markFailed(id: string): Promise<void>;
}

export async function drainInterventions(deps: DrainDeps, day: number): Promise<{ applied: number; failed: number }> {
  let applied = 0, failed = 0;
  for (const iv of await deps.pending()) {
    if (iv.type !== "whisper") continue; // other types handled by later sub-projects
    try {
      await deps.applyWhisper(iv, day);
      await deps.markApplied(iv.id, day);
      applied++;
    } catch {
      await deps.markFailed(iv.id);
      failed++;
    }
  }
  return { applied, failed };
}

export function makeWhisperApplier(
  repo: { getCitizenWorldId(id: string): Promise<string | null>; addPinnedMemory(m: Memory): Promise<void> },
  embedder: Embedder,
  idgen: () => string,
) {
  return async (iv: Intervention, day: number): Promise<void> => {
    const citizenId = iv.targetCitizenId;
    const text = typeof iv.payload.text === "string" ? iv.payload.text : "";
    if (!citizenId || !text) throw new Error("whisper missing target or text");
    const world = await repo.getCitizenWorldId(citizenId);
    if (world !== iv.worldId) throw new Error("target citizen not in intervention world");
    await repo.addPinnedMemory({
      id: idgen(), citizenId, day, type: "relationship", importance: 10,
      summary: text, embedding: embedder.embed(text), pinned: true,
    });
  };
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Add `getCitizenWorldId` to the repo**

In `packages/persistence/src/repository.ts`:

```typescript
async getCitizenWorldId(id: string): Promise<string | null> {
  const r = await this.pool.query("SELECT world_id FROM citizens WHERE id = $1", [id]);
  return r.rows[0]?.world_id ?? null;
}
```

- [ ] **Step 6: Commit**

```bash
git add packages/scheduler/src/interventions.ts packages/scheduler/src/interventions.test.ts packages/persistence/src/repository.ts
git commit -m "feat(interventions): tick-time drain + whisper applier"
```

---

### Task 6: Wire the drain into the scheduler day

**Files:**
- Modify: `packages/scheduler/src/loop.ts` (`runDay`, `DayDeps`)
- Modify: `packages/scheduler/scripts/run-scheduler.ts` (construct drain deps + embedder)
- Test: `packages/scheduler/src/loop.itest.ts` (extend existing) OR a focused `loop.test.ts` case with fakes

**Interfaces:**
- Consumes: `drainInterventions`, `makeWhisperApplier` (Task 5); `unpinMemory` (Task 3); `TickResult.consumedPins` (Task 4).
- Produces: `DayDeps.drain?: (day: number) => Promise<{ applied: number; failed: number }>`

- [ ] **Step 1: Write the failing unit test** (fakes, no DB)

```typescript
import { describe, it, expect, vi } from "vitest";
import { runDay, type DayDeps } from "./loop";

it("drains interventions before ticking and unpins consumed pins after", async () => {
  const calls: string[] = [];
  const repo = {
    loadContext: async () => { calls.push("load"); return {} as never; },
    persistTick: async () => { calls.push("persist"); },
    adjustWealth: async () => {},
    setDay: async () => {},
    unpinMemory: async (id: string) => { calls.push(`unpin:${id}`); },
  };
  const deps = {
    repo: repo as unknown as DayDeps["repo"],
    makeTickDeps: () => ({} as never),
    citizens: [{ id: "ada", tier: 3 as const }],
    drain: async () => { calls.push("drain"); return { applied: 1, failed: 0 }; },
    runTick: async () => ({ decision: { action: "work" }, consumedPins: ["p1"] } as never),
  };
  await runDay(deps as unknown as DayDeps, 5);
  expect(calls[0]).toBe("drain");
  expect(calls).toContain("unpin:p1");
});
```

Note: this requires `runDay` to accept an injectable `runTick` seam (default = `runCitizenTick`) so the test avoids the real engine. Add that seam.

- [ ] **Step 2: Run, expect FAIL.**

- [ ] **Step 3: Implement in `loop.ts`**

Extend `DayDeps`:

```typescript
  drain?: (day: number) => Promise<{ applied: number; failed: number }>;
  runTick?: (deps: TickDeps, id: string) => Promise<TickResult>;
```

In `runDay`, at the very top (before `selectTickers`):

```typescript
  if (deps.drain) await deps.drain(day);
```

Use the seam and unpin after persist:

```typescript
  const runTick = deps.runTick ?? runCitizenTick;
  ...
    const result = await runTick(deps.makeTickDeps(store, day), id);
    await deps.repo.persistTick(store, result, id);
    for (const pinId of result.consumedPins ?? []) await deps.repo.unpinMemory(pinId);
```

Add `unpinMemory` to the `WorldRepository` type used by `DayDeps.repo` (it's the concrete `WorldRepository`, already has it from Task 3).

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Construct the drain in `run-scheduler.ts`**

Where `makeTickDeps` already builds an `Embedder`, reuse it. After `const repo = new WorldRepository();` add:

```typescript
import { drainInterventions, makeWhisperApplier } from "../src/interventions";
import { pendingInterventions, markInterventionApplied, markInterventionFailed } from "@civ/persistence/src/intervention-write";
// ... using the same embedder + idgen used by makeTickDeps:
const applyWhisper = makeWhisperApplier(repo, embedder, idgen);
const drain = (day: number) => drainInterventions(
  { pending: pendingInterventions, applyWhisper, markApplied: markInterventionApplied, markFailed: markInterventionFailed },
  day);
// pass `drain` into runDay({ repo, makeTickDeps, citizens, drain }, next)
```

(If `embedder`/`idgen` are currently created inside `makeTickDeps`, hoist them to shared consts so both `makeTickDeps` and `applyWhisper` use the same instances.)

- [ ] **Step 6: Run the full suite** — `npx vitest run` → all green. Then `pnpm test:it loop` if the integration loop test exists.

- [ ] **Step 7: Commit**

```bash
git add packages/scheduler/src/loop.ts packages/scheduler/src/loop.test.ts packages/scheduler/scripts/run-scheduler.ts
git commit -m "feat(interventions): drain interventions + unpin within the scheduler day"
```

---

### Task 7: API route — POST/GET `/api/interventions`

**Files:**
- Create: `apps/web/app/api/interventions/route.ts`
- Test: `apps/web/app/api/interventions/route.test.ts`

**Interfaces:**
- Consumes: `getCurrentUser` (`apps/web/lib/auth`), `readWorld` (`@civ/persistence/src/read`), `canIntervene`, `SHARED_WORLD_ID` (Task 2), `enqueueIntervention`, `listInterventions` (Task 3), `WorldRepository.getCitizenWorldId` (Task 5).
- Produces: HTTP `POST` (201 enqueue) and `GET` (list) handlers.

- [ ] **Step 1: Write the failing test** (mock the deep imports with `vi.mock`)

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";

const user = { id: "u1", plan: "free", email: null, wallet: null, hasApiKey: false };
vi.mock("../../../lib/auth", () => ({ getCurrentUser: vi.fn(async () => user) }));
vi.mock("@civ/persistence/src/read", () => ({ readWorld: vi.fn(async () => ({ id: "w1", ownerId: "u1", name: "W", visibility: "private", populationCap: 50, population: 1 })) }));
const enqueue = vi.fn(async (i) => ({ ...i, status: "pending", appliedDay: null, payload: i.payload }));
vi.mock("@civ/persistence/src/intervention-write", () => ({ enqueueIntervention: (i: unknown) => enqueue(i), listInterventions: vi.fn(async () => []) }));
vi.mock("@civ/persistence/src/pool", () => ({ getPool: () => ({ query: async () => ({ rows: [{ world_id: "w1" }] }) }) }));

import { POST } from "./route";
const req = (body: unknown) => new Request("http://x/api/interventions", { method: "POST", body: JSON.stringify(body) });

beforeEach(() => { enqueue.mockClear(); });

describe("POST /api/interventions", () => {
  it("enqueues a valid whisper (201)", async () => {
    const res = await POST(req({ worldId: "w1", type: "whisper", targetCitizenId: "ada", text: "trust Marcus less" }));
    expect(res.status).toBe(201);
    expect(enqueue).toHaveBeenCalledOnce();
  });
  it("rejects empty text (400)", async () => {
    const res = await POST(req({ worldId: "w1", type: "whisper", targetCitizenId: "ada", text: "" }));
    expect(res.status).toBe(400);
  });
  it("rejects over-cap text (400)", async () => {
    const res = await POST(req({ worldId: "w1", type: "whisper", targetCitizenId: "ada", text: "x".repeat(281) }));
    expect(res.status).toBe(400);
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run apps/web/app/api/interventions/route.test.ts`.

- [ ] **Step 3: Implement `route.ts`**

```typescript
import { NextResponse } from "next/server";
import { getPool } from "@civ/persistence/src/pool";
import { readWorld } from "@civ/persistence/src/read";
import { canIntervene } from "@civ/persistence/src/intervention-authz";
import { enqueueIntervention, listInterventions } from "@civ/persistence/src/intervention-write";
import { getCurrentUser } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT = 280;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const worldId = typeof body.worldId === "string" ? body.worldId : "";
  const type = typeof body.type === "string" ? body.type : "";
  const targetCitizenId = typeof body.targetCitizenId === "string" ? body.targetCitizenId : "";
  const text = typeof body.text === "string" ? body.text.trim() : "";

  if (type !== "whisper") return NextResponse.json({ error: "unsupported intervention type" }, { status: 400 });
  if (!worldId || !targetCitizenId) return NextResponse.json({ error: "worldId and targetCitizenId are required" }, { status: 400 });
  if (!text || text.length > MAX_TEXT) return NextResponse.json({ error: `text must be 1..${MAX_TEXT} chars` }, { status: 400 });

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
    worldId, userId: user.id, type: "whisper", targetCitizenId, payload: { text },
  });
  return NextResponse.json(row, { status: 201 });
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const worldId = new URL(req.url).searchParams.get("worldId") ?? "";
  if (!worldId) return NextResponse.json({ error: "worldId required" }, { status: 400 });
  const world = await readWorld(getPool(), worldId);
  if (!world) return NextResponse.json({ error: "world not found" }, { status: 404 });
  if (!canIntervene({ id: user.id, plan: user.plan }, { id: world.id, ownerId: world.ownerId })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(await listInterventions(worldId, 20));
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Add a 403 test** for a non-owner on a private world (set the mocked `getCurrentUser` to `{ id: "u2", plan: "free" }` in a nested test, world ownerId `u1`) → expect 403. Run, expect PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/web/app/api/interventions/route.ts apps/web/app/api/interventions/route.test.ts
git commit -m "feat(interventions): POST/GET /api/interventions with authz + validation"
```

---

### Task 8: Whisper UI on the citizen page

**Files:**
- Create: `apps/web/components/WhisperBox.tsx` (client component)
- Modify: `apps/web/app/citizens/[id]/page.tsx` (render `WhisperBox` when the viewer can intervene)
- Test: `apps/web/components/WhisperBox.test.tsx`

**Interfaces:**
- Consumes: `POST /api/interventions` (Task 7).
- Produces: `<WhisperBox worldId citizenId citizenName />` client component.

- [ ] **Step 1: Write the failing component test**

```typescript
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WhisperBox } from "./WhisperBox";

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ id: "iv1" }), { status: 201 })) as never;
});

describe("WhisperBox", () => {
  it("posts the whisper and shows confirmation", async () => {
    render(<WhisperBox worldId="w1" citizenId="ada" citizenName="Ada" />);
    fireEvent.change(screen.getByPlaceholderText(/whisper/i), { target: { value: "trust Marcus less" } });
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(await screen.findByText(/Ada will hear/i)).toBeTruthy();
  });

  it("blocks empty and over-cap input", async () => {
    render(<WhisperBox worldId="w1" citizenId="ada" citizenName="Ada" />);
    fireEvent.click(screen.getByRole("button", { name: /send/i }));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL** — `npx vitest run apps/web/components/WhisperBox.test.tsx`.

- [ ] **Step 3: Implement `WhisperBox.tsx`**

```tsx
"use client";
import React from "react";

const MAX = 280;

export function WhisperBox({ worldId, citizenId, citizenName }: { worldId: string; citizenId: string; citizenName: string }) {
  const [text, setText] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send() {
    const t = text.trim();
    if (!t || t.length > MAX) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/interventions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worldId, type: "whisper", targetCitizenId: citizenId, text: t }),
      });
      if (!res.ok) { setStatus("error"); return; }
      setText(""); setStatus("sent");
    } catch { setStatus("error"); }
  }

  return (
    <div className="whisper-box">
      <label className="whisper-label">Whisper to {citizenName}</label>
      <textarea className="whisper-input" placeholder={`Whisper a suggestion to ${citizenName}…`}
        maxLength={MAX} value={text} onChange={(e) => setText(e.target.value)} />
      <div className="whisper-actions">
        <span className="whisper-count mono">{text.length}/{MAX}</span>
        <button onClick={send} disabled={status === "sending"}>Send</button>
      </div>
      {status === "sent" && <p className="whisper-sent">{citizenName} will hear this on their next day.</p>}
      {status === "error" && <p className="whisper-error">Couldn’t send — you may not have rights on this world.</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS.**

- [ ] **Step 5: Render it on the citizen page**

In `apps/web/app/citizens/[id]/page.tsx`: import `getCurrentUser`, `readWorld`, `canIntervene`, and the citizen's `world_id`. Compute `const viewer = await getCurrentUser();` and whether `canIntervene`. When true, render `<WhisperBox worldId={worldId} citizenId={id} citizenName={name} />` in the page. (Follow the file's existing data-loading style; the citizen's `world_id` is available from the citizen row / `readCitizen`.)

- [ ] **Step 6: Typecheck + full suite**

Run: `npx vitest run` → all green. Run the web typecheck: `npx tsc --noEmit -p apps/web/tsconfig.json` → no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/WhisperBox.tsx apps/web/components/WhisperBox.test.tsx apps/web/app/citizens/[id]/page.tsx
git commit -m "feat(interventions): whisper control on the citizen page"
```

---

## Final verification

- [ ] `npx vitest run` — full unit suite green.
- [ ] `pnpm test:it intervention-write` — persistence integration green (needs `DATABASE_URL`).
- [ ] `npx tsc --noEmit -p packages/zerog/tsconfig.json` and the web tsconfig — no new errors.
- [ ] Manual: apply `schema.sql` to the dev DB; enqueue a whisper via `POST /api/interventions`; run one scheduler day; confirm the target citizen got a pinned importance-10 memory, that its next decision's trace references the whisper text, and that the memory's `pinned` is back to `false`.

## Spec coverage check

- Auth `canIntervene` → Task 2; used in API → Task 7.
- `interventions` table + `memories.pinned` → Task 1; persistence → Task 3.
- Drain + whisper applier → Task 5; wired into the day + unpin → Task 6.
- Pinned force-include + one-shot clear → Task 4 (engine) + Task 6 (persist unpin).
- API POST/GET with 401/403/400/201 → Task 7.
- Whisper UI gated by `canIntervene` → Task 8.
- Out of scope (world-state scoping, world-event, dilemma, billing) → not in this plan.
