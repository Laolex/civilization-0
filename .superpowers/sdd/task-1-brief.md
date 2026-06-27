### Task 1: Shared types + engine mirrors socialDrivers into decision.meta

**Files:**
- Modify: `packages/shared/src/index.ts:46-59` (add `SocialDriver`, `OrgDriver`, extend `ExecutionMeta`)
- Modify: `packages/engine/src/index.ts:64-121` (compute `socialDrivers` once, attach to `decision.meta`, reuse in trace)
- Test: `packages/engine/src/graph-drivers.test.ts` (extend)

**Interfaces:**
- Produces: `SocialDriver`, `OrgDriver` (exported from `@civ/shared`); `ExecutionMeta.socialDrivers?: SocialDriver[]`, `ExecutionMeta.socialQuery?: string`, `ExecutionMeta.orgDriver?: OrgDriver`.
- Consumes: existing `neighbors` array from `graphRetriever.selectNeighbors` (each item: `{ summary: { id, name, relationship: { trust, influence } }, relationshipStrength, relevance, blendedScore, neighborText }`), existing `orgContext`, existing `r2` rounding helper.

- [ ] **Step 1: Write the failing test**

Add to `packages/engine/src/graph-drivers.test.ts` (keep existing imports; reuse the file's existing tick harness — match how the existing tests build `deps`/run `runCitizenTick`; the existing test already exercises neighbors):

```ts
it("mirrors socialDrivers into decision.meta for the UI", async () => {
  // (reuse this file's existing harness that produces a tick with neighbors)
  const result = await runTickWithNeighbors(); // existing helper in this file
  const drivers = result.decision.meta?.socialDrivers;
  expect(Array.isArray(drivers)).toBe(true);
  expect(drivers!.length).toBeGreaterThan(0);
  const d = drivers![0];
  expect(d).toMatchObject({
    id: expect.any(String), name: expect.any(String),
    relationshipStrength: expect.any(Number), relevance: expect.any(Number),
    blendedScore: expect.any(Number), trust: expect.any(Number),
    influence: expect.any(Number), neighborText: expect.any(String),
  });
  expect(result.decision.meta?.socialQuery).toEqual(expect.any(String));
});
```

> If the existing file does not expose a `runTickWithNeighbors` helper, copy the setup block from the nearest existing test in the same file that asserts on `trace.drivers.socialDrivers`, and assert on `result.decision.meta.socialDrivers` instead.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run packages/engine/src/graph-drivers.test.ts -t "mirrors socialDrivers"`
Expected: FAIL — `result.decision.meta.socialDrivers` is `undefined`.

- [ ] **Step 3: Add shared types**

In `packages/shared/src/index.ts`, replace the `ExecutionMeta` block (lines 46-52) with:

```ts
export interface SocialDriver {
  id: string; name: string;
  relationshipStrength: number; relevance: number; blendedScore: number;
  trust: number; influence: number; neighborText: string;
}
export interface OrgDriver { id: string; name: string; action?: string; reasoning?: string; }

export interface ExecutionMeta {
  provider: string;
  model: string;
  requestId?: string;
  verified?: boolean;
  verification?: unknown;
  /** GraphRAG: the neighbors whose trust×relevance drove this decision (mirror of the
   *  0G trace's drivers.socialDrivers, so the UI renders without a 0G round-trip). */
  socialDrivers?: SocialDriver[];
  socialQuery?: string;
  orgDriver?: OrgDriver;
}
```

- [ ] **Step 4: Compute socialDrivers once in the engine and attach to meta**

In `packages/engine/src/index.ts`, import the type and add a single source of truth. After line 67 (`const orgContext = store.getOrgContext(citizenId);`) add:

```ts
  // GraphRAG drivers, computed once and written to BOTH decision.meta (fast UI mirror)
  // and the 0G trace (canonical, verifiable copy).
  const socialDrivers = neighbors.map((n) => ({
    id: n.summary.id, name: n.summary.name,
    relationshipStrength: r2(n.relationshipStrength),
    relevance: r2(n.relevance), blendedScore: r2(n.blendedScore),
    trust: n.summary.relationship.trust,
    influence: n.summary.relationship.influence,
    neighborText: n.neighborText,
  }));
  const orgDriver = orgContext
    ? { id: orgContext.id, name: orgContext.name, action: orgContext.latestAction, reasoning: orgContext.latestReasoning }
    : undefined;
  const socialQuery = neighbors.length ? query : undefined;
```

Then in the `decision` object (lines 85-89) change `meta: result.meta,` to merge the drivers in:

```ts
    brainProvider: brain.name, brainModel: brain.model,
    meta: { ...result.meta, ...(socialDrivers.length ? { socialDrivers, socialQuery } : {}), ...(orgDriver ? { orgDriver } : {}) },
```

And in the trace `drivers` block (lines 108-121) replace the inline `socialDrivers`/`socialQuery`/`orgDriver` literals with the precomputed consts:

```ts
    drivers: {
      memories: dm.map((d) => ({ id: d.memoryId, weight: d.weight })),
      beliefs: db.map((d) => ({ id: d.beliefId, weight: d.weight })),
      socialDrivers,
      socialQuery,
      orgDriver,
    },
```

Add `SocialDriver` to the existing `@civ/shared` import if the file references the type; otherwise no import is needed (the literals are structurally typed).

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run packages/engine/src/graph-drivers.test.ts`
Expected: PASS (new test + existing trace-drivers tests still green — the trace shape is unchanged).

- [ ] **Step 6: Typecheck**

Run: `pnpm -r typecheck`
Expected: clean.

- [ ] **Step 7: Commit**

```bash
git add packages/shared/src/index.ts packages/engine/src/index.ts packages/engine/src/graph-drivers.test.ts
git commit -m "feat(engine): mirror socialDrivers into decision.meta for UI"
```

---

