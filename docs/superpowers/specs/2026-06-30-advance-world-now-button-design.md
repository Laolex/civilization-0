# Advance-the-world-now Button — Design

Date: 2026-06-30
Status: Approved (design); spec under review

## Program context

Today the world only moves when the systemd scheduler fires its 2-hour timer (or
an operator runs `run-scheduler.ts` by hand on the VPS). Player interventions
(whisper / dilemma / world-event) are **queued** through `/api/interventions`
and only take visible effect on the *next* tick — so to demo "I steered it, now
prove it" you must drop to a terminal between the intervention and the result.

This adds a **"Advance the world now"** button to the `/world` dashboard that an
owner can click to make the next tick happen on demand — draining any pending
whisper/headline at the same time. It reuses the existing enqueue→drain
substrate end-to-end: the button never runs a tick in the browser (the live app
is on Vercel — no wallet, no long-running process); it enqueues a `tick_request`
that a small VPS timer notices and services with a real `run-scheduler` run.

- **Base branch:** `feat/advance-world-button` from `master`.
- **Ships for:** the R32 demo (live on civilization-0.vercel.app before Jul 1
  10:00 UTC). The paid rail is **designed now, built later** (see Cost seam).

## Decisions (locked)

- **Enqueue → VPS drains.** The button POSTs a new `tick_request` intervention.
  A new VPS systemd timer (`civ0-tick-drainer`, ~every 60s) detects a pending
  `tick_request` and runs `run-scheduler.ts --days 1`. The tick is *real* — no
  faking — which is what the tournament rewards. (A direct VPS HTTP trigger was
  rejected: more attack surface, holds the wallet, more to harden before Jul 1.)
- **A forced tick advances the GLOBAL day**, exactly like the scheduled 2-hour
  tick — same single global-day model the world-event spec established. Clicking
  on a world advances the whole sim by one day and drains *all* pending
  interventions across worlds. This is intended, not a per-world fork.
- **The drainer coalesces.** Many pending `tick_request`s collapse into **one**
  `run-scheduler` run = one day = one OG spend. Spam cannot multiply spend.
- **`tick_request` is a no-op at apply time.** Its only job is to *cause* the
  run; the run itself is the effect. The applier just lets the drain mark it
  applied so it self-clears.
- **Spend is bounded three ways:** a shared `flock` (no overlap with the 2-hour
  timer or another drain), the coalescing above, and a per-world **2-minute
  cooldown** at enqueue. `run-scheduler`'s existing balance floor still applies.
- **Owner-only, `/world` only**, v1. Reuses `canIntervene` (plan + ownership),
  the same gate as the other interventions.
- **Status by polling.** idle → queued → running → done, polling intervention
  status / world day. No websockets.

## Why this is small

The heavy machinery already exists and is untouched: `run-scheduler.ts` already
loads pending interventions, advances the day, drains, spends OG, and self-stops
below the balance floor; `/api/interventions` already authenticates, authorizes
via `canIntervene`, and enqueues; `drainInterventions` already dispatches by
type with never-throw hardening and applied/failed bookkeeping. Genuinely new:
one queued type + a no-op applier, one cooldown check, one VPS timer that shells
the existing script under a lock, and one button.

## Components

### 1. New `tick_request` type — `apps/web/app/api/interventions/route.ts`
- Accept `type: "tick_request"` with body `{ worldId }` (no `targetCitizenId`,
  no text). Validation order mirrors the existing branches:
  401 if unauthenticated → 400 if type not in
  {`whisper`,`world_event`,`dilemma`,`tick_request`} → `worldId` required →
  world 404 → `assertCanForceTick` (see §4) which yields 403 (not owner) or 429
  (cooldown). On pass, `enqueueIntervention({ ..., type: "tick_request",
  targetCitizenId: null, payload: {} })`; 201 with the row.

### 2. No-op applier + dispatch — `scheduler/src/interventions.ts`
- Extend `DrainDeps` with `applyTickRequest?: (iv, day) => Promise<void>`.
- In `drainInterventions`, add `iv.type === "tick_request" → deps.applyTickRequest`
  to the dispatch. (Unknown types still fall through to `continue` / left
  pending, unchanged.)
- `makeTickRequestApplier()` → `async () => {}` — pure no-op so the drain marks
  it applied. No repo, no side effects.
- Wire `applyTickRequest` into the drain construction in
  `scheduler/scripts/run-scheduler.ts` alongside whisper/world_event/dilemma.

### 3. VPS drainer — `scheduler/scripts/has-pending-tick-request.ts` + systemd units
- `has-pending-tick-request.ts`: connects to the DB (same env as the scheduler),
  exits `0` if at least one pending `tick_request` exists, `1` if none. A
  `--dry-run`/`--count` mode prints the count without side effects (for the
  itest and for safe manual checks). Uses `pendingInterventions` filtered to
  `type === "tick_request"`; closes the pool.
- `civ0-tick-drainer.service` (oneshot): runs, under
  `flock -n /run/civ0-scheduler.lock` (the **same** lock the 2-hour
  `civ0-scheduler.service` must also take), a guard that runs
  `run-scheduler.ts --days 1` **only if** `has-pending-tick-request.ts` exits 0.
  Reuses the existing `EnvironmentFile=/opt/civilization-0/.env` then
  `/etc/civ0-scheduler.env` override (so it hits prod Supabase) and the existing
  `tick-log.sh` ExecStopPost. `flock -n` means: if a tick is already running,
  skip this cycle (the pending request is serviced next cycle).
- `civ0-tick-drainer.timer`: `OnUnitActiveSec=60s` (and `OnBootSec`). Documented
  in the runbook; not auto-installed by code.
- **Operational prerequisite:** the existing `civ0-scheduler.service` ExecStart
  must be wrapped in the same `flock -n /run/civ0-scheduler.lock` so the two
  timers can never tick concurrently. Called out in the runbook deploy steps.

### 4. Cost seam — `apps/web/lib/force-tick.ts` `assertCanForceTick(user, world)`
- One function, the single place the feature becomes "a little expensive" later.
- **Today (R32):** `if (!canIntervene(user, world)) throw Forbidden;` then a
  **cooldown**: reject (429) if a `tick_request` for this world was enqueued
  within `FORCE_TICK_COOLDOWN_MS` (default 120_000). Cooldown is read from the
  most-recent `tick_request` for the world via `listInterventions`. Returns
  `{ costCredits: 1, estOG: 0.017 }` purely for the affordance — **not charged**.
- **When the paid rail lands:** this function deducts a World Credit / calls the
  payment provider and throws 402 on insufficient funds. Because the drainer
  coalesces, each *requester* can still be charged at enqueue even though
  execution merges. Nothing else in the system changes.

### 5. UI — `apps/web/components/AdvanceWorldButton.tsx` + `/world`
- A `"use client"` component, props `{ worldId }`. A button "Advance the world
  now" that POSTs `{ worldId, type: "tick_request" }` to `/api/interventions`.
  State machine:
  - **idle** → on click → POST. 201 → **queued** (store row id). 429 → show
    cooldown countdown and disable until it elapses. 403/401 → hidden anyway.
  - **queued/running** → poll `GET /api/interventions?worldId=…` (existing list)
    for the row's status; while pending show "Queued — a tick is on the way",
    once the row is `applied` (or the world `day` increments) → **done**:
    "The world advanced to day N", then refresh the feed.
- Affordance text renders the returned cost ("Forces a real tick · ~0.017 OG ·
  1 credit"), with the credit shown as **"free in preview"** until the rail
  exists. Disabled with a live countdown during cooldown.
- On `apps/web/app/world/page.tsx`: it already loads `getCurrentUser()` and
  computes `canIntervene` for `WorldEventBox`; render
  `<AdvanceWorldButton worldId="genesis" />` under the same condition. Nothing
  for non-owners (no teaser).

## Error handling

- API returns typed 4xx (401/403/404/429), never 500 on bad input. 429 carries
  `retryAfterMs` for the countdown.
- The no-op applier cannot throw; a `tick_request` is always marked applied, so
  the queue self-clears and the drainer stops firing once serviced.
- `flock -n` failure = a tick is already in flight → drainer exits cleanly; the
  pending request is picked up on the next 60s cycle. No double-tick, no double
  spend.
- If `run-scheduler` stops at the balance floor, the `tick_request` stays
  pending and the drainer retries next cycle (until topped up) — surfaced in
  `tick.log`; the button shows "queued" until a tick lands.

## Testing (TDD)

1. `makeTickRequestApplier` resolves to a no-op and never throws.
2. `drainInterventions` dispatches `tick_request → applyTickRequest` and marks it
   applied; still routes whisper/world_event/dilemma correctly; still leaves a
   truly-unknown type pending.
3. API: 201 for a valid `tick_request`; 401 unauthenticated; 403 when
   `!canIntervene`; 404 missing world; **429 within the cooldown window** with
   `retryAfterMs`.
4. `assertCanForceTick`: passes for owner outside cooldown; throws 403 for
   non-owner; throws 429 inside the window; returns the cost metadata.
5. `has-pending-tick-request.ts` (itest, test DB): exit 0 when a pending
   `tick_request` exists, exit 1 when none; `--count` prints the number and
   makes no writes.
6. `AdvanceWorldButton`: posts on click; renders the queued state; renders the
   cooldown/disabled state on 429; renders "advanced to day N" when the row goes
   applied. (Component test with a mocked fetch — no real 0G.)

Real 0G execution (`run-scheduler` actually ticking) is **not** in CI; it's
verified by the manual acceptance path below.

## Manual acceptance (before the demo)

1. Deploy: web (Vercel) carries the route + button; VPS carries the new units +
   the `flock`-wrapped scheduler ExecStart. Both point at prod Supabase.
2. As the genesis-world owner, click **Advance the world now** → expect "queued".
3. Within ~60–90s `tick.log` shows a `result=success`; the button flips to
   "advanced to day N"; `/world` shows the new day and any pending headline /
   whisper now reflected.
4. Click again immediately → expect the **cooldown** (disabled + countdown), no
   second tick.
5. Verify it didn't reset: day went **N → N+1**, history intact, a fresh
   decision's `/verify/<root>` resolves `verified: true`.

## Out of scope (future)

- The real paid rail (credits ledger, payment provider, 402 path) — only the
  `assertCanForceTick` seam + affordance ship now.
- Per-owned-world dashboards / a button anywhere but `/world`.
- Choosing how many days to advance (always exactly one), or scheduling a future
  tick.
- Websocket/live push for status (polling only).
- Global (cross-world) rate limiting beyond the per-world cooldown + coalescing
  + flock already specified.
