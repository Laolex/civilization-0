# Task 3: sha256Hex + eventHash — Report

## Summary
Task 3 (Track B) implemented `sha256Hex` and `eventHash` for `@civ/history` package using TDD methodology. All tests passing, typecheck clean, commit successful.

## Files Changed
- `packages/history/src/hash.ts` — added imports (`node:crypto`, `./types`) at module top; appended `sha256Hex()` and `eventHash()` functions after `canonicalJSON()`
- `packages/history/src/hash.test.ts` — appended test helper `fakeCT()` and test block `describe("eventHash", ...)` with 4 new test cases

## RED Output (Step 2)
```
 ❯ packages/history/src/hash.test.ts (8 tests | 4 failed) 7ms
   × eventHash > sha256Hex is a 0x-prefixed 64-hex digest 3ms
     → sha256Hex is not a function
   × eventHash > is deterministic for equal events 1ms
     → eventHash is not a function
   × eventHash > changes when the payload changes 0ms
     → eventHash is not a function
   × eventHash > changes when the parentHash changes 0ms
     → sha256Hex is not a function

 Test Files  1 failed (1)
      Tests  4 failed | 4 passed (8)
```

## GREEN Output (Step 4)
```
 RUN  v2.1.9 /opt/civilization-0-history

 ✓ packages/history/src/hash.test.ts (8 tests) 6ms

 Test Files  1 passed (1)
      Tests  8 passed (8)
```

## Test Summary
- **Total:** 8 tests (4 existing `canonicalJSON` tests + 4 new `eventHash` tests)
- **Result:** 8/8 PASS
- **Scope:** 
  - `sha256Hex("abc")` returns `0x` + 64 hex chars (SHA-256 deterministic)
  - `eventHash()` is deterministic for identical `CognitiveTransition` instances
  - `eventHash()` changes when payload changes (e.g., `reasoning` field)
  - `eventHash()` changes when header changes (e.g., `parentHash`)

## Typecheck
```
tsc --noEmit
Done
```
Clean. No TypeScript errors.

## Implementation Details

### `sha256Hex(input: string): Hash`
- Returns `"0x" + createHash("sha256").update(input, "utf8").digest("hex")`
- Type: `Hash` (string alias from `./types`)
- Used by `eventHash()` as the hash function

### `eventHash(event: HistoryEvent): Hash`
- Extracts `header` from event, remaining fields become `payload`
- Hashes concatenation: `canon(header) + "\n" + canon(payload)`
- Deterministic: identical events hash identically
- Payload-sensitive: any change in non-header fields changes hash
- Header-sensitive: any change in `EventHeader` fields (including `parentHash`) changes hash

## Commit
- **Commit SHA:** `a926bbb`
- **Subject:** `feat(history): sha256Hex + eventHash over canonical header‖payload`
- **Author:** laolex (shelfcron-co@outlook.com)
- **Message:** No Co-Authored-By trailer, no AI attribution (per user feedback)

## Concerns
None. All success criteria met:
- Tests RED then GREEN (8/8 pass)
- Typecheck clean
- Commit succeeded with correct message format
- Implementation matches brief verbatim
- Only hash.ts and hash.test.ts modified
