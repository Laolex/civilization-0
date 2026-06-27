# Task 3 Report: SocialDrivers component + CausalChain social node

## Status
COMPLETE — all tests pass, typecheck clean, committed.

## Commit
- `75e8ecc` feat(web): render social-context drivers in the causal chain

## TDD Evidence

### RED (Step 2)
```
npx vitest run apps/web/components/SocialDrivers.test.tsx
→ Test Files  1 failed (1)  — module "./SocialDrivers" not found
```

### Intermediate failure
After first SocialDrivers.tsx implementation, the toggle test failed because `screen.getByText("Marcus invests steadily")` couldn't find text embedded inside the larger `<dd>` content (`trust 71 · influence 65 · "Marcus invests steadily"`). Fix: wrapped `{d.neighborText}` in a `<span>` so getByText can target it as a standalone element.

### GREEN (Step 4)
```
npx vitest run apps/web/components/SocialDrivers.test.tsx
→ Tests  2 passed (2)
```

### Final run (Step 8)
```
npx vitest run apps/web/components/SocialDrivers.test.tsx apps/web/components/CausalChain.test.tsx
→ Test Files  2 passed (2)
   Tests  5 passed (5)

pnpm -r typecheck
→ apps/web typecheck: Done  (clean)
```

## Files Changed
- **Created** `apps/web/components/SocialDrivers.tsx` — reusable component with driver rows (strength × relevance → blended score + bar), org-driver line, and recompute reveal toggle
- **Created** `apps/web/components/SocialDrivers.test.tsx` — 2 tests (row rendering, recompute toggle)
- **Modified** `apps/web/components/CausalChain.tsx` — imported SocialDrivers; added "social" to ACCENT_KINDS; replaced single `{open && ...}` block with ternary that renders SocialDrivers for social nodes and generic detail grid for all others
- **Modified** `apps/web/components/CausalChain.test.tsx` — added social node to chain fixture, added social-node click test
- **Modified** `apps/web/app/globals.css` — appended `.sd-*` styles

## Token Substitutions
| Brief token | Status | Substitution |
|-------------|--------|--------------|
| `--fg`      | ✓ exists (`#e4e6ea`) | — |
| `--muted`   | ✓ exists (`#7d8490`) | — |
| `--accent`  | ✓ exists (`#4f7ef8`) | — |
| `--org`     | ✓ exists (`#c792ea`, second `:root` block) | — |
| `--line`    | ✗ NOT defined | Substituted with `--slate` (`#252a32`) — the hairline/border color used throughout |

No new color identities added. No new dependencies.
