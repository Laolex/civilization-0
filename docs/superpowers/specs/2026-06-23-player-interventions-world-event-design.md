# Player Interventions — World-event (Sub-project 2 of 3) — Design

Date: 2026-06-23
Status: Approved (design); spec under review

## Program context

Second of three player-intervention mechanics that turn Civilization-0 from a
read-only observation surface into a game. Sub-project 1 (Whisper) built the
shared substrate: the `interventions` queue, the tick-time drain, and the
`canIntervene` authorization rule. This sub-project adds **world-event**: a
player sets a standing headline for a world, and every citizen in that world
reasons over it on their next tick.

- **Base branch:** `feat/player-interventions-whisper` (the substrate is there,
  unmerged). New work branches from it as
  `feat/player-interventions-world-event`.
- Sub-project 3 (Dilemma) is later and out of scope here.

## Decisions (locked)

- **Per-world headline overlay.** Add a per-world standing headline; the global
  `world_state` `day`/`economy` are unchanged. (Full per-world world_state was
  rejected — day-per-world would break the scheduler's single global-day model.)
- **Persistent until changed.** A set headline is the world's standing state and
  influences every tick until the player sets a new one. No clearing/expiry
  logic. (Matches how headlines already behave: static and ambient.)
- **Headline cap: 140 chars.** (Whisper's cap is 280; a headline is shorter.)
- **UI lives on the `/world` (genesis) dashboard** for v1 — this is the
  premium-gated shared-world path. Owned-world UI waits for a per-world
  dashboard (not built here).

## Why this is small

The `headline` already flows into each citizen's decision prompt
(`buildMessages` includes `worldState.headline`), so setting a per-world
headline is sufficient to make a whole population react — no per-citizen memory
needed. The mechanic reuses the existing queue, drain, `canIntervene`, and API
route; only a new applier branch + an overlay read are genuinely new.

## Components

### 1. Schema (`schema.sql`)
- `ALTER TABLE worlds ADD COLUMN IF NOT EXISTS headline TEXT NOT NULL DEFAULT '';`
  Empty string = no override.

### 2. Overlay at tick time — `repository.ts` `loadContext`
- After `store.setWorldState({...global...})`, read the citizen's own world's
  headline (`SELECT headline FROM worlds WHERE id = <citizen.world_id>`; the
  citizen row loaded in `loadContext` already carries `world_id`). If non-empty,
  re-set the world state with `headline` overridden by the world's value.
  Day + economy stay from the global `world_state`.

### 3. Persistence — `repository.ts`
- `setWorldHeadline(worldId: string, headline: string): Promise<void>` →
  `UPDATE worlds SET headline = $2 WHERE id = $1`.

### 4. Drain dispatch + applier — `scheduler/src/interventions.ts`
- Extend `DrainDeps` with `applyWorldEvent?: (iv: Intervention, day: number) =>
  Promise<void>`.
- In `drainInterventions`, dispatch by type:
  `whisper → deps.applyWhisper`, `world_event → deps.applyWorldEvent`, else skip
  (leave pending). Same `markApplied`/`markFailed` bookkeeping and never-throw
  hardening already in place.
- `makeWorldEventApplier(repo: { setWorldHeadline(worldId, headline):
  Promise<void> })` → `async (iv, _day) => { const headline =
  typeof iv.payload.headline === "string" ? iv.payload.headline : ""; if
  (!headline) throw new Error("world_event missing headline"); await
  repo.setWorldHeadline(iv.worldId, headline); }`.
- Wire `applyWorldEvent` into the drain construction in
  `scheduler/scripts/run-scheduler.ts`.

### 5. API — `apps/web/app/api/interventions/route.ts`
- Accept `type: "world_event"` with body `{ worldId, headline }` (no
  `targetCitizenId`).
- Order: 401 if unauthenticated; 400 if type not in
  {`whisper`,`world_event`}; then per-type validation:
  - whisper (unchanged): worldId+targetCitizenId required, text 1..280, then
    world 404, `canIntervene` 403, citizen-in-world 400, enqueue.
  - world_event: worldId required, headline 1..140; then world 404,
    `canIntervene` 403; enqueue with `payload: { headline }`,
    `targetCitizenId: null`.
- 201 on enqueue.

### 6. UI — `apps/web/components/WorldEventBox.tsx` + `/world` page
- A `"use client"` `WorldEventBox` mirroring `WhisperBox`: props
  `{ worldId }`; an input (maxLength 140) + Send that POSTs
  `{ worldId, type: "world_event", headline }` to `/api/interventions`; shows a
  confirmation on 2xx ("The world will feel this on the next day") and an error
  on failure; does not fetch when empty/over-cap.
- On `apps/web/app/world/page.tsx`: load `getCurrentUser()`; the dashboard is
  the `genesis` world, so load `readWorld(getPool(), "genesis")` and compute
  `canIntervene({id, plan}, {id, ownerId})`; when true, render
  `<WorldEventBox worldId="genesis" />`. Render nothing otherwise (no teaser).

## Error handling

- API validates and returns typed 4xx; no 500 on bad/malformed input.
- The drain applier throws on a missing headline → the drain marks the
  intervention failed without aborting the day (existing hardening).
- An unknown intervention type is left pending (not failed), exactly as today.

## Testing (TDD)

1. `setWorldHeadline` round-trip (integration, test DB).
2. `loadContext` overlay (integration): a citizen whose world has a non-empty
   headline gets it on `worldState.headline`; a world with an empty headline
   falls back to the global `world_state.headline`.
3. `makeWorldEventApplier` sets the world's headline; throws on missing headline.
4. `drainInterventions` dispatches a `world_event` to `applyWorldEvent`, a
   `whisper` to `applyWhisper`, and still skips a truly-unknown type (left
   pending, not marked).
5. API: 201 for a valid world_event; 400 for empty/over-cap (>140) headline;
   403 when `!canIntervene`; 404 for a missing world; 400 for an unknown type.
6. `WorldEventBox`: posts and shows confirmation; blocks empty input.

## Out of scope (later sub-projects / future)

Dilemma mechanic (sub-project 3); per-world economy shocks; one-tick/duration
event lifetimes; world-event history or provenance surfacing; a per-owned-world
dashboard; any billing (the premium gate reads the existing plan only).
