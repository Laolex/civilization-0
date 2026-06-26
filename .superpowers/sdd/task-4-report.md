# Task 4 Report: Engine wiring + `socialDrivers` provenance

## What was built

Extended the GraphRAG pipeline through the engine tick so social context (1-hop neighbors + org) is retrieved per tick, passed to the brain, and recorded in the archived provenance trace.

### Files changed

1. **`packages/explainability/src/index.ts`** — Extended `TraceDrivers` with optional `socialDrivers?` and `orgDriver?` fields (no other change; `buildAndArchive` already passes `drivers` verbatim into the archived record).

2. **`packages/engine/src/index.ts`** — Five changes:
   - Added `GraphRetriever` to the `@civ/memory` import.
   - Added `graphRetriever?: GraphRetriever` to `TickDeps` (optional — graceful degradation).
   - Added `NEIGHBOR_K = 3` and `r2` rounding helper constants.
   - After `relationships` retrieval: select `neighbors` via `graphRetriever.selectNeighbors(...)` (or `[]`) and `orgContext` via `store.getOrgContext(citizenId)`.
   - Passed `neighbors` + `orgContext` into `brain.decide`; extended `drivers` object in `explain.buildAndArchive` with `socialDrivers` (mapped from `ScoredNeighbor[]` with r2-rounded scores) and `orgDriver`.

3. **`packages/engine/src/scenario.ts`** — Added `GraphRetriever` to the `@civ/memory` import and `graphRetriever: new GraphRetriever(embedder)` to the deps object.

4. **`packages/engine/src/graph-drivers.test.ts`** — New test file (3 tests) per brief verbatim.

## TDD Evidence

### RED (failing test run before implementation)

```
pnpm test packages/engine/src/graph-drivers.test.ts

FAIL  packages/engine/src/graph-drivers.test.ts
  - "passes selected neighbors + org into the brain context" — FAIL (graphRetriever not on TickDeps, type error at compile; test ran but ctx.neighbors was undefined)
  - "records socialDrivers + orgDriver in the archived trace record" — FAIL (rec.drivers.socialDrivers is undefined → TypeError)
  - "degrades to empty socialDrivers when no graphRetriever is wired" — FAIL (rec.drivers.socialDrivers is undefined, not [])

Test Files  1 failed (1)
Tests  3 failed (3)
```

### GREEN (after implementation)

```
pnpm test packages/engine/src/graph-drivers.test.ts

✓ packages/engine/src/graph-drivers.test.ts (3 tests) 4ms

Test Files  1 passed (1)
Tests  3 passed (3)
```

## Full suite result

```
pnpm test

Test Files  1 failed | 47 passed (48)
Tests  2 failed | 190 passed (192)
```

The 2 failures are the pre-existing `packages/zerog/src/eval/judge-metric.test.ts` OPIK_API_KEY failures — unrelated to this task, known pre-existing. All other tests pass.

## Typecheck result

```
pnpm typecheck
(no output — clean)
```

Zero TypeScript errors. All existing `TickDeps` literals (e.g. in `scenario.ts` before our edit, other test fixtures) compile unchanged because `graphRetriever` is optional.

## Commit

SHA: `19806c8`
Subject: `feat(graphrag): engine selects neighbors + records socialDrivers/orgDriver`
Branch: `feat/graphrag-neighbor-retrieval`

## Self-review

- Graceful degradation: `graphRetriever?: GraphRetriever` is optional; when undefined `neighbors = []` and `socialDrivers = []` — test 3 asserts exactly this.
- No DB schema changes.
- `r2` rounds to 2 decimal places, consistent with existing `round2` in explainability.
- `NEIGHBOR_K` reads from env with default 3, consistent with `RETRIEVE_K` pattern.
- No AI attribution, no Co-Authored-By trailer.
- Work isolated to `feat/graphrag-neighbor-retrieval` worktree — master untouched.

## Concerns

None. Implementation was straightforward. The brief was complete and self-consistent.
