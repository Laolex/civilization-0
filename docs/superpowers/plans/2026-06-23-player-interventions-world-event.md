# Player Interventions — World-event Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an authorized player set a standing headline for a world that every citizen in that world reasons over on their next tick, via the existing intervention queue + drain.

**Architecture:** A new per-world `worlds.headline` column holds a standing override. `loadContext` overlays the citizen's world headline onto the (still-global) world state. The existing drain gains a `world_event` branch that, via `makeWorldEventApplier`, writes that column. The existing `/api/interventions` route accepts `type: "world_event"`, and a server-gated `WorldEventBox` on the `/world` (genesis) dashboard posts it.

**Tech Stack:** TypeScript (ESM), pnpm workspaces, Postgres (`pg`), Next.js 14 App Router, vitest (unit `.test.ts` via `pnpm test`; integration `.itest.ts` via `pnpm test:it`).

## Global Constraints

- This branch (`feat/player-interventions-world-event`) is stacked on `feat/player-interventions-whisper`; the intervention substrate (queue, drain, `canIntervene`, `/api/interventions`) already exists.
- Headline cap: **140 chars**; reject empty/over-cap with `400`.
- A world-event targets a world directly: `targetCitizenId` is null, `payload = { headline }`.
- Shared world id is `"genesis"` (no owner); premium plans are `"pro"`/`"research"`. `canIntervene` already encodes this.
- Empty `worlds.headline` (`''`) means "no override" → citizens fall back to the global `world_state.headline`.
- The drain must keep its never-throw hardening and still leave truly-unknown intervention types pending (not failed).
- Integration tests use `.itest.ts` and run via `pnpm test:it`; unit tests `.test.ts` via `pnpm test`. The local Postgres from `.env` is reachable and already has the substrate schema applied.
- Commits: no `Co-Authored-By` trailer, no Claude/AI attribution.

---

### Task 1: Schema — `worlds.headline` column

**Files:**
- Modify: `packages/persistence/src/schema.sql`

**Interfaces:**
- Produces: column `worlds.headline TEXT NOT NULL DEFAULT ''`.

- [ ] **Step 1: Add the column to schema.sql**

In `packages/persistence/src/schema.sql`, immediately after the `worlds` table's `INSERT ... ON CONFLICT` line (the genesis seed), add:

```sql
ALTER TABLE worlds ADD COLUMN IF NOT EXISTS headline TEXT NOT NULL DEFAULT '';
```

- [ ] **Step 2: Apply it to the local dev DB**

Run (loads `DATABASE_URL` from `.env`):

```bash
cd /opt/civilization-0 && psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" -v ON_ERROR_STOP=1 -c "ALTER TABLE worlds ADD COLUMN IF NOT EXISTS headline TEXT NOT NULL DEFAULT '';"
```

Expected: `ALTER TABLE`.

- [ ] **Step 3: Verify**

Run:

```bash
cd /opt/civilization-0 && psql "$(grep -E '^DATABASE_URL=' .env | cut -d= -f2-)" -tA -c "SELECT column_name FROM information_schema.columns WHERE table_name='worlds' AND column_name='headline';"
```

Expected: `headline`.

- [ ] **Step 4: Commit**

```bash
git add packages/persistence/src/schema.sql
git commit -m "feat(interventions): add worlds.headline column for world events"
```

---

### Task 2: Persistence — `setWorldHeadline` + `loadContext` overlay

**Files:**
- Modify: `packages/persistence/src/repository.ts` (add `setWorldHeadline`; overlay in `loadContext`)
- Test: `packages/persistence/src/world-headline.itest.ts`

**Interfaces:**
- Consumes: `worlds.headline` column (Task 1).
- Produces (on `WorldRepository`): `setWorldHeadline(worldId: string, headline: string): Promise<void>`.
- Produces: `loadContext(citizenId)` overlays the citizen's world headline onto `store.getWorldState().headline` when non-empty.

- [ ] **Step 1: Write the failing integration test**

Create `packages/persistence/src/world-headline.itest.ts`:

```typescript
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPool, closePool } from "./pool";
import { WorldRepository } from "./repository";

const wid = "itest-we-world";
const cid = "itest-we-citizen";
const repo = new WorldRepository();

beforeAll(async () => {
  const pool = getPool();
  await pool.query("DELETE FROM citizens WHERE id = $1", [cid]);
  await pool.query("DELETE FROM worlds WHERE id = $1", [wid]);
  await pool.query(
    "INSERT INTO worlds (id,name,owner_id,visibility,population_cap,headline) VALUES ($1,'WE','itest-u','private',50,'')",
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

describe("world headline overlay", () => {
  it("overlays a non-empty world headline onto the citizen's world state", async () => {
    await repo.setWorldHeadline(wid, "A plague sweeps the land");
    const store = await repo.loadContext(cid);
    expect(store.getWorldState().headline).toBe("A plague sweeps the land");
  });

  it("falls back to the global world_state headline when the world headline is empty", async () => {
    await repo.setWorldHeadline(wid, "");
    const store = await repo.loadContext(cid);
    // global world_state.headline (seeded/whatever it is) — NOT the world override.
    const global = await getPool().query("SELECT headline FROM world_state WHERE id = 1");
    expect(store.getWorldState().headline).toBe(global.rows[0].headline);
  });
});
```

- [ ] **Step 2: Run it, expect FAIL**

Run: `pnpm test:it world-headline`
Expected: fail — `repo.setWorldHeadline is not a function`.

- [ ] **Step 3: Add `setWorldHeadline`**

In `packages/persistence/src/repository.ts`, add a method to `WorldRepository`:

```typescript
async setWorldHeadline(worldId: string, headline: string): Promise<void> {
  await this.pool.query("UPDATE worlds SET headline = $2 WHERE id = $1", [worldId, headline]);
}
```

- [ ] **Step 4: Add the overlay in `loadContext`**

In `loadContext`, the citizen row is loaded into `c` via `SELECT * FROM citizens WHERE id = $1` (so `c.rows[0].world_id` is available). Immediately AFTER the `if (c.rows[0]) { ... upsertCitizen ... }` block, add:

```typescript
const worldId = c.rows[0]?.world_id;
if (worldId) {
  const wr = await this.pool.query("SELECT headline FROM worlds WHERE id = $1", [worldId]);
  const wh = wr.rows[0]?.headline;
  if (typeof wh === "string" && wh.length > 0) {
    store.setWorldState({ ...store.getWorldState(), headline: wh });
  }
}
```

- [ ] **Step 5: Run it, expect PASS**

Run: `pnpm test:it world-headline`
Expected: 2 passed.

- [ ] **Step 6: Commit**

```bash
git add packages/persistence/src/repository.ts packages/persistence/src/world-headline.itest.ts
git commit -m "feat(interventions): per-world headline overlay in loadContext + setWorldHeadline"
```

---

### Task 3: Drain dispatch + world-event applier

**Files:**
- Modify: `packages/scheduler/src/interventions.ts` (`DrainDeps`, dispatch, `makeWorldEventApplier`)
- Modify: `packages/scheduler/scripts/run-scheduler.ts` (wire `applyWorldEvent`)
- Test: `packages/scheduler/src/interventions.test.ts` (extend)

**Interfaces:**
- Consumes: `setWorldHeadline` (Task 2); existing `Intervention`, `DrainDeps`, `drainInterventions`, `makeWhisperApplier`.
- Produces: `DrainDeps.applyWorldEvent?: (iv: Intervention, day: number) => Promise<void>`.
- Produces: `makeWorldEventApplier(repo: { setWorldHeadline(worldId: string, headline: string): Promise<void> }): (iv: Intervention, day: number) => Promise<void>`.

- [ ] **Step 1: Write the failing tests**

In `packages/scheduler/src/interventions.test.ts`, add to the `drainInterventions` describe block:

```typescript
  it("dispatches a world_event to applyWorldEvent and a whisper to applyWhisper", async () => {
    const calls: string[] = [];
    const deps: DrainDeps = {
      pending: async () => [ivOf({ id: "w1", type: "whisper" }), ivOf({ id: "e1", type: "world_event" })],
      applyWhisper: async (iv) => { calls.push(`whisper:${iv.id}`); },
      applyWorldEvent: async (iv) => { calls.push(`event:${iv.id}`); },
      markApplied: async () => {}, markFailed: async () => {},
    };
    const out = await drainInterventions(deps, 5);
    expect(out).toEqual({ applied: 2, failed: 0 });
    expect(calls).toEqual(["whisper:w1", "event:e1"]);
  });

  it("leaves a truly unknown type pending (not applied/failed)", async () => {
    const marked: string[] = [];
    const deps: DrainDeps = {
      pending: async () => [ivOf({ id: "x1", type: "dilemma" })],
      applyWhisper: async () => { throw new Error("nope"); },
      markApplied: async (id) => { marked.push(`a:${id}`); },
      markFailed: async (id) => { marked.push(`f:${id}`); },
    };
    const out = await drainInterventions(deps, 5);
    expect(out).toEqual({ applied: 0, failed: 0 });
    expect(marked).toEqual([]);
  });
```

And add a test for the applier:

```typescript
  it("makeWorldEventApplier sets the world's headline; throws on missing headline", async () => {
    const set: Array<[string, string]> = [];
    const repo = { setWorldHeadline: async (w: string, h: string) => { set.push([w, h]); } };
    const apply = makeWorldEventApplier(repo);
    await apply(ivOf({ id: "e1", type: "world_event", worldId: "w9", payload: { headline: "War breaks out" } }), 2);
    expect(set).toEqual([["w9", "War breaks out"]]);
    await expect(apply(ivOf({ id: "e2", type: "world_event", payload: {} }), 2)).rejects.toThrow();
  });
```

Update the import line in the test file to include `makeWorldEventApplier`:

```typescript
import { drainInterventions, makeWhisperApplier, makeWorldEventApplier, type DrainDeps } from "./interventions";
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run packages/scheduler/src/interventions.test.ts`
Expected: fails — `applyWorldEvent` not in `DrainDeps`, `makeWorldEventApplier` not exported, and the dispatch still `continue`s on non-whisper.

- [ ] **Step 3: Add `applyWorldEvent` to `DrainDeps` and dispatch by type**

In `packages/scheduler/src/interventions.ts`, extend `DrainDeps`:

```typescript
export interface DrainDeps {
  pending(): Promise<Intervention[]>;
  applyWhisper(iv: Intervention, day: number): Promise<void>;
  applyWorldEvent?(iv: Intervention, day: number): Promise<void>;
  markApplied(id: string, day: number): Promise<void>;
  markFailed(id: string): Promise<void>;
}
```

Replace the loop body's type guard. Change:

```typescript
  for (const iv of await deps.pending()) {
    if (iv.type !== "whisper") continue; // other types handled by later sub-projects
    try {
      await deps.applyWhisper(iv, day);
```

to:

```typescript
  for (const iv of await deps.pending()) {
    const applier =
      iv.type === "whisper" ? deps.applyWhisper :
      iv.type === "world_event" ? deps.applyWorldEvent :
      undefined;
    if (!applier) continue; // unknown types left pending for later sub-projects
    try {
      await applier(iv, day);
```

(The `markApplied`/`markFailed` bookkeeping below it is unchanged.)

- [ ] **Step 4: Add `makeWorldEventApplier`**

In the same file, after `makeWhisperApplier`, add:

```typescript
export function makeWorldEventApplier(
  repo: { setWorldHeadline(worldId: string, headline: string): Promise<void> },
) {
  return async (iv: Intervention, _day: number): Promise<void> => {
    const headline = typeof iv.payload.headline === "string" ? iv.payload.headline : "";
    if (!headline) throw new Error("world_event missing headline");
    await repo.setWorldHeadline(iv.worldId, headline);
  };
}
```

- [ ] **Step 5: Run, expect PASS**

Run: `npx vitest run packages/scheduler/src/interventions.test.ts`
Expected: all pass (existing whisper tests + new ones).

- [ ] **Step 6: Wire `applyWorldEvent` into the scheduler**

In `packages/scheduler/scripts/run-scheduler.ts`, update the import and the drain construction. Change the import:

```typescript
import { drainInterventions, makeWhisperApplier, makeWorldEventApplier } from "../src/interventions";
```

And where `applyWhisper`/`drain` are built, add `applyWorldEvent`:

```typescript
  const applyWhisper = makeWhisperApplier(repo, embedder);
  const applyWorldEvent = makeWorldEventApplier(repo);
  const drain = (day: number) => drainInterventions(
    { pending: pendingInterventions, applyWhisper, applyWorldEvent, markApplied: markInterventionApplied, markFailed: markInterventionFailed },
    day);
```

- [ ] **Step 7: Run the scheduler package suite + typecheck**

Run: `npx vitest run packages/scheduler` → all green.
Run: `npx tsc --noEmit -p packages/scheduler/tsconfig.json` → no errors.

- [ ] **Step 8: Commit**

```bash
git add packages/scheduler/src/interventions.ts packages/scheduler/src/interventions.test.ts packages/scheduler/scripts/run-scheduler.ts
git commit -m "feat(interventions): world_event drain dispatch + applier"
```

---

### Task 4: API — `world_event` branch in `/api/interventions`

**Files:**
- Modify: `apps/web/app/api/interventions/route.ts`
- Test: `apps/web/app/api/interventions/route.test.ts` (extend)

**Interfaces:**
- Consumes: `getCurrentUser`, `readWorld`, `canIntervene`, `enqueueIntervention` (existing).
- Produces: `POST` accepts `{ worldId, type: "world_event", headline }` → 201; 400 empty/over-cap headline; 403 `!canIntervene`; 404 missing world; 400 unknown type.

- [ ] **Step 1: Write the failing tests**

In `apps/web/app/api/interventions/route.test.ts`, the existing mocks already cover `getCurrentUser` (user `{ id: "u1", plan: "free" }`), `readWorld` (returns world owned by `u1`), and `enqueueIntervention`. Add a describe block:

```typescript
describe("POST /api/interventions — world_event", () => {
  it("enqueues a valid world_event (201) with no targetCitizenId", async () => {
    const res = await POST(req({ worldId: "w1", type: "world_event", headline: "A great flood" }));
    expect(res.status).toBe(201);
    expect(enqueue).toHaveBeenCalledOnce();
    const arg = enqueue.mock.calls[0][0];
    expect(arg.type).toBe("world_event");
    expect(arg.payload).toEqual({ headline: "A great flood" });
    expect(arg.targetCitizenId ?? null).toBeNull();
  });
  it("rejects empty headline (400)", async () => {
    const res = await POST(req({ worldId: "w1", type: "world_event", headline: "" }));
    expect(res.status).toBe(400);
  });
  it("rejects over-cap headline (400)", async () => {
    const res = await POST(req({ worldId: "w1", type: "world_event", headline: "x".repeat(141) }));
    expect(res.status).toBe(400);
  });
  it("rejects an unknown type (400)", async () => {
    const res = await POST(req({ worldId: "w1", type: "dilemma", headline: "x" }));
    expect(res.status).toBe(400);
  });
});
```

(`enqueue` and `req` are the helpers already defined at the top of this test file from the whisper task; `beforeEach(() => enqueue.mockClear())` already runs.)

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run apps/web/app/api/interventions/route.test.ts`
Expected: world_event cases fail (current route returns 400 "unsupported intervention type" for anything but whisper).

- [ ] **Step 3: Restructure the POST body of `route.ts`**

Add the cap constant near `MAX_TEXT`:

```typescript
const MAX_TEXT = 280;
const MAX_HEADLINE = 140;
```

Replace the POST validation+enqueue section (everything from `const worldId = ...` down to the `return NextResponse.json(row, { status: 201 });`) with:

```typescript
  const worldId = typeof body.worldId === "string" ? body.worldId : "";
  const type = typeof body.type === "string" ? body.type : "";

  if (type !== "whisper" && type !== "world_event") {
    return NextResponse.json({ error: "unsupported intervention type" }, { status: 400 });
  }
  if (!worldId) return NextResponse.json({ error: "worldId is required" }, { status: 400 });

  if (type === "whisper") {
    const targetCitizenId = typeof body.targetCitizenId === "string" ? body.targetCitizenId : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!targetCitizenId) return NextResponse.json({ error: "targetCitizenId is required" }, { status: 400 });
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

  // type === "world_event"
  const headline = typeof body.headline === "string" ? body.headline.trim() : "";
  if (!headline || headline.length > MAX_HEADLINE) {
    return NextResponse.json({ error: `headline must be 1..${MAX_HEADLINE} chars` }, { status: 400 });
  }
  const world = await readWorld(getPool(), worldId);
  if (!world) return NextResponse.json({ error: "world not found" }, { status: 404 });
  if (!canIntervene({ id: user.id, plan: user.plan }, { id: world.id, ownerId: world.ownerId })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const row = await enqueueIntervention({
    id: `iv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    worldId, userId: user.id, type: "world_event", targetCitizenId: null, payload: { headline },
  });
  return NextResponse.json(row, { status: 201 });
```

- [ ] **Step 4: Run, expect PASS**

Run: `npx vitest run apps/web/app/api/interventions/route.test.ts`
Expected: all pass (existing whisper tests + new world_event tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/interventions/route.ts apps/web/app/api/interventions/route.test.ts
git commit -m "feat(interventions): accept world_event in /api/interventions"
```

---

### Task 5: UI — `WorldEventBox` on the genesis dashboard

**Files:**
- Create: `apps/web/components/WorldEventBox.tsx`
- Modify: `apps/web/app/world/page.tsx`
- Test: `apps/web/components/WorldEventBox.test.tsx`

**Interfaces:**
- Consumes: `POST /api/interventions` (Task 4); `getCurrentUser`, `readWorld`, `canIntervene` (existing).
- Produces: `<WorldEventBox worldId />` client component.

- [ ] **Step 1: Write the failing component test**

Create `apps/web/components/WorldEventBox.test.tsx`:

```typescript
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WorldEventBox } from "./WorldEventBox";

beforeEach(() => {
  global.fetch = vi.fn(async () => new Response(JSON.stringify({ id: "iv1" }), { status: 201 })) as never;
});

describe("WorldEventBox", () => {
  it("posts the world event and shows confirmation", async () => {
    render(<WorldEventBox worldId="genesis" />);
    fireEvent.change(screen.getByPlaceholderText(/headline/i), { target: { value: "A great flood" } });
    fireEvent.click(screen.getByRole("button", { name: /set/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(await screen.findByText(/the world will feel this/i)).toBeTruthy();
  });

  it("does not post empty input", async () => {
    render(<WorldEventBox worldId="genesis" />);
    fireEvent.click(screen.getByRole("button", { name: /set/i }));
    expect(global.fetch).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run, expect FAIL**

Run: `npx vitest run apps/web/components/WorldEventBox.test.tsx`
Expected: fail — module not found.

- [ ] **Step 3: Implement `WorldEventBox.tsx`**

```tsx
"use client";
import React from "react";

const MAX = 140;

export function WorldEventBox({ worldId }: { worldId: string }) {
  const [headline, setHeadline] = React.useState("");
  const [status, setStatus] = React.useState<"idle" | "sending" | "sent" | "error">("idle");

  async function send() {
    const h = headline.trim();
    if (!h || h.length > MAX) return;
    setStatus("sending");
    try {
      const res = await fetch("/api/interventions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worldId, type: "world_event", headline: h }),
      });
      if (!res.ok) { setStatus("error"); return; }
      setHeadline(""); setStatus("sent");
    } catch { setStatus("error"); }
  }

  return (
    <div className="whisper-box">
      <label className="whisper-label">Set the world headline</label>
      <input className="whisper-input" placeholder="A new headline for the world…"
        maxLength={MAX} value={headline} onChange={(e) => setHeadline(e.target.value)} />
      <div className="whisper-actions">
        <span className="whisper-count mono">{headline.length}/{MAX}</span>
        <button onClick={send} disabled={status === "sending"}>Set headline</button>
      </div>
      {status === "sent" && <p className="whisper-sent">The world will feel this on the next day.</p>}
      {status === "error" && <p className="whisper-error">Couldn’t set it — you may not have rights on this world.</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run, expect PASS**

Run: `npx vitest run apps/web/components/WorldEventBox.test.tsx`
Expected: 2 passed.

- [ ] **Step 5: Render it on `/world` (genesis), gated**

In `apps/web/app/world/page.tsx`:

Add imports at the top (alongside existing imports):

```typescript
import { getCurrentUser } from "../../lib/auth";
import { readWorld } from "@civ/persistence/src/read";
import { canIntervene } from "@civ/persistence/src/intervention-authz";
import { WorldEventBox } from "../../components/WorldEventBox";
```

Inside the default async component, after the `if (!view) { ... }` early-return block (so we only reach here with a live dashboard), compute the gate:

```typescript
  let showWorldEvent = false;
  try {
    const viewer = await getCurrentUser();
    if (viewer) {
      const gw = await readWorld(getPool(), "genesis");
      if (gw) showWorldEvent = canIntervene({ id: viewer.id, plan: viewer.plan }, { id: gw.id, ownerId: gw.ownerId });
    }
  } catch { showWorldEvent = false; }
```

Then, in the returned JSX for the live dashboard, render the box near the top of the board (e.g. just after the `<header className="board-head">…</header>` block):

```tsx
{showWorldEvent && <WorldEventBox worldId="genesis" />}
```

- [ ] **Step 6: Typecheck + web suite**

Run: `npx vitest run apps/web` → all green.
Run: `npx tsc --noEmit -p apps/web/tsconfig.json` → no new errors.

- [ ] **Step 7: Commit**

```bash
git add apps/web/components/WorldEventBox.tsx apps/web/components/WorldEventBox.test.tsx apps/web/app/world/page.tsx
git commit -m "feat(interventions): world-event control on the genesis dashboard"
```

---

## Final verification

- [ ] `npx vitest run` — full unit suite green.
- [ ] `pnpm test:it world-headline` — overlay integration green (needs `DATABASE_URL`).
- [ ] `npx tsc --noEmit -p packages/scheduler/tsconfig.json` and the web tsconfig — no new errors.
- [ ] Manual: as a premium (or world-owner) user, POST a `world_event` for `genesis`; run one scheduler day; confirm the genesis citizens' next decisions see the new headline (it appears in their decision prompt / trace), and the headline persists across subsequent days until changed.

## Spec coverage check

- `worlds.headline` column → Task 1.
- Per-world overlay in `loadContext` + `setWorldHeadline` → Task 2.
- Drain `world_event` dispatch + `makeWorldEventApplier` + scheduler wiring → Task 3.
- API `world_event` branch (140 cap, no targetCitizenId, authz order) → Task 4.
- Server-gated `WorldEventBox` on `/world` → Task 5.
- Persistent-until-changed → inherent (no clear/expiry logic anywhere).
- Out of scope (dilemma, economy shocks, history, per-owned-world dashboard) → not in this plan.
