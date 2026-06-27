# Task 5 Report: persistence `loadContext` neighbor/org hydration

## What was built

Modified `packages/persistence/src/repository.ts`:
- Added `NeighborSummary, OrgContext` to the `@civ/shared` import (alongside existing `ActionType`).
- Added module-scope consts: `NEIGHBOR_CANDIDATE_LIMIT` (default 5), `NEIGHBOR_TEXT_MAX` (default 200), and `clip` helper.
- Inserted hydration block immediately before `return store;` in `loadContext`:
  1. **Neighbor candidates**: one SQL with LATERAL joins over `relationships → citizens (same-world JOIN) → decisions / goals / beliefs`. Ordered by `(trust+influence) DESC, other_id`. Maps rows to `NeighborSummary[]` and calls `store.setNeighborCandidates(citizenId, candidates)`.
  2. **Org context**: one SQL joining `memberships → organizations`, with LATERAL join on latest `events` row by actor. Maps to `OrgContext` and calls `store.setOrgContext(citizenId, org)`.

Created `packages/persistence/src/loadcontext-graph.itest.ts` per brief verbatim.

## TDD RED → GREEN

**RED** (before implementation):
```
DATABASE_URL="postgres://civ:civ-local@127.0.0.1:5432/civ0_test" pnpm test:it packages/persistence/src/loadcontext-graph.itest.ts
→ 2 failed: getNeighborCandidates returns [], getOrgContext returns undefined
```

**GREEN** (after implementation):
```
DATABASE_URL="postgres://civ:civ-local@127.0.0.1:5432/civ0_test" pnpm test:it packages/persistence/src/loadcontext-graph.itest.ts
→ ✓ 2 tests passed (303ms)
```

## Full integration suite
```
DATABASE_URL="postgres://civ:civ-local@127.0.0.1:5432/civ0_test" pnpm test:it
→ Test Files  25 passed (25)
      Tests  49 passed (49)
   Duration  7.92s
```
No regressions.

## Typecheck
```
pnpm typecheck
→ (no output = clean)
```

## Files changed
- `packages/persistence/src/repository.ts` — hydration impl + consts + import additions
- `packages/persistence/src/loadcontext-graph.itest.ts` — new itest (created)

## Commit
- `fa7f1eb` feat(graphrag): loadContext hydrates bounded neighbor candidates + org context

## Self-review
- Cross-world filter is handled by `JOIN citizens c ON c.id = r.other_id AND c.world_id = $2` — faraway excluded.
- Non-existent citizen (`ghost`) excluded because the JOIN finds no row.
- Ordering: marcus (70+60=130) > lena (78+50=128) — assertion `["marcus","lena"]` passes.
- `worldId` falls back to `"genesis"` when null (matches brief's `wid = worldId ?? "genesis"`).
- Text fields clipped to `NEIGHBOR_TEXT_MAX` via `clip()`.

## Concerns
None. Implementation matches brief exactly.

---

# Task 5 Fixes: Graceful Degradation + Test Assertion

## Fix 1: Graceful Degradation (repository.ts)

Wrapped the GraphRAG hydration block (neighbor-candidate query + `store.setNeighborCandidates(...)` AND org query + `store.setOrgContext(...)`) in a single `try { ... } catch (err) { ... }` to make the enrichment non-fatal.

**Change:**
- Lines 162–205 in `packages/persistence/src/repository.ts`: wrapped the neighbor and org hydration block (two SQL queries + setter calls) in `try-catch`.
- Catch logs a warning `[loadContext] neighbor/org hydration failed for ${citizenId}, continuing memory-only:` and continues without rethrowing.
- All other core context loading (citizen/goals/memories/beliefs/relationships) remains OUTSIDE the try—only the new GraphRAG enrichment is guarded.
- `return store;` stays after the catch.

## Fix 2: Test Assertion (loadcontext-graph.itest.ts)

Added assertion in the first `it(...)` block after the existing marcus expectations:
```typescript
expect(marcus.latestReasoning).toBe("backed ada");
```

**Rationale:** The seed data (line 26 of itest) inserts a decision with reasoning `"backed ada"` for marcus. The hydration query now populates `latestReasoning` via `clip(x.latest_reasoning)`, so this assertion verifies the hydration is working.

## Verification

**Integration test:**
```
DATABASE_URL="postgres://civ:civ-local@127.0.0.1:5432/civ0_test" pnpm test:it packages/persistence/src/loadcontext-graph.itest.ts
→ ✓ 2 tests passed (287ms)
```

**Typecheck:**
```
pnpm typecheck
→ (no output = clean)
```

## Commit

- `1ab87ad` fix(graphrag): make loadContext neighbor/org hydration non-fatal + assert latestReasoning

## Files Changed
- `packages/persistence/src/repository.ts` — try-catch wrapping around hydration block
- `packages/persistence/src/loadcontext-graph.itest.ts` — added latestReasoning assertion
