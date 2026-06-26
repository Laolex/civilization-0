# Task 2 Report: Store neighbor/org accessors + `OrgContext` type

## Summary
Successfully implemented Task 2 of the GraphRAG 1-hop neighbor-retrieval feature. Added `OrgContext` type to `@civ/shared` and four ephemeral retrieval-context accessors to the `WorldStore` interface and `InMemoryWorldStore` implementation. All changes follow TDD: test fails first, then passes after implementation.

## What Was Built

### 1. `OrgContext` Type (packages/shared/src/index.ts)
Added new interface after `ScoredNeighbor`:
```typescript
export interface OrgContext {
  id: string;
  name: string;
  kind: OrgKind;
  latestAction?: ActionType;
  latestReasoning?: string;
}
```

### 2. WorldStore Interface Extension (packages/store/src/index.ts)
Added four methods to the `WorldStore` interface:
- `getNeighborCandidates(citizenId: string): NeighborSummary[]`
- `setNeighborCandidates(citizenId: string, candidates: NeighborSummary[]): void`
- `getOrgContext(citizenId: string): OrgContext | null`
- `setOrgContext(citizenId: string, org: OrgContext | null): void`

Updated the import statement to include `NeighborSummary` and `OrgContext` from `@civ/shared`.

### 3. InMemoryWorldStore Implementation (packages/store/src/index.ts)
Added two private backing maps:
```typescript
private neighborCandidates = new Map<string, NeighborSummary[]>();
private orgContexts = new Map<string, OrgContext>();
```

Implemented all four accessor methods with proper null-handling for `OrgContext`.

### 4. Test Suite (packages/store/src/neighbor-context.test.ts)
Created comprehensive test covering:
- Default behavior (empty array for neighbors, null for org context)
- Setting and retrieving values
- Clearing org context by setting to null

## TDD Evidence

### RED Phase
```bash
$ pnpm test packages/store/src/neighbor-context.test.ts
```
Output:
```
❯ packages/store/src/neighbor-context.test.ts (1 test | 1 failed) 5ms
  × InMemoryWorldStore neighbor/org context > defaults to empty/null and round-trips set values 4ms
    → s.getNeighborCandidates is not a function
FAIL  packages/store/src/neighbor-context.test.ts
TypeError: s.getNeighborCandidates is not a function
```

### GREEN Phase
After implementing the interface and methods:
```bash
$ pnpm test packages/store/src/neighbor-context.test.ts
```
Output:
```
✓ packages/store/src/neighbor-context.test.ts (1 test) 2ms
Test Files  1 passed (1)
Tests  1 passed (1)
```

### Type Safety Check
```bash
$ pnpm typecheck
```
Output: (clean, no errors)

## Files Changed
1. **packages/shared/src/index.ts**: Added `OrgContext` interface (8 lines)
2. **packages/store/src/index.ts**: 
   - Updated imports to include `NeighborSummary, OrgContext` (1 line change)
   - Extended `WorldStore` interface with 4 new methods (5 lines)
   - Added 2 private backing maps to `InMemoryWorldStore` (2 lines)
   - Implemented 4 accessor methods (5 lines)
3. **packages/store/src/neighbor-context.test.ts**: New test file (25 lines)

Total: 46 insertions (+1 deletion to imports)

## Commit
**Short SHA:** `498a038`  
**Subject:** `feat(graphrag): store neighbor-candidate + org-context accessors`  
**Branch:** `feat/graphrag-neighbor-retrieval` (no push to remote)

## Design Decisions

### Ephemeral Storage
The accessor methods use ephemeral Maps that are NOT persisted in `snapshot()`, as specified in the brief. This is correct because:
- These accessors serve as retrieval context during the neighbor-selection phase
- They are hydrated by persistence (Task 5) for each reasoning cycle
- Not storing them in snapshot() keeps the world state clean and avoids stale context

### Null Handling
`OrgContext` uses `OrgContext | null` because:
- An organization context may not exist initially or may need to be cleared
- `setOrgContext(citizenId, null)` deletes the entry from the map
- `getOrgContext()` returns `null` explicitly when no context exists (not `undefined`)

### Map Structure
Separate maps for neighbors and org context because:
- Different access patterns and lifecycles
- Neighbors are arrays (multiple candidates), org is singular
- Cleaner API semantics

## Self-Review

✓ All types are properly imported and exported  
✓ Test follows the exact specification from the brief  
✓ No modifications to `snapshot()` (ephemeral context correctly isolated)  
✓ Implementation matches test expectations exactly  
✓ No TypeScript errors after typecheck  
✓ Commit follows naming conventions (no Co-Authored-By trailer)  
✓ All four methods have proper implementations with correct return types  
✓ Null handling is consistent with optional parameters  

## Concerns
None. The implementation is straightforward, well-tested, and follows TypeScript best practices. The ephemeral nature of the accessors is correctly maintained.

## Next Steps
Task 3 will extend the citizen's reasoning loop to call `getNeighborCandidates` and `setNeighborCandidates` during retrieval scoring. Task 4 will use these accessors in the engine's neighbor-selection logic.
