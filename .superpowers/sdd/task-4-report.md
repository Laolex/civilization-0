# Task 4: merkleRoot Implementation Report

## Status
**COMPLETE**. All steps completed successfully.

## Files Modified
- `packages/history/src/hash.ts` — appended `merkleRoot(hashes: Hash[]): Hash` function (18 lines)
- `packages/history/src/hash.test.ts` — appended `merkleRoot` import and 3-test block (15 lines)

## RED Phase
```
pnpm vitest run packages/history/src/hash.test.ts

 ❯ packages/history/src/hash.test.ts (11 tests | 3 failed) 9ms
   × merkleRoot > is deterministic 3ms
     → merkleRoot is not a function
   × merkleRoot > is order-sensitive 1ms
     → merkleRoot is not a function
   × merkleRoot > returns the single leaf unchanged 0ms
     → merkleRoot is not a function

Test Files  1 failed (1)
Tests  3 failed | 8 passed (11)
```

Confirmed: 3 tests failing (8 pre-existing passing), error "merkleRoot is not a function" as expected.

## GREEN Phase
```
pnpm vitest run packages/history/src/hash.test.ts

 ✓ packages/history/src/hash.test.ts (11 tests) 5ms

 Test Files  1 passed (1)
      Tests  11 passed (11)
```

Confirmed: All 11 tests passing.

## Typecheck
```
pnpm -r typecheck
Scope: 14 of 15 workspace projects
apps/web typecheck$ tsc --noEmit
apps/web typecheck: Done
```

Clean. No type errors.

## Implementation Details
The `merkleRoot` function:
- Returns `sha256Hex("")` for empty array
- Duplicates the last hash on odd-length levels
- Builds the tree bottom-up via iterative hashing
- Returns the single leaf unchanged (level.length === 1)
- Uses existing `sha256Hex` and `Hash` type from the module

## Test Coverage
Three new tests validate:
1. **Determinism** — same input hashes yield same root
2. **Order-sensitivity** — different order produces different root
3. **Single-leaf identity** — single hash returns unchanged

All three tests pass, confirming the spec.

## Commit
```
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): merkleRoot over event hashes"
[feat/history-event-engine b95b5b2] feat(history): merkleRoot over event hashes
 2 files changed, 31 insertions(+)
```

**Commit SHA:** b95b5b2  
**Subject:** feat(history): merkleRoot over event hashes

## Concerns
None. Implementation matches brief exactly, tests pass, types clean, commit uses correct author and message format (no Co-Authored-By, no AI attribution).
