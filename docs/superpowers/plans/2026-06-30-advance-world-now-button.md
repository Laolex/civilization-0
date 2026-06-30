# Advance-the-world-now Button Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an owner-only "Advance the world now" button on `/world` that enqueues a `tick_request`, which a VPS timer services with a real `run-scheduler` tick.

**Architecture:** Reuses the existing enqueue→drain substrate. The web app (Vercel, no wallet) only enqueues a queued `tick_request`; a new VPS systemd timer detects a pending request and runs the existing `run-scheduler.ts` under a shared `flock`. The request is a no-op at apply time — the run itself is the effect — so it self-clears. Spend is bounded by flock (no overlap), coalescing (many requests → one tick), and a per-world cooldown.

**Tech Stack:** TypeScript ESM, pnpm workspace, Next.js 14 (App Router) on Vercel, Postgres (prod = Supabase), node-pg, vitest + @testing-library/react, systemd (VPS), ethers v6 + 0G SDKs (already wired in `run-scheduler`).

## Global Constraints

- **ESM only**; pnpm workspace; run 0G scripts with `--conditions require` (compute SDK 0.8.4 ESM bug). Values copied verbatim from spec:
- **New intervention type:** `tick_request`, body `{ worldId }`, `targetCitizenId: null`, `payload: {}`.
- **Cooldown:** `FORCE_TICK_COOLDOWN_MS` default `120000` (per world).
- **Cost affordance (not charged yet):** `{ costCredits: 1, estOG: 0.017 }`.
- **Shared lock path:** `/run/civ0-scheduler.lock` — taken by BOTH the new drainer and the existing `civ0-scheduler.service`.
- **Drainer cadence:** `OnUnitActiveSec=60s`.
- **Prod DB:** drainer reuses `EnvironmentFile=/opt/civilization-0/.env` then `/etc/civ0-scheduler.env` (override → Supabase).
- **Scope:** owner-only, `/world` (genesis) only; a forced tick advances the GLOBAL day (single global-day model); polling for status (no websockets).
- **Commits:** conventional-commit messages; NO `Co-Authored-By` trailer and NO AI-attribution text.
- **Branch:** all work on `feat/advance-world-button` (worktree `/opt/civilization-0-tickbtn`); never commit to `master`.

## File Structure

- `packages/scheduler/src/interventions.ts` — add `applyTickRequest` to `DrainDeps`, dispatch, and `makeTickRequestApplier`.
- `packages/scheduler/scripts/run-scheduler.ts` — wire `applyTickRequest` into the drain.
- `packages/scheduler/scripts/has-pending-tick-request.ts` (new) — CLI: exit 0 if a pending `tick_request` exists; `--count` prints the count. Testable core `countPendingTickRequests`.
- `packages/scheduler/scripts/drain-if-requested.sh` (new) — flock-guarded wrapper the timer runs.
- `packages/scheduler/deploy/civ0-tick-drainer.service` + `.timer` (new) — reference systemd units.
- `packages/persistence/src/intervention-write.ts` — add `lastTickRequestAtMs(worldId)`.
- `apps/web/lib/force-tick.ts` (new) — `assertCanForceTick` cost seam + cooldown (pure).
- `apps/web/app/api/interventions/route.ts` — add the `tick_request` POST branch.
- `apps/web/components/AdvanceWorldButton.tsx` (new) — the button + status polling.
- `apps/web/app/world/page.tsx` — render the button under the existing owner condition.
- `docs/zerog-runbook.md` — deploy steps for the timer + the flock wrapper of the existing service.

Run all package tests with `API_KEY="" pnpm -C <pkg> test` (clone `.env` causes spurious 403s).

---

### Task 1: No-op `tick_request` applier + drain dispatch

**Files:**
- Modify: `packages/scheduler/src/interventions.ts`
- Modify: `packages/scheduler/scripts/run-scheduler.ts`
- Test: `packages/scheduler/src/interventions.test.ts`

**Interfaces:**
- Consumes: existing `DrainDeps`, `drainInterventions`, `Intervention`.
- Produces: `makeTickRequestApplier(): (iv: Intervention, day: number) => Promise<void>` (a no-op); `DrainDeps.applyTickRequest?`.

- [ ] **Step 1: Write the failing test** — append to `packages/scheduler/src/interventions.test.ts`:

```ts
import { makeTickRequestApplier } from "./interventions";

describe("tick_request", () => {
  it("makeTickRequestApplier is a no-op that resolves", async () => {
    const apply = makeTickRequestApplier();
    await expect(apply({ id: "iv1", worldId: "w1", userId: "u1", type: "tick_request",
      targetCitizenId: null, payload: {}, status: "pending", appliedDay: null }, 5)).resolves.toBeUndefined();
  });

  it("drainInterventions routes tick_request to applyTickRequest and marks it applied", async () => {
    const marked: string[] = [];
    const applyTickRequest = vi.fn(async () => {});
    const res = await drainInterventions({
      pending: async () => [{ id: "t1", worldId: "w1", userId: "u1", type: "tick_request",
        targetCitizenId: null, payload: {}, status: "pending", appliedDay: null }],
      applyWhisper: async () => {},
      applyTickRequest,
      markApplied: async (id) => { marked.push(id); },
      markFailed: async () => {},
    }, 9);
    expect(applyTickRequest).toHaveBeenCalledOnce();
    expect(res.applied).toBe(1);
    expect(marked).toEqual(["t1"]);
  });
});
```

(`describe`, `it`, `expect`, `vi`, `drainInterventions` are already imported at the top of this test file; add only the `makeTickRequestApplier` import.)

- [ ] **Step 2: Run test to verify it fails**

Run: `API_KEY="" pnpm -C packages/scheduler test -- interventions`
Expected: FAIL — `makeTickRequestApplier is not a function` / `applyTickRequest` not dispatched.

- [ ] **Step 3: Implement** — in `packages/scheduler/src/interventions.ts`:

In `DrainDeps`, add after `applyDilemma?`:
```ts
  applyTickRequest?(iv: Intervention, day: number): Promise<void>;
```
In `drainInterventions`, extend the dispatch chain (add the line before `undefined;`):
```ts
      iv.type === "dilemma" ? deps.applyDilemma :
      iv.type === "tick_request" ? deps.applyTickRequest :
      undefined;
```
Add the factory (e.g. below `makeWhisperApplier`):
```ts
/** A tick_request's only job is to cause the scheduler run; applying it is a no-op. */
export function makeTickRequestApplier() {
  return async (_iv: Intervention, _day: number): Promise<void> => {};
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `API_KEY="" pnpm -C packages/scheduler test -- interventions`
Expected: PASS.

- [ ] **Step 5: Wire into `run-scheduler.ts`** — in `packages/scheduler/scripts/run-scheduler.ts`:

Add `makeTickRequestApplier` to the existing import from `../src/interventions`. After `const applyDilemma = makeDilemmaApplier(repo, embedder);` add:
```ts
  const applyTickRequest = makeTickRequestApplier();
```
Add `applyTickRequest` to the drain deps object:
```ts
    { pending: pendingInterventions, applyWhisper, applyWorldEvent, applyDilemma, applyTickRequest, markApplied: markInterventionApplied, markFailed: markInterventionFailed },
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm -C packages/scheduler exec tsc --noEmit` (expect no NEW errors in changed files)
```bash
git add packages/scheduler/src/interventions.ts packages/scheduler/src/interventions.test.ts packages/scheduler/scripts/run-scheduler.ts
git commit -m "feat(scheduler): no-op tick_request applier + drain dispatch"
```

---

### Task 2: `lastTickRequestAtMs` + `assertCanForceTick` cost seam

**Files:**
- Modify: `packages/persistence/src/intervention-write.ts`
- Create: `apps/web/lib/force-tick.ts`
- Test: `apps/web/lib/force-tick.test.ts`

**Interfaces:**
- Consumes: `canIntervene` from `@civ/persistence/src/intervention-authz`.
- Produces:
  - `lastTickRequestAtMs(worldId: string): Promise<number | null>` (epoch ms of the most recent `tick_request` for the world, or null).
  - `FORCE_TICK_COOLDOWN_MS: number`, `class ForceTickError extends Error { status: number; retryAfterMs?: number }`, and
    `assertCanForceTick(user: {id:string;plan:string}, world: {id:string;ownerId:string|null}, lastTickRequestMs: number|null, now: number): { costCredits: number; estOG: number }` — throws `ForceTickError` (403 not owner, 429 within cooldown).

- [ ] **Step 1: Write the failing test** — create `apps/web/lib/force-tick.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { assertCanForceTick, ForceTickError, FORCE_TICK_COOLDOWN_MS } from "./force-tick";

const owner = { id: "u1", plan: "free" };
const world = { id: "w1", ownerId: "u1" };
const T = 1_000_000_000_000;

describe("assertCanForceTick", () => {
  it("allows the owner when no prior request and returns cost metadata", () => {
    expect(assertCanForceTick(owner, world, null, T)).toEqual({ costCredits: 1, estOG: 0.017 });
  });
  it("throws 403 for a non-owner", () => {
    try { assertCanForceTick({ id: "u2", plan: "free" }, world, null, T); throw new Error("no throw"); }
    catch (e) { expect((e as ForceTickError).status).toBe(403); }
  });
  it("throws 429 within the cooldown window with retryAfterMs", () => {
    try { assertCanForceTick(owner, world, T - 1000, T); throw new Error("no throw"); }
    catch (e) {
      const err = e as ForceTickError;
      expect(err.status).toBe(429);
      expect(err.retryAfterMs).toBe(FORCE_TICK_COOLDOWN_MS - 1000);
    }
  });
  it("allows again once the cooldown has elapsed", () => {
    expect(assertCanForceTick(owner, world, T - FORCE_TICK_COOLDOWN_MS, T)).toEqual({ costCredits: 1, estOG: 0.017 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `API_KEY="" pnpm -C apps/web test -- force-tick`
Expected: FAIL — cannot find module `./force-tick`.

- [ ] **Step 3: Implement** — create `apps/web/lib/force-tick.ts`:

```ts
import { canIntervene } from "@civ/persistence/src/intervention-authz";

export const FORCE_TICK_COOLDOWN_MS = Number(process.env.FORCE_TICK_COOLDOWN_MS ?? 120_000);

export interface ForceTickCost { costCredits: number; estOG: number; }

export class ForceTickError extends Error {
  status: number;
  retryAfterMs?: number;
  constructor(status: number, message: string, retryAfterMs?: number) {
    super(message);
    this.name = "ForceTickError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * The single place this feature becomes "expensive" when a paid rail lands.
 * Today: owner check + per-world cooldown. Later: deduct a credit / charge, throw 402.
 */
export function assertCanForceTick(
  user: { id: string; plan: string },
  world: { id: string; ownerId: string | null },
  lastTickRequestMs: number | null,
  now: number,
): ForceTickCost {
  if (!canIntervene(user, world)) throw new ForceTickError(403, "forbidden");
  if (lastTickRequestMs !== null) {
    const elapsed = now - lastTickRequestMs;
    if (elapsed < FORCE_TICK_COOLDOWN_MS) {
      throw new ForceTickError(429, "cooldown", FORCE_TICK_COOLDOWN_MS - elapsed);
    }
  }
  return { costCredits: 1, estOG: 0.017 };
}
```

Then add to `packages/persistence/src/intervention-write.ts` (after `listInterventions`):
```ts
export async function lastTickRequestAtMs(worldId: string): Promise<number | null> {
  const r = await getPool().query(
    `SELECT EXTRACT(EPOCH FROM created_at) * 1000 AS ms FROM interventions
     WHERE world_id = $1 AND type = 'tick_request' ORDER BY created_at DESC LIMIT 1`,
    [worldId]);
  return r.rows[0] ? Number(r.rows[0].ms) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `API_KEY="" pnpm -C apps/web test -- force-tick`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/force-tick.ts apps/web/lib/force-tick.test.ts packages/persistence/src/intervention-write.ts
git commit -m "feat(web): assertCanForceTick cost seam + lastTickRequestAtMs"
```

---

### Task 3: API `tick_request` POST branch

**Files:**
- Modify: `apps/web/app/api/interventions/route.ts`
- Test: `apps/web/app/api/interventions/route.test.ts`

**Interfaces:**
- Consumes: `assertCanForceTick`, `ForceTickError` (Task 2); `lastTickRequestAtMs` (Task 2); existing `enqueueIntervention`, `readWorld`, `getCurrentUser`.
- Produces: `POST` handling `type:"tick_request"` → 201 with the enqueued row; 401/403/404/429.

- [ ] **Step 1: Write the failing test** — append to `apps/web/app/api/interventions/route.test.ts`.

First extend the existing `intervention-write` mock (top of file) to also export `lastTickRequestAtMs`:
```ts
vi.mock("@civ/persistence/src/intervention-write", () => ({
  enqueueIntervention: (i: unknown) => enqueue(i),
  listInterventions: vi.fn(async () => []),
  lastTickRequestAtMs: vi.fn(async () => null),
}));
```
Then add:
```ts
describe("POST /api/interventions — tick_request", () => {
  it("enqueues a tick_request (201) with empty payload and no target", async () => {
    const res = await POST(req({ worldId: "w1", type: "tick_request" }));
    expect(res.status).toBe(201);
    const arg = enqueue.mock.calls[0][0];
    expect(arg.type).toBe("tick_request");
    expect(arg.payload).toEqual({});
    expect(arg.targetCitizenId ?? null).toBeNull();
  });
  it("returns 401 when unauthenticated", async () => {
    const { getCurrentUser } = await import("../../../lib/auth");
    vi.mocked(getCurrentUser).mockResolvedValueOnce(null);
    const res = await POST(req({ worldId: "w1", type: "tick_request" }));
    expect(res.status).toBe(401);
  });
  it("returns 403 for a non-owner", async () => {
    const { getCurrentUser } = await import("../../../lib/auth");
    vi.mocked(getCurrentUser).mockResolvedValueOnce({ id: "u2", plan: "free", email: null, wallet: null, hasApiKey: false });
    const res = await POST(req({ worldId: "w1", type: "tick_request" }));
    expect(res.status).toBe(403);
  });
  it("returns 429 within the cooldown window", async () => {
    const iw = await import("@civ/persistence/src/intervention-write");
    vi.mocked(iw.lastTickRequestAtMs).mockResolvedValueOnce(Date.now());
    const res = await POST(req({ worldId: "w1", type: "tick_request" }));
    expect(res.status).toBe(429);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `API_KEY="" pnpm -C apps/web test -- interventions/route`
Expected: FAIL — tick_request rejected as unsupported type (400) / `lastTickRequestAtMs` undefined.

- [ ] **Step 3: Implement** — in `apps/web/app/api/interventions/route.ts`:

Add imports:
```ts
import { enqueueIntervention, listInterventions, lastTickRequestAtMs } from "@civ/persistence/src/intervention-write";
import { assertCanForceTick, ForceTickError } from "../../../lib/force-tick";
```
(keep the existing `enqueueIntervention, listInterventions` import consolidated into this single line.)

Widen the type guard near the top of `POST`:
```ts
  if (type !== "whisper" && type !== "world_event" && type !== "dilemma" && type !== "tick_request") {
    return NextResponse.json({ error: "unsupported intervention type" }, { status: 400 });
  }
```
Add the branch immediately before the `// type === "world_event"` comment block:
```ts
  if (type === "tick_request") {
    const world = await readWorld(getPool(), worldId);
    if (!world) return NextResponse.json({ error: "world not found" }, { status: 404 });
    try {
      assertCanForceTick(
        { id: user.id, plan: user.plan },
        { id: world.id, ownerId: world.ownerId },
        await lastTickRequestAtMs(worldId),
        Date.now(),
      );
    } catch (e) {
      if (e instanceof ForceTickError) {
        return NextResponse.json(
          { error: e.message, retryAfterMs: e.retryAfterMs },
          { status: e.status });
      }
      throw e;
    }
    const row = await enqueueIntervention({
      id: `iv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      worldId, userId: user.id, type: "tick_request", targetCitizenId: null, payload: {},
    });
    return NextResponse.json(row, { status: 201 });
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `API_KEY="" pnpm -C apps/web test -- interventions/route`
Expected: PASS (existing whisper/world_event tests + 4 new).

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/interventions/route.ts apps/web/app/api/interventions/route.test.ts
git commit -m "feat(web): tick_request POST branch with cooldown gating"
```

---

### Task 4: VPS drainer (detector + flock wrapper + systemd units)

**Files:**
- Create: `packages/scheduler/scripts/has-pending-tick-request.ts`
- Create: `packages/scheduler/scripts/drain-if-requested.sh`
- Create: `packages/scheduler/deploy/civ0-tick-drainer.service`
- Create: `packages/scheduler/deploy/civ0-tick-drainer.timer`
- Modify: `docs/zerog-runbook.md`
- Test: `packages/scheduler/src/has-pending-tick-request.test.ts`

**Interfaces:**
- Consumes: `pendingInterventions`, `closePool` from `@civ/persistence`.
- Produces: `countPendingTickRequests(pending: Intervention[]): number`; a CLI printing the count with `--count`, exiting 0 if >0 else 1 otherwise.

- [ ] **Step 1: Write the failing test** — create `packages/scheduler/src/has-pending-tick-request.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { countPendingTickRequests } from "../scripts/has-pending-tick-request";
import type { Intervention } from "@civ/persistence/src/intervention-write";

const iv = (type: string): Intervention => ({
  id: type, worldId: "w1", userId: "u1", type, targetCitizenId: null, payload: {},
  status: "pending", appliedDay: null });

describe("countPendingTickRequests", () => {
  it("counts only tick_request rows", () => {
    expect(countPendingTickRequests([iv("tick_request"), iv("whisper"), iv("tick_request")])).toBe(2);
  });
  it("returns 0 when none", () => {
    expect(countPendingTickRequests([iv("whisper")])).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `API_KEY="" pnpm -C packages/scheduler test -- has-pending`
Expected: FAIL — cannot find module.

- [ ] **Step 3: Implement** — create `packages/scheduler/scripts/has-pending-tick-request.ts`:

```ts
import { pendingInterventions, type Intervention } from "@civ/persistence/src/intervention-write";
import { closePool } from "@civ/persistence";

export function countPendingTickRequests(pending: Intervention[]): number {
  return pending.filter((iv) => iv.type === "tick_request").length;
}

async function main() {
  const count = countPendingTickRequests(await pendingInterventions());
  await closePool();
  if (process.argv.includes("--count")) {
    process.stdout.write(String(count));
    process.exit(0);
  }
  process.exit(count > 0 ? 0 : 1);
}

// Only run when executed directly (not when imported by tests).
if (process.argv[1] && process.argv[1].endsWith("has-pending-tick-request.ts")) {
  main().catch((e) => { console.error(e); process.exit(2); });
}
```

(If `Intervention` is not re-exported from `@civ/persistence/src/intervention-write` as a type, import it from there — it is exported as `export interface Intervention`.)

- [ ] **Step 4: Run test to verify it passes**

Run: `API_KEY="" pnpm -C packages/scheduler test -- has-pending`
Expected: PASS (2 tests).

- [ ] **Step 5: Create the flock wrapper** — `packages/scheduler/scripts/drain-if-requested.sh`:

```bash
#!/usr/bin/env bash
# Runs ONE real scheduler tick iff a tick_request is pending, never overlapping
# the 2h scheduler (shared lock). Env (DATABASE_URL etc.) is supplied by systemd.
set -uo pipefail
ROOT="${CIV0_ROOT:-/opt/civilization-0}"
LOCK="${CIV0_LOCK:-/run/civ0-scheduler.lock}"

count="$(pnpm -s -C "$ROOT" exec tsx "$ROOT/packages/scheduler/scripts/has-pending-tick-request.ts" --count 2>/dev/null || echo 0)"
if [ "${count:-0}" -le 0 ]; then
  echo "no pending tick_request"; exit 0
fi
echo "pending tick_request(s): $count — running one tick"
flock -n "$LOCK" pnpm -C "$ROOT/packages/scheduler" exec tsx --conditions require scripts/run-scheduler.ts --days 1 \
  || echo "drain skipped (lock busy or balance floor)"
exit 0
```

Make it executable:
```bash
chmod +x packages/scheduler/scripts/drain-if-requested.sh
```

- [ ] **Step 6: Create reference systemd units** — `packages/scheduler/deploy/civ0-tick-drainer.service`:

```ini
[Unit]
Description=Civilization-0 on-demand tick drainer (services tick_request rows)
After=network-online.target

[Service]
Type=oneshot
WorkingDirectory=/opt/civilization-0
EnvironmentFile=/opt/civilization-0/.env
EnvironmentFile=/etc/civ0-scheduler.env
ExecStart=/opt/civilization-0/packages/scheduler/scripts/drain-if-requested.sh
ExecStopPost=/opt/civilization-0/packages/scheduler/scripts/tick-log.sh
```

`packages/scheduler/deploy/civ0-tick-drainer.timer`:
```ini
[Unit]
Description=Run the Civilization-0 tick drainer every 60s

[Timer]
OnBootSec=60s
OnUnitActiveSec=60s
AccuracySec=5s

[Install]
WantedBy=timers.target
```

- [ ] **Step 7: Document deploy + the prerequisite flock wrap** — append a section to `docs/zerog-runbook.md`:

```markdown
## On-demand ticks (Advance-the-world-now button)

The web button enqueues a `tick_request`; a 60s timer services it with one real
`run-scheduler` tick. Deploy on the VPS:

1. `git pull` in /opt/civilization-0 (carries the scripts + deploy/ units).
2. **Prerequisite — share the lock.** Wrap the existing `civ0-scheduler.service`
   ExecStart so both timers serialize on the same lock. Edit the unit:
   `ExecStart=/usr/bin/flock -n /run/civ0-scheduler.lock <existing run-scheduler command>`
   then `systemctl daemon-reload`.
3. Install the drainer:
   `cp packages/scheduler/deploy/civ0-tick-drainer.{service,timer} /etc/systemd/system/`
   `systemctl daemon-reload && systemctl enable --now civ0-tick-drainer.timer`
4. Verify: `journalctl -u civ0-tick-drainer -f` shows "no pending tick_request"
   each minute; click the button → next cycle runs a tick and `tick.log` shows
   `result=success`.

`flock -n` means a cycle that finds a tick already running skips cleanly and
retries next minute — no double-tick, no double OG spend.
```

- [ ] **Step 8: Typecheck + commit**

Run: `pnpm -C packages/scheduler exec tsc --noEmit` (no NEW errors)
```bash
git add packages/scheduler/scripts/has-pending-tick-request.ts packages/scheduler/src/has-pending-tick-request.test.ts \
  packages/scheduler/scripts/drain-if-requested.sh packages/scheduler/deploy/ docs/zerog-runbook.md
git commit -m "feat(scheduler): on-demand tick drainer (detector, flock wrapper, systemd units)"
```

---

### Task 5: `AdvanceWorldButton` + wire into `/world`

**Files:**
- Create: `apps/web/components/AdvanceWorldButton.tsx`
- Modify: `apps/web/app/world/page.tsx`
- Test: `apps/web/components/AdvanceWorldButton.test.tsx`

**Interfaces:**
- Consumes: `POST /api/interventions {type:"tick_request"}` (Task 3); `GET /api/interventions?worldId=` (existing, returns `Intervention[]`).
- Produces: `AdvanceWorldButton({ worldId }: { worldId: string })`.

- [ ] **Step 1: Write the failing test** — create `apps/web/components/AdvanceWorldButton.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { AdvanceWorldButton } from "./AdvanceWorldButton";

beforeEach(() => { vi.restoreAllMocks(); });

describe("AdvanceWorldButton", () => {
  it("posts a tick_request and shows the queued state", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ id: "t1", status: "pending" }), { status: 201 })) as never;
    render(<AdvanceWorldButton worldId="w1" />);
    fireEvent.click(screen.getByRole("button", { name: /advance the world/i }));
    await waitFor(() => expect(global.fetch).toHaveBeenCalled());
    expect(await screen.findByText(/queued/i)).toBeTruthy();
    const body = JSON.parse((global.fetch as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][1].body);
    expect(body).toMatchObject({ worldId: "w1", type: "tick_request" });
  });

  it("shows a cooldown message on 429", async () => {
    global.fetch = vi.fn(async () =>
      new Response(JSON.stringify({ error: "cooldown", retryAfterMs: 60000 }), { status: 429 })) as never;
    render(<AdvanceWorldButton worldId="w1" />);
    fireEvent.click(screen.getByRole("button", { name: /advance the world/i }));
    expect(await screen.findByText(/wait|cooldown/i)).toBeTruthy();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `API_KEY="" pnpm -C apps/web test -- AdvanceWorldButton`
Expected: FAIL — cannot find module `./AdvanceWorldButton`.

- [ ] **Step 3: Implement** — create `apps/web/components/AdvanceWorldButton.tsx`:

```tsx
"use client";
import React from "react";

type State = "idle" | "posting" | "queued" | "running" | "done" | "cooldown" | "error";

export function AdvanceWorldButton({ worldId }: { worldId: string }) {
  const [state, setState] = React.useState<State>("idle");
  const [rowId, setRowId] = React.useState<string | null>(null);
  const [day, setDay] = React.useState<number | null>(null);
  const [cooldownMs, setCooldownMs] = React.useState(0);

  // Tick down the cooldown countdown.
  React.useEffect(() => {
    if (state !== "cooldown" || cooldownMs <= 0) return;
    const t = setTimeout(() => setCooldownMs((m) => Math.max(0, m - 1000)), 1000);
    if (cooldownMs - 1000 <= 0) setState("idle");
    return () => clearTimeout(t);
  }, [state, cooldownMs]);

  // Poll for the request to be applied.
  React.useEffect(() => {
    if ((state !== "queued" && state !== "running") || !rowId) return;
    const poll = setInterval(async () => {
      try {
        const res = await fetch(`/api/interventions?worldId=${encodeURIComponent(worldId)}`);
        if (!res.ok) return;
        const rows: { id: string; status: string; appliedDay: number | null }[] = await res.json();
        const row = rows.find((r) => r.id === rowId);
        if (row && row.status === "applied") {
          setDay(row.appliedDay);
          setState("done");
        } else if (row && row.status === "pending") {
          setState("running");
        }
      } catch { /* keep polling */ }
    }, 4000);
    return () => clearInterval(poll);
  }, [state, rowId, worldId]);

  async function advance() {
    setState("posting");
    try {
      const res = await fetch("/api/interventions", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ worldId, type: "tick_request" }),
      });
      if (res.status === 429) {
        const j = await res.json().catch(() => ({}));
        setCooldownMs(Number(j.retryAfterMs ?? 120000));
        setState("cooldown");
        return;
      }
      if (!res.ok) { setState("error"); return; }
      const row = await res.json();
      setRowId(row.id);
      setState("queued");
    } catch { setState("error"); }
  }

  const busy = state === "posting" || state === "queued" || state === "running";
  return (
    <div className="advance-world">
      <button onClick={advance} disabled={busy || state === "cooldown"}>
        Advance the world now
      </button>
      <span className="advance-cost mono">Forces a real tick · ~0.017 OG · 1 credit (free in preview)</span>
      {state === "queued" && <p className="advance-status">Queued — a tick is on the way.</p>}
      {state === "running" && <p className="advance-status">Ticking on 0G…</p>}
      {state === "done" && <p className="advance-status">The world advanced to day {day}.</p>}
      {state === "cooldown" && <p className="advance-status">Just ticked — wait {Math.ceil(cooldownMs / 1000)}s.</p>}
      {state === "error" && <p className="advance-error">Couldn&apos;t request a tick — you may not have rights here.</p>}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `API_KEY="" pnpm -C apps/web test -- AdvanceWorldButton`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire into `/world`** — in `apps/web/app/world/page.tsx`:

Add import near the `WorldEventBox` import:
```ts
import { AdvanceWorldButton } from "../../components/AdvanceWorldButton";
```
Render it next to the existing owner-gated `WorldEventBox` (same `showWorldEvent` condition):
```tsx
      {showWorldEvent && <AdvanceWorldButton worldId="genesis" />}
      {showWorldEvent && <WorldEventBox worldId="genesis" />}
```

- [ ] **Step 6: Typecheck + commit**

Run: `pnpm -C apps/web exec tsc --noEmit` (no NEW errors in changed files)
```bash
git add apps/web/components/AdvanceWorldButton.tsx apps/web/components/AdvanceWorldButton.test.tsx apps/web/app/world/page.tsx
git commit -m "feat(web): Advance-the-world-now button on /world"
```

---

### Task 6: Full suite + open PR

- [ ] **Step 1: Run the changed-package suites**

Run:
```bash
API_KEY="" pnpm -C packages/scheduler test
API_KEY="" pnpm -C packages/persistence test
API_KEY="" pnpm -C apps/web test
```
Expected: all green (pre-existing OPIK-keyed eval suites may skip/fail as before — note, don't fix here).

- [ ] **Step 2: Push and open the PR**

```bash
git push -u origin feat/advance-world-button
gh pr create --title "Advance-the-world-now button" \
  --body "$(cat <<'EOF'
Owner-only button on /world that enqueues a tick_request; a 60s VPS timer
(civ0-tick-drainer) services it with one real run-scheduler tick under a shared
flock. No-op applier self-clears the request; cost seam (assertCanForceTick) +
per-world cooldown bound spend. Paid rail designed (seam) but not charged yet.

Spec: docs/superpowers/specs/2026-06-30-advance-world-now-button-design.md
Deploy steps (timer + flock wrap of the existing service): docs/zerog-runbook.md
EOF
)"
```

- [ ] **Step 3: Manual acceptance (post-deploy, before the demo)** — follow the "Manual acceptance" section of the spec: deploy web + VPS units (with the flock wrap), click the button as the genesis owner, confirm `tick.log` shows `result=success` within ~60–90s, the button flips to "advanced to day N", an immediate re-click shows the cooldown, and a fresh decision's `/verify/<root>` resolves `verified: true`.

---

## Self-Review

**Spec coverage:** `tick_request` type + no-op applier (T1) ✓; global-day tick via existing run-scheduler (T1 wiring) ✓; coalescing — one run drains all pending (inherent in run-scheduler + drain, T1) ✓; cost seam + cooldown (T2) ✓; API branch with 401/403/404/429 (T3) ✓; VPS drainer + flock + coalescing + prod env + timer 60s (T4) ✓; flock prerequisite on existing service (T4 runbook) ✓; owner-only `/world` button + polling status + cost affordance + cooldown countdown (T5) ✓; testing matrix (T1–T5 tests) ✓; manual acceptance (T6) ✓. Paid rail / credits ledger correctly left as seam only (out of scope) ✓.

**Placeholder scan:** no TBD/TODO; every code step shows full code; commands have expected output. ✓

**Type consistency:** `assertCanForceTick(user, world, lastTickRequestMs, now)` and `ForceTickError{status,retryAfterMs}` used identically in T2 (def) and T3 (consume); `lastTickRequestAtMs(worldId)` def T2 / mock+consume T3; `makeTickRequestApplier()` def T1 / wire T1; `countPendingTickRequests(pending)` def+test T4; `AdvanceWorldButton({worldId})` def+test T5. ✓
