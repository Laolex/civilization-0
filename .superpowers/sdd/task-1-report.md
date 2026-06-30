# Task 1 Report: Scaffold the `@civ/history` package + Phase 1A event types

**Status:** DONE
**Commit:** `90e6263 feat(history): scaffold @civ/history package + Phase 1A event types`
**Branch:** `feat/history-event-engine`

## What was implemented
A new workspace package `@civ/history` containing only the frozen Phase 1A type
surface and constants — no logic yet. Every later task (build, canon, append,
fold, project, CLI, anchor) consumes these types.

### Files created
- `packages/history/package.json` — `@civ/history`, ESM, deps on `@civ/shared`,
  `@civ/engine`, `@civ/storage`, `@civ/zerog`, `pg` (+ `@types/pg`).
- `packages/history/tsconfig.json` — extends base, `include: ["src","scripts"]`.
- `packages/history/src/types.ts` — the four-invariants doc comment (verbatim,
  binding), `SCHEMA_VERSION=1`, `CANON_VERSION="jcs-1"`, `GENESIS_PARENT=0x0…64`,
  and all Phase 1A types: `EventHeader`, `Observation`, `ExecutionContext`,
  `WorldDelta`, `WeightedMemory/Belief`, `CandidateEvaluation`, `BeliefDelta`,
  `CognitiveTransition` (candidates/beliefDelta typed `… | null`, null in 1A),
  `AnchorEvent`, `HistoryEvent` union, `eventKind()` discriminator, `WorldState`
  (fold output), `ExplainView` (project output; candidates/beliefDelta render
  `… | "unavailable"` per Invariant #1).
- `packages/history/src/index.ts` — barrel re-exporting `./types`.
- `packages/history/src/types.test.ts` — 2 tests (version/genesis pins; eventKind
  discrimination).

### Files modified
- `tsconfig.base.json` — added `"@civ/history": ["packages/history/src"]` to paths.
- `pnpm-lock.yaml` — new package wired into the workspace.

## Verification (controller-run)
- Unit test: `pnpm vitest run packages/history/src/types.test.ts` → **2/2 passing**, output pristine.
- Typecheck: `pnpm -r typecheck` → **clean across 14 workspace projects**.

## Notes / concerns
- The implementer subagent did not write this report file (it left stale prior-task
  content); this report was reconstructed by the controller from the verified
  commit + working tree. Implementation itself is faithful to the plan.
- `SocialDriver` is imported from `@civ/shared` (added by prior GraphRAG work) —
  reused, not redefined.
