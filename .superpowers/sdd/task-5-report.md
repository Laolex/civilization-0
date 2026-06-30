# Task 5 Report: `verifyChain` (pure re-walk + tamper detection)

**Status:** COMPLETE  
**Date:** 2026-06-29  
**Branch:** feat/history-event-engine  
**Commit:** 2c6201d751ff9bd2eaf4cc77c8c737a1b9a96632

## RED Evidence (Test Failure Before Implementation)

Initial test run showed 3 new failing tests with exact error "verifyChain is not a function":

```
 ✗ packages/history/src/hash.test.ts (14 tests | 3 failed) 13ms
   × verifyChain > accepts a well-formed chain
     → verifyChain is not a function
   × verifyChain > detects a tampered payload
     → verifyChain is not a function
   × verifyChain > detects a broken parent link
     → verifyChain is not a function

Test Results: 11 passed | 3 failed
```

This confirmed the test block was properly appended and correctly written to fail on missing export.

## GREEN Evidence (Test Success After Implementation)

After appending the `verifyChain` function, all tests pass:

```
 ✓ packages/history/src/hash.test.ts (14 tests) 7ms

Test Files  1 passed (1)
     Tests  14 passed (14)
```

The 14 tests include:
- 3 existing canonicalJSON tests
- 4 existing eventHash tests (including parentHash link detection)
- 3 existing merkleRoot tests
- 3 new verifyChain tests (well-formed chain, tampered payload, broken parent link)

All passing with clean execution time.

## Typecheck

```
Scope: 14 of 15 workspace projects
apps/web typecheck$ tsc --noEmit
apps/web typecheck: Done
```

No type errors. Types properly inferred across:
- `HistoryEvent` (union of `CognitiveTransition | AnchorEvent`)
- `Hash` type (0x-prefixed hex string)
- `GENESIS_PARENT` constant (value import)

## Files Modified

1. **packages/history/src/hash.test.ts**
   - Added: `import { verifyChain } from "./hash";`
   - Updated: Type import to include `type HistoryEvent` (added to existing "./index" import alongside `CognitiveTransition`)
   - Added: `chainOf()` helper function (constructs well-formed event chain with proper parentHash links)
   - Added: `describe("verifyChain", ...)` block with 3 tests

2. **packages/history/src/hash.ts**
   - Added: `import { GENESIS_PARENT } from "./types";` (value import, separate from existing type import)
   - Added: `verifyChain()` function (re-walk + tamper + parent-link detection)

**Diff Summary:** 52 insertions, 1 deletion (pre-existing blank line)

## Implementation Details

The `verifyChain` function:
- **Signature:** `(events: { event: HistoryEvent; eventHash: Hash; parentHash: Hash }[]) => { ok: boolean; brokenAt?: number; reason?: string }`
- **Invariant #3 coverage:** Append-only tamper detection
- **Algorithm:**
  1. Initialize `expectedParent = GENESIS_PARENT` (first link anchor)
  2. For each event in sequence:
     - Recompute `eventHash` from the raw event payload
     - Return `{ ok: false, brokenAt: i, reason: "eventHash mismatch (tampered payload)" }` if recomputed hash ≠ stored hash
     - Return `{ ok: false, brokenAt: i, reason: "parentHash discontinuity" }` if stored parentHash ≠ expectedParent
     - Advance `expectedParent = row.eventHash` for next iteration
  3. Return `{ ok: true }` if all rows pass

**Test Coverage:**
1. **"accepts a well-formed chain"** — Uses an awkward-but-valid setup expression (`[..., ...].map(...).map(...)`); chain of 2 events with proper parent links; passes verification
2. **"detects a tampered payload"** — Chain of 2; tampers event[1].reasoning after construction; recompute fails on hash mismatch
3. **"detects a broken parent link"** — Chain of 2; manually break event[1].parentHash without updating eventHash; verification detects discontinuity without needing recompute

## Concerns

None. Implementation is:
- Verbatim from brief (no deviations)
- Properly typed (no type-check errors)
- Fully tested (3 test cases cover tamper + parent-link scenarios)
- Isolated (only hash.ts and hash.test.ts touched, no scope creep)
- Idiomatic (matches existing function style in hash.ts)

## Commit Info

```
Commit: 2c6201d751ff9bd2eaf4cc77c8c737a1b9a96632
Subject: feat(history): verifyChain re-walk with tamper + parent-link detection
Branch: feat/history-event-engine
Files: packages/history/src/hash.ts, packages/history/src/hash.test.ts
```

No Co-Authored-By trailer per project convention.

## Next Steps

Task 5 is complete. Per brief, the controller will now run one consolidated independent review of the whole `hash.ts` (all 4 functions + tests from Tasks 2-5):
- `canonicalJSON` ✓
- `sha256Hex` ✓
- `eventHash` ✓
- `merkleRoot` ✓
- `verifyChain` ✓ (new)
