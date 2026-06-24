# Player Interventions — Dilemma (sub-project 3) — Design

**Status:** Approved (2026-06-24). Part of the player-interventions program (v2 gameplay/interactivity line). Stacked on `feat/player-interventions-world-event`.

## Goal

Let an authorized player force a target citizen into a constrained decision on their **next tick**: a short *framing line* plus a *whitelist of 2+ allowed actions*. Both effects are consumed **one-shot** on that one decision, then the citizen returns to normal.

This is the third interventions mechanic, after Whisper (sub-project 1) and World-event (sub-project 2). It reuses the existing intervention queue + drain substrate (`interventions` table, `canIntervene`, `/api/interventions`, the day-start drain).

## Why it is mostly reuse

A dilemma is two effects landing on the same next decision, each already feasible:

1. **Framing line** — delivered as a *pinned* importance-10 memory for the target citizen. This is exactly what the Whisper applier already does (`addPinnedMemory`), and the existing one-shot clear path (`TickResult.consumedPins` → `repo.unpinMemory`) already removes it after one tick. **No new substrate for the text.**
2. **Action constraint** — narrow the citizen's `availableActions` for that one tick. The 0G brain both lists the allowed set in its prompt (`packages/zerog/src/brain.ts:24` — `Allowed actions: ${ctx.availableActions.join(", ")}.`) and **parse-rejects** any chosen action outside the set (`brain.ts:69`), forcing a repair/coerce. So narrowing the set genuinely forces the choice. **This is the only new substrate.**

## The new substrate — one-shot per-citizen action constraint

Mirrors the existing pinned-memory lifecycle.

- **Schema:** add `citizens.forced_actions JSONB` nullable, default `null`. `null` means "no dilemma". When set, it holds a JSON array of action verbs (a subset of `ALL_ACTIONS`). JSONB matches how `citizens.traits` is already stored.
- **Store (`@civ/store`):** add to `WorldStore`:
  - `getForcedActions(citizenId: string): ActionType[] | null`
  - `setForcedActions(citizenId: string, actions: ActionType[] | null): void`
  - In-memory: a `Map<string, ActionType[]>` (absence ⇒ `null`).
- **`loadContext` (`WorldRepository`):** after the citizen is upserted into the store, read `forced_actions` from the citizen row and `store.setForcedActions(id, actions)` when present.
- **Engine tick (`runCitizenTick`):** replace the hardcoded `availableActions: ALL_ACTIONS` (`packages/engine/src/index.ts:62`) with `const forced = store.getForcedActions(citizenId); ... availableActions: forced ?? ALL_ACTIONS`. Add `consumedDilemma: boolean` to `TickResult` (true when `forced` was non-null), analogous to `consumedPins`.
- **Loop (`runDay`):** after `persistTick`, alongside the existing unpin loop, add `if (result.consumedDilemma) await deps.repo.clearForcedActions(id);` so the constraint is cleared one-shot. `clearForcedActions(id)` sets the column back to `null`.
- **Repository:** add `setForcedActions(citizenId, actions)` (drain applier uses it) and `clearForcedActions(citizenId)` (loop uses it); the load happens in `loadContext`.

## Drain + applier

- New `makeDilemmaApplier(repo, embedder)` in `packages/scheduler/src/interventions.ts`. Given a `dilemma` intervention it:
  1. Reads `text` and `actions` from `iv.payload`.
  2. Validates: `text` is a non-empty string (trim); `actions` is an array that is a **subset of `ALL_ACTIONS`** with **length ≥ 2** (a dilemma must offer a real choice). Throw on violation (drain marks it failed) — self-defending, matching the world-event applier's trim/cap hardening.
  3. Confirms the target citizen is in the intervention's world (`repo.getCitizenWorldId(citizenId) === iv.worldId`) — defense in depth, like Whisper.
  4. `repo.setForcedActions(citizenId, actions)` **and** writes the framing pinned memory via the same `addPinnedMemory` path Whisper uses (deterministic id `dl-${iv.id}`, importance 10, `pinned: true`, embedding of the framing text).
- Drain dispatch (`drainInterventions`) gains a `dilemma` branch in the existing type→applier map: `iv.type === "dilemma" ? deps.applyDilemma : …`. `DrainDeps.applyDilemma?` is optional, like `applyWorldEvent`. Truly-unknown types remain left pending (never marked applied/failed), and the never-throw bookkeeping is preserved.
- `run-scheduler.ts` constructs `applyDilemma = makeDilemmaApplier(repo, embedder)` and passes it into the drain deps.

## API

`POST /api/interventions` gains a `dilemma` branch:

- Body: `{ worldId, type: "dilemma", targetCitizenId, text, actions }`, `payload = { text, actions }`.
- Validation order mirrors Whisper: 401 (no user) → unknown type 400 → `worldId` required → `targetCitizenId` required → `text` 1..280 chars → `actions` is a subset of `ALL_ACTIONS` with length ≥ 2 (else 400) → 404 missing world → 403 `!canIntervene` → citizen-in-world 400 → 201.
- The applier re-validates (self-defending); the API is the primary gate.

## UI

- `DilemmaBox` client component on the **citizen page** (`apps/web/app/citizens/[id]/page.tsx`), beside `WhisperBox`, **server-gated** by the same `canIntervene` (a world owner always; the shared `genesis` world gated to `pro`/`research`). The gate is a server decision — the control never reaches unauthorized viewers.
- UI: a framing textarea (280-char cap) + checkboxes for the 13 actions. "Force dilemma" is disabled until the framing is non-empty and **≥ 2** actions are checked. Posts `{ worldId, type: "dilemma", targetCitizenId, text, actions }`; shows a confirmation on 201, an error otherwise.

## Semantics & edge cases

- **One-shot.** The constraint and the framing pin both clear after the citizen's next tick. If the citizen is not selected to tick on a given day (tier-based selection), the dilemma persists in the DB until they do — exactly like a pending Whisper pin.
- **Last-wins.** If two dilemmas are queued for the same citizen before they tick, `setForcedActions` overwrites (last constraint wins); both framing pins are present and both clear on the next tick. Acceptable.
- **Auditability.** The narrowed action set is visible in the brain prompt and the framing memory appears in the decision's drivers, so the dilemma is reflected in the normal decision trace — no separate audit surface needed.
- **Back-compat.** `forced_actions` is additive and nullable; existing citizens default to `null` (no dilemma), and the Whisper/World-event paths are untouched.

## Out of scope

- World-scoped (per-owned-world) dilemma dashboards beyond the citizen page.
- Multi-tick / duration dilemmas (this is strictly one-shot).
- v3 "play-as-citizen".
- Rate-limiting / billing metering of interventions.

## Authorization (unchanged, reused)

`canIntervene(user, world)` already encodes: a world owner may always intervene; the shared `genesis` world (no owner) is gated to premium plans (`pro`/`research`). The API enforces it independently of the UI gate (defense in depth).
