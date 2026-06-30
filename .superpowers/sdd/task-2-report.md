# Task 2 Report: Canonical JSON (`canonicalJSON`)

## What Was Implemented

Implemented `canonicalJSON(value: unknown): string` in `packages/history/src/hash.ts` — a deterministic, language-independent JSON canonicalization function following JCS/RFC 8785 intent. This pure function:

- Recursively sorts object keys lexicographically (UTF-16 code unit order)
- Preserves array order
- Omits undefined object properties
- Handles null, boolean, number, string, array, and object types
- Throws on non-finite numbers and unsupported types
- Is deterministic across runtimes (no key-order variance, stable number formatting)

This function serves as the hashing substrate for the event chain (consumed by Task 3's `eventHash`). Non-canonical serialization silently breaks replay tamper-evidence (Invariant #3).

## TDD Evidence

### RED Phase
**Command:**
```bash
pnpm vitest run packages/history/src/hash.test.ts
```

**Output:**
```
❯ packages/history/src/hash.test.ts (0 test)

FAIL  packages/history/src/hash.test.ts [ packages/history/src/hash.test.ts ]
Error: Failed to load url ./hash (resolved id: ./hash) in /opt/civilization-0-history/packages/history/src/hash.test.ts. Does the file exist?
```

**Why Expected:** Module `./hash` did not exist; test import failed as intended.

### GREEN Phase
**Command:**
```bash
pnpm vitest run packages/history/src/hash.test.ts
```

**Output:**
```
✓ packages/history/src/hash.test.ts (4 tests) 3ms

Test Files  1 passed (1)
     Tests  4 passed (4)
```

**All tests passed:**
1. `is key-order independent` — two objects with different key orders produce identical serialization
2. `sorts nested keys and preserves array order` — nested objects get key-sorted, arrays keep input order
3. `serializes null/bool/number/string deterministically` — all primitives and null serialize in key-sorted order
4. `omits undefined object properties` — undefined values are filtered from output

### Typecheck
**Command:**
```bash
pnpm -r typecheck
```

**Result:** Clean (no TypeScript errors).

## Files Changed

Created:
- `packages/history/src/hash.ts` (23 lines) — `canonicalJSON` implementation
- `packages/history/src/hash.test.ts` (15 lines) — 4 passing tests

## Commit

**SHA:** `a24ed25`
**Subject:** `feat(history): deterministic canonicalJSON (JCS-1)`
**Message:** Exact format per brief (no Co-Authored-By trailer, no AI attribution)

## Test Summary

- **Test Files:** 1 passed
- **Tests:** 4 passed (100%)
- **Typecheck:** Clean
- **All assertions:** Pass (key order independence, nested sort, type handling, undefined omission)

## Concerns

None. The implementation:
- Matches brief specification exactly (verbatim code)
- Passes all 4 test cases with correct output
- Handles edge cases (undefined, null, arrays, nested objects)
- Throws on invalid inputs (non-finite numbers, unsupported types)
- Is deterministic and language-independent (suitable for hash chain substrate)
- Typecheck is clean
- Commit uses exact author/email from brief, no attribution trailers
