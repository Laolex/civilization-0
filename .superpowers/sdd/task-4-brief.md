### Task 4: Engine wiring + `socialDrivers` provenance

**Files:**
- Modify: `packages/explainability/src/index.ts` (`TraceDrivers`)
- Modify: `packages/engine/src/index.ts` (`TickDeps`, tick, drivers)
- Modify: `packages/engine/src/scenario.ts` (add `graphRetriever` to deps so the live-ish demo path exercises it)
- Test: `packages/engine/src/graph-drivers.test.ts`

**Interfaces:**
- Consumes: `GraphRetriever` from `@civ/memory`; `store.getNeighborCandidates/getOrgContext`; `DecisionContext.neighbors/orgContext`.
- Produces: `TickDeps.graphRetriever?: GraphRetriever`; archived trace record carries `drivers.socialDrivers` + `drivers.orgDriver`.

- [ ] **Step 1: Extend `TraceDrivers`.** In `packages/explainability/src/index.ts`, replace the `TraceDrivers` interface with:

```typescript
export interface TraceDrivers {
  memories: { id: string; weight: number }[];
  beliefs: { id: string; weight: number }[];
  socialDrivers?: { id: string; name: string; relationshipStrength: number; relevance: number; blendedScore: number }[];
  orgDriver?: { id: string; name: string; action?: string; reasoning?: string };
}
```

(No other explainability change — `buildAndArchive` already archives `drivers` verbatim into the `civ.provenance/v0` record.)

- [ ] **Step 2: Write the failing test.** Create `packages/engine/src/graph-drivers.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { InMemoryWorldStore } from "@civ/store";
import { FakeEmbedder, MemoryIndex, GraphRetriever } from "@civ/memory";
import { RuleBasedBeliefReviser } from "@civ/beliefs";
import { FakeBrain } from "@civ/brain";
import { FakeStorage } from "@civ/storage";
import { ExplainabilityService } from "@civ/explainability";
import { runCitizenTick, type TickDeps } from "./index";
import type { DecisionContext } from "@civ/brain";

function setup() {
  const store = new InMemoryWorldStore();
  const embedder = new FakeEmbedder();
  store.upsertCitizen({ id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
  store.upsertGoal({ id: "g1", citizenId: "ada", kind: "wealth", description: "capital", progress: 0.1, active: true });
  store.setWorldState({ day: 5, economy: {}, headline: "Boom" });
  store.setNeighborCandidates("ada", [{
    id: "marcus", name: "Marcus", relationship: { trust: 70, friendship: 50, influence: 60 },
    latestAction: "invest", latestReasoning: "capital", topGoal: "capital", wealth: 100000, reputation: 70,
  }]);
  store.setOrgContext("ada", { id: "o1", name: "Collective", kind: "guild", latestAction: "partner", latestReasoning: "grow" });

  let captured: DecisionContext | null = null;
  const brain = new FakeBrain((ctx) => {
    captured = ctx;
    return { action: "work", targetId: null, reasoning: "r", memoryWeights: {}, beliefWeights: {} };
  });
  const storage = new FakeStorage();
  let n = 0;
  const deps: TickDeps = {
    store, embedder, memoryIndex: new MemoryIndex(store, embedder),
    graphRetriever: new GraphRetriever(embedder),
    reviser: new RuleBasedBeliefReviser(), brain, storage,
    explain: new ExplainabilityService(storage),
    clock: { day: 5 }, idgen: () => `id${++n}`,
  };
  return { deps, storage, getCaptured: () => captured };
}

describe("engine social retrieval", () => {
  it("passes selected neighbors + org into the brain context", async () => {
    const { deps, getCaptured } = setup();
    const r = await runCitizenTick(deps, "ada");
    const ctx = getCaptured()!;
    expect(ctx.neighbors?.[0].summary.id).toBe("marcus");
    expect(ctx.orgContext?.id).toBe("o1");
    expect(r.decision.action).toBe("work");
  });

  it("records socialDrivers + orgDriver in the archived trace record", async () => {
    const { deps, storage } = setup();
    const r = await runCitizenTick(deps, "ada");
    const rec = storage.calls.find((c) => c.key === `trace/${r.decision.id}`)!.data as any;
    expect(rec.drivers.socialDrivers[0].id).toBe("marcus");
    expect(rec.drivers.socialDrivers[0].blendedScore).toBeGreaterThan(0);
    expect(rec.drivers.orgDriver.id).toBe("o1");
  });

  it("degrades to empty socialDrivers when no graphRetriever is wired", async () => {
    const { deps, storage } = setup();
    const r = await runCitizenTick({ ...deps, graphRetriever: undefined }, "ada");
    const rec = storage.calls.find((c) => c.key === `trace/${r.decision.id}`)!.data as any;
    expect(rec.drivers.socialDrivers).toEqual([]);
  });
});
```

- [ ] **Step 3: Run it, verify it fails.** Run: `pnpm test packages/engine/src/graph-drivers.test.ts`
Expected: FAIL — `graphRetriever` not on `TickDeps` / `socialDrivers` undefined.

- [ ] **Step 4: Wire the engine.** In `packages/engine/src/index.ts`:

(a) Add to the imports from `@civ/memory`:
```typescript
import { type Embedder, MemoryIndex, GraphRetriever } from "@civ/memory";
```
(b) Add to `TickDeps` (after `memoryIndex: MemoryIndex;`):
```typescript
  graphRetriever?: GraphRetriever;
```
(c) Add the const near `RETRIEVE_K` (~line 21) and a rounding helper:
```typescript
const NEIGHBOR_K = Number(process.env.NEIGHBOR_K ?? "3");
const r2 = (n: number) => Math.round(n * 100) / 100;
```
(d) Destructure `graphRetriever` in the deps line (~line 46):
```typescript
  const { store, embedder, memoryIndex, graphRetriever, reviser, brain, storage, explain, clock, idgen } = deps;
```
(e) After the `relationships` line (~line 59) add:
```typescript
  const neighbors = graphRetriever
    ? graphRetriever.selectNeighbors(store.getNeighborCandidates(citizenId), query, NEIGHBOR_K)
    : [];
  const orgContext = store.getOrgContext(citizenId);
```
(f) Pass them into `brain.decide` (~line 64):
```typescript
  const result = await brain.decide({
    citizen, goal, memories, beliefs, relationships, worldState,
    availableActions: forced ?? ALL_ACTIONS, neighbors, orgContext,
  });
```
(g) Extend the `drivers` object in `explain.buildAndArchive` (~line 99):
```typescript
    drivers: {
      memories: dm.map((d) => ({ id: d.memoryId, weight: d.weight })),
      beliefs: db.map((d) => ({ id: d.beliefId, weight: d.weight })),
      socialDrivers: neighbors.map((n) => ({
        id: n.summary.id, name: n.summary.name,
        relationshipStrength: r2(n.relationshipStrength),
        relevance: r2(n.relevance), blendedScore: r2(n.blendedScore),
      })),
      orgDriver: orgContext
        ? { id: orgContext.id, name: orgContext.name, action: orgContext.latestAction, reasoning: orgContext.latestReasoning }
        : undefined,
    },
```

- [ ] **Step 5: Run the new test, verify it passes.** Run: `pnpm test packages/engine/src/graph-drivers.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Wire the demo scenario.** In `packages/engine/src/scenario.ts`, add `GraphRetriever` to the `@civ/memory` import and add `graphRetriever: new GraphRetriever(embedder),` to the `deps` object (~line 49, beside `memoryIndex`).

- [ ] **Step 7: Run the full unit suite + typecheck (determinism guard).** Run: `pnpm test` then `pnpm typecheck`
Expected: all unit tests PASS; typecheck clean. (Existing `TickDeps` literals compile unchanged because `graphRetriever` is optional.)

- [ ] **Step 8: Commit.**

```bash
git add packages/explainability/src/index.ts packages/engine/src/index.ts packages/engine/src/scenario.ts packages/engine/src/graph-drivers.test.ts
git commit -m "feat(graphrag): engine selects neighbors + records socialDrivers/orgDriver"
```

---

