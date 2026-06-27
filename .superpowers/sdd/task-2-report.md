# Task 2 Report: Web types + chain builders emit the social node

## Status
DONE — all tests pass, typecheck clean, committed.

## Commit
`b4cf544 feat(web): emit social-context node in causal chain builders`

## TDD Evidence

### RED (before implementation)
```
 FAIL  apps/web/lib/citizen-db.test.ts > toCausalChain social node > inserts a social node after beliefs and before compute when drivers exist
 FAIL  apps/web/lib/citizen-db.test.ts > toCausalChain social node > carries the drivers + query onto the social node
 Tests  2 failed | 2 passed (4)
```

### GREEN (after implementation)
```
 ✓ apps/web/lib/citizen-db.test.ts (4 tests) 5ms
 ✓ apps/web/lib/world.test.ts (5 tests) 5ms
 Test Files  2 passed (2)
 Tests  9 passed (9)
```

## Files Changed

### `apps/web/lib/types.ts`
- Added `"social"` to `ChainNodeKind`
- Added `SocialDriverView` and `OrgDriverView` interfaces (fields identical to shared `SocialDriver`/`OrgDriver`)
- Added optional `socialDrivers?`, `socialQuery?`, `orgDriver?` to `ChainNode`

### `apps/web/lib/citizen-db.ts`
- Extended `RawChainInput` with `socialDrivers?`, `socialQuery?`, `orgDriver?`
- Added exported `socialNode()` helper — returns `null` when no drivers/orgDriver (additive-only)
- `toCausalChain()` now inserts social node after beliefs loop when `socialNode()` returns non-null

### `apps/web/lib/world.ts`
- Imported `socialNode` from `./citizen-db` (single definition, no duplication)
- Inserted `socialNode(meta?.socialDrivers, meta?.socialQuery, meta?.orgDriver)` after the beliefs loop, before the compute push

### `packages/persistence/src/read.ts`
- Imported `SocialDriver`, `OrgDriver` from `@civ/shared`
- Added `socialDrivers: SocialDriver[]`, `socialQuery: string | null`, `orgDriver: OrgDriver | null` to `RawDecisionChain`
- `readDecisionChainRaw()` now extracts and returns these three fields from `meta`

### `apps/web/app/citizens/[id]/page.tsx` (citizen page builder — Step 6 lookup result)
- **What the lookup found:** The page at line 71 passed `chainRaw` (a `RawDecisionChain`) directly as `toCausalChain(chainRaw)`. This is a near-passthrough, but TypeScript rejected the direct pass due to a `null` vs `undefined` mismatch on `socialQuery` and `orgDriver` (`RawDecisionChain` uses `| null`, `RawChainInput` uses `| undefined`).
- **Fix applied:** Replaced the direct pass with an explicit spread that normalises `null → undefined` for the two nullable fields (`socialQuery ?? undefined`, `orgDriver ?? undefined`). `socialDrivers` passes through directly (already `SocialDriver[]`).

## Constraints Verified
- **Additive only**: `socialNode()` returns `null` when `drivers` is empty and `orgDriver` is falsy — confirmed by test "omits the social node when there are no drivers"
- **No logic duplication**: `socialNode` defined once in `citizen-db.ts`, imported by `world.ts`
- **View types match shared types**: `SocialDriverView`/`OrgDriverView` fields are identical to `SocialDriver`/`OrgDriver`
- **world.test.ts existing snapshot fixtures** have no `meta.socialDrivers` → social node correctly omitted → all 5 existing world tests still pass
