# Task 4 Report: Verify page shows social drivers

## Status
COMPLETE — all tests pass, typecheck clean, committed.

## Commit
- `5d71278` feat(web): show social drivers on the verify page

## TDD Evidence

### RED (before implementation)
Added test `"shows social drivers after successful fetch with socialDrivers"` to `VerifyOnZeroG.test.tsx`. Ran focused test suite:
```
Test Files  1 failed (1)
      Tests  1 failed | 4 passed (5)
```
`findByText("Marcus Vale")` timed out — component had no social driver rendering.

### GREEN (after implementation)
After modifying `VerifyOnZeroG.tsx` and appending CSS:
```
Test Files  1 passed (1)
      Tests  5 passed (5)
```

## Changes Made

### `apps/web/components/VerifyOnZeroG.tsx`
- Added imports: `SocialDrivers` from `./SocialDrivers`; `SocialDriverView`, `OrgDriverView` from `../lib/types`
- Extended `State` "ok" excerpt type to include `socialQuery?: string | null; socialDrivers?: SocialDriverView[]; orgDriver?: OrgDriverView | null`
- Extended `j.excerpt` parse type with the same optional fields
- Added `<div className="verify-social">` block with `<SocialDrivers>` after the `<pre>` JSON dump, guarded by `Array.isArray && length > 0`
- Raw `<pre>` JSON dump preserved

### `apps/web/components/VerifyOnZeroG.test.tsx`
- Added one new test asserting `findByText("Marcus Vale")` after clicking Verify when excerpt contains `socialDrivers` — matched existing `vi.stubGlobal("fetch", vi.fn(...))` pattern

### `apps/web/app/globals.css`
- Appended `.verify-social` and `.verify-social-head` rules using `--line`, `--accent` Observatory tokens

## Typecheck
`pnpm -r typecheck` → clean (no errors)

## Concerns
None. Implementation is straightforward; the `SocialDrivers` component is reused as-is.

## Fix: Undefined CSS token + test teardown

### Token fix
In `apps/web/app/globals.css` line 2757, `.verify-social` rule used undefined `var(--line)`, causing border to silently fail rendering. Changed to `var(--slate)` (the defined hairline token, same as `.sd-raw` above it).

### Test teardown
In `apps/web/components/VerifyOnZeroG.test.tsx`, found existing `afterEach(() => { vi.restoreAllMocks(); })` (lines 6-8). Added `vi.unstubAllGlobals()` call to properly clean up `vi.stubGlobal("fetch", ...)` stubs in tests.

### Verification
```
npx vitest run apps/web/components/VerifyOnZeroG.test.tsx
 ✓ apps/web/components/VerifyOnZeroG.test.tsx (5 tests) 108ms
 Test Files  1 passed (1)
      Tests  5 passed (5)
```
`pnpm -r typecheck` → clean (no errors)
