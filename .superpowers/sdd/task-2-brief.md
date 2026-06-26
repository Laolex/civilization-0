### Task 2: Store neighbor/org accessors + `OrgContext` type

**Files:**
- Modify: `packages/shared/src/index.ts` (append `OrgContext` after `ScoredNeighbor`)
- Modify: `packages/store/src/index.ts` (interface + `InMemoryWorldStore`)
- Test: `packages/store/src/neighbor-context.test.ts`

**Interfaces:**
- Produces: `OrgContext` (in `@civ/shared`); `WorldStore.getNeighborCandidates/setNeighborCandidates/getOrgContext/setOrgContext`.
- Consumes: `NeighborSummary` from `@civ/shared` (Task 1).

- [ ] **Step 1: Add `OrgContext` to shared.** Append to `packages/shared/src/index.ts`:

```typescript
export interface OrgContext {
  id: string;
  name: string;
  kind: OrgKind;
  latestAction?: ActionType;
  latestReasoning?: string;
}
```

- [ ] **Step 2: Write the failing test.** Create `packages/store/src/neighbor-context.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { InMemoryWorldStore } from "./index";
import type { NeighborSummary, OrgContext } from "@civ/shared";

const summary: NeighborSummary = {
  id: "marcus", name: "Marcus", relationship: { trust: 70, friendship: 50, influence: 60 },
  latestAction: "invest", latestReasoning: "backed Ada", wealth: 100000, reputation: 70,
};
const org: OrgContext = { id: "o1", name: "Ada Collective", kind: "guild", latestAction: "partner" };

describe("InMemoryWorldStore neighbor/org context", () => {
  it("defaults to empty/null and round-trips set values", () => {
    const s = new InMemoryWorldStore();
    expect(s.getNeighborCandidates("ada")).toEqual([]);
    expect(s.getOrgContext("ada")).toBeNull();

    s.setNeighborCandidates("ada", [summary]);
    s.setOrgContext("ada", org);
    expect(s.getNeighborCandidates("ada")).toEqual([summary]);
    expect(s.getOrgContext("ada")).toEqual(org);

    s.setOrgContext("ada", null);
    expect(s.getOrgContext("ada")).toBeNull();
  });
});
```

- [ ] **Step 3: Run it, verify it fails.** Run: `pnpm test packages/store/src/neighbor-context.test.ts`
Expected: FAIL — `getNeighborCandidates is not a function`.

- [ ] **Step 4: Extend the `WorldStore` interface.** In `packages/store/src/index.ts`, add `NeighborSummary, OrgContext` to the existing `@civ/shared` import, and add to the `WorldStore` interface (after `snapshot(): WorldSnapshot;`):

```typescript
  getNeighborCandidates(citizenId: string): NeighborSummary[];
  setNeighborCandidates(citizenId: string, candidates: NeighborSummary[]): void;
  getOrgContext(citizenId: string): OrgContext | null;
  setOrgContext(citizenId: string, org: OrgContext | null): void;
```

- [ ] **Step 5: Implement in `InMemoryWorldStore`.** Add the backing maps near the other private fields:

```typescript
  private neighborCandidates = new Map<string, NeighborSummary[]>();
  private orgContexts = new Map<string, OrgContext>();
```

and the methods (place before `snapshot()`):

```typescript
  getNeighborCandidates(citizenId: string) { return this.neighborCandidates.get(citizenId) ?? []; }
  setNeighborCandidates(citizenId: string, candidates: NeighborSummary[]) { this.neighborCandidates.set(citizenId, candidates); }
  getOrgContext(citizenId: string) { return this.orgContexts.get(citizenId) ?? null; }
  setOrgContext(citizenId: string, org: OrgContext | null) {
    if (org === null) this.orgContexts.delete(citizenId); else this.orgContexts.set(citizenId, org);
  }
```

Note: these are ephemeral retrieval context — **do not** add them to `snapshot()`.

- [ ] **Step 6: Run the test, verify it passes.** Run: `pnpm test packages/store/src/neighbor-context.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit.**

```bash
git add packages/shared/src/index.ts packages/store/src/index.ts packages/store/src/neighbor-context.test.ts
git commit -m "feat(graphrag): store neighbor-candidate + org-context accessors"
```

---

