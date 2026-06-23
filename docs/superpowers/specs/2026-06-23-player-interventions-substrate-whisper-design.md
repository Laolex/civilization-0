# Player Interventions — Substrate + Whisper (Sub-project 1 of 3) — Design

Date: 2026-06-23
Status: Approved (design); spec under review

## Program context

Turn Civilization-0 from a read-only observation surface into a game where a
player influences the sim. Three intervention mechanics share one pipeline,
built in order of increasing invasiveness:

1. **Substrate + Whisper** (this spec) — the intervention queue + a tick-time
   drain, proven via per-citizen pinned-memory injection.
2. **World-event** — make world state world-scoped, then set a headline/shock.
3. **Dilemma** — constrain a citizen's `availableActions` for a forced choice.

Each is a separate spec → plan → PR.

## Authorization (shared by all three)

`canIntervene(user, world): boolean` — true if `world.ownerId === user.id`, OR
the world is shared (`genesis`) AND the user's plan is premium (`pro` |
`research`). Reuses existing auth (sessions → user + plan) and world ownership.
No billing work: own-world is free to any signed-in user; shared-world tinkering
is gated to premium.

## Findings that shaped this design

- `world_state` is a **global singleton** (`WHERE id = 1`); only citizens/
  relationships/orgs are `world_id`-scoped. Hence whisper (per-citizen memory)
  is the cleanest first mechanic; world-event (per-world state) is deferred to
  sub-project 2.
- The tick hydrates an in-memory store from Postgres via
  `WorldRepository.loadContext(citizenId)`, which loads all of a citizen's
  memories; the tick then retrieves top-`RETRIEVE_K`(5) by similarity. To
  guarantee a whisper lands, it must be **pinned** (force-included), not left to
  similarity ranking.
- The live driver `scripts/run-scheduler.ts` ticks all citizens through
  `runDay`. The drain runs at the **start of `runDay`**; interventions carry
  their own `worldId`/`targetCitizenId`, so the drain need not be world-scoped.

## Components

### 1. Schema (`schema.sql`)
- New `interventions` table:
  `id, world_id, user_id, type text, target_citizen_id text NULL,
   payload jsonb, status text DEFAULT 'pending', created_at timestamptz
   DEFAULT now(), applied_day int NULL`.
  Index on `(status)` for the drain. `type` is `'whisper'` here; `'world_event'`
  and `'dilemma'` are added by later sub-projects. Whisper payload = `{ text }`.
- New column `memories.pinned boolean NOT NULL DEFAULT false`.

### 2. Authorization — `persistence/src/intervention-authz.ts`
- Pure `canIntervene(user: { id; plan }, world: { id; ownerId }): boolean`.
  Unit-tested truth table. The `genesis` world id is the shared world.

### 3. Persistence — `persistence/src/intervention-write.ts` / reads
- `enqueueIntervention(input)` → inserts a pending row, returns it.
- `listInterventions(worldId, limit)` → recent rows for UI feedback.
- `pendingInterventions()` → all `status='pending'` rows (drain input).
- `markInterventionApplied(id, day)` / `markInterventionFailed(id)`.
- `addPinnedMemory(m)` → inserts a `memories` row with `pinned = true`.

### 4. Drain + whisper applier — `scheduler/src/interventions.ts`
- `drainInterventions(deps, day)`:
  - `deps = { repo, embedder, idgen }` (injected for tests; no network).
  - for each pending intervention:
    - `whisper`: insert a pinned, high-importance (`importance = 10`) memory for
      `targetCitizenId` with `summary = payload.text` and an embedding from
      `embedder.embed(text)` (a valid embedding is required or the memory index
      crashes). Mark applied with `day`.
    - unknown/invalid target → `markInterventionFailed` (never throws).
  - idempotent: only `pending` rows are processed; applied rows are skipped.
- Called at the start of `runDay` (before the citizen loop) so the new memory is
  visible to `loadContext` in the same day.

### 5. Engine pin support
- `WorldStore`/`InMemoryWorldStore`: track pinned memories; `getPinnedMemories
  (citizenId)`; `clearPin(memoryId)`.
- `loadContext` populates `pinned` from the DB column.
- `runCitizenTick`: build context memories as `dedupe([...pinnedMemories,
  ...retrieved])`. Pinned memories are force-included on every tick they exist
  for. After the decision, **clear the pin on all pinned memories that were
  force-included this tick** (so a whisper influences exactly one decision) and
  persist the unpin via `persistTick` / `repo.unpinMemory(id)`.

### 6. API (Next.js) — `apps/web/app/api/interventions/route.ts`
- `POST` (authenticated): body `{ worldId, type: 'whisper', targetCitizenId,
  text }`. Loads the session user + world; rejects `401` if unauthenticated,
  `403` if `!canIntervene`, `400` if the target citizen is not in `worldId` or
  `text` is empty/too long (cap ~280 chars). On success enqueues a pending row,
  returns `201` with the row.
- `GET ?worldId=` (authenticated, must pass `canIntervene`): recent interventions
  for that world.

### 7. UI — citizen detail (`apps/web/app/citizens/[id]/page.tsx` + a client component)
- A "Whisper" control (small text input + send) shown only when the viewer
  `canIntervene` on that citizen's world. On submit → `POST /api/interventions`;
  shows a confirmation and the pending whisper ("Ada will hear this on day N").
- Hidden entirely for viewers without rights (no disabled teaser).

## Error handling

- API validates and returns typed 4xx; never 500s on bad input.
- The drain is best-effort per item (`markInterventionFailed` on a bad target),
  so one malformed intervention can't stall a day.
- A pinned whisper is force-included for exactly one tick then cleared, so it
  can't pin forever.

## Testing (TDD)

1. `canIntervene` truth table: owner yes; non-owner no; shared+premium yes;
   shared+free no.
2. `enqueueIntervention` / `pendingInterventions` / `markInterventionApplied`
   round-trip (integration, against a test DB).
3. `drainInterventions`: a pending whisper becomes a pinned importance-10 memory
   with a non-empty embedding and is marked applied; a whisper for an unknown
   citizen is marked failed and does not throw; an already-applied row is
   skipped (idempotent).
4. Engine: a pinned memory is force-included in `runCitizenTick`'s decision
   context even when similarity would exclude it, and is cleared after the tick.
5. API: 401 unauthenticated; 403 when `!canIntervene`; 400 for a target citizen
   outside the world / empty text; 201 enqueues exactly one pending row.

## Out of scope (later sub-projects)

World-scoped world state, world-event and dilemma mechanics, rate-limiting,
moderation, and any billing/checkout for the premium shared-world gate (the gate
reads existing plan only).
