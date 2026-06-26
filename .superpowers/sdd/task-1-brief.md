### Task 1: Shared types + `GraphRetriever`

**Files:**
- Modify: `packages/shared/src/index.ts` (append types after the `Membership` interface, ~line 86)
- Create: `packages/memory/src/graph-retriever.ts`
- Modify: `packages/memory/src/index.ts` (re-export)
- Test: `packages/memory/src/graph-retriever.test.ts`

**Interfaces:**
- Produces: `NeighborSummary`, `ScoredNeighbor` (in `@civ/shared`); `class GraphRetriever { constructor(embedder: Embedder); selectNeighbors(candidates: NeighborSummary[], query: string, k: number): ScoredNeighbor[] }` (in `@civ/memory`).
- Consumes: `cosineSimilarity` and `ActionType` from `@civ/shared`; `Embedder` from `@civ/memory`.

- [ ] **Step 1: Add the shared types.** Append to `packages/shared/src/index.ts`:

```typescript
export interface NeighborSummary {
  id: string;
  name: string;
  relationship: { trust: number; friendship: number; influence: number };
  latestAction?: ActionType;
  latestReasoning?: string;
  topGoal?: string;
  strongestBelief?: string;
  wealth: number;
  reputation: number;
}

export interface ScoredNeighbor {
  summary: NeighborSummary;
  relationshipStrength: number; // 0..1 (normalized from the 0..100 trust+influence)
  relevance: number;            // RELEVANCE_FLOOR..1
  blendedScore: number;         // relationshipStrength * relevance
}
```

- [ ] **Step 2: Write the failing test.** Create `packages/memory/src/graph-retriever.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { FakeEmbedder } from "./index";
import { GraphRetriever } from "./graph-retriever";
import type { NeighborSummary } from "@civ/shared";

const N = (id: string, trust: number, influence: number, text: string): NeighborSummary => ({
  id, name: id, relationship: { trust, friendship: 50, influence },
  latestReasoning: text, wealth: 0, reputation: 50,
});

describe("GraphRetriever.selectNeighbors", () => {
  const gr = new GraphRetriever(new FakeEmbedder());

  it("returns [] for no candidates or k<=0", () => {
    expect(gr.selectNeighbors([], "x", 3)).toEqual([]);
    expect(gr.selectNeighbors([N("a", 80, 80, "x")], "x", 0)).toEqual([]);
  });

  it("normalizes relationshipStrength from the 0..100 scale", () => {
    const [r] = gr.selectNeighbors([N("a", 70, 60, "alpha")], "alpha", 1);
    expect(r.relationshipStrength).toBeCloseTo(0.65, 5); // (70+60)/200
  });

  it("applies the relevance floor when text does not overlap the query", () => {
    const [r] = gr.selectNeighbors([N("a", 80, 80, "")], "totally different", 1);
    expect(r.relevance).toBeCloseTo(0.1, 5); // RELEVANCE_FLOOR
  });

  it("ranks by blendedScore, bounded by k, deterministic id tie-break", () => {
    const cands = [N("z", 80, 80, "shared topic"), N("a", 80, 80, "shared topic"), N("b", 10, 10, "shared topic")];
    const out = gr.selectNeighbors(cands, "shared topic", 2);
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.summary.id)).toEqual(["a", "z"]); // equal score -> id asc
    expect(out[0].blendedScore).toBeGreaterThanOrEqual(out[1].blendedScore);
  });
});
```

- [ ] **Step 3: Run it, verify it fails.** Run: `pnpm test packages/memory/src/graph-retriever.test.ts`
Expected: FAIL — `Cannot find module './graph-retriever'`.

- [ ] **Step 4: Implement `GraphRetriever`.** Create `packages/memory/src/graph-retriever.ts`:

```typescript
import { cosineSimilarity, type NeighborSummary, type ScoredNeighbor } from "@civ/shared";
import type { Embedder } from "./index";

const RELEVANCE_FLOOR = Number(process.env.RELEVANCE_FLOOR ?? "0.1");

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

function neighborText(n: NeighborSummary): string {
  return [n.name, n.latestAction, n.latestReasoning, n.topGoal, n.strongestBelief]
    .filter(Boolean).join(" ");
}

/** Pure, deterministic query-aware 1-hop neighbor selection. No network. */
export class GraphRetriever {
  constructor(private readonly embedder: Embedder) {}

  selectNeighbors(candidates: NeighborSummary[], query: string, k: number): ScoredNeighbor[] {
    if (candidates.length === 0 || k <= 0) return [];
    const q = this.embedder.embed(query);
    const scored: ScoredNeighbor[] = candidates.map((summary) => {
      const relationshipStrength = clamp01((summary.relationship.trust + summary.relationship.influence) / 200);
      const raw = cosineSimilarity(this.embedder.embed(neighborText(summary)), q);
      const relevance = Math.max(RELEVANCE_FLOOR, Math.min(1, raw));
      return { summary, relationshipStrength, relevance, blendedScore: relationshipStrength * relevance };
    });
    scored.sort((a, b) =>
      b.blendedScore - a.blendedScore ||
      b.relationshipStrength - a.relationshipStrength ||
      a.summary.id.localeCompare(b.summary.id));
    return scored.slice(0, k);
  }
}
```

- [ ] **Step 5: Re-export from the package index.** Append to `packages/memory/src/index.ts`:

```typescript
export { GraphRetriever } from "./graph-retriever";
```

- [ ] **Step 6: Run the test, verify it passes.** Run: `pnpm test packages/memory/src/graph-retriever.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 7: Commit.**

```bash
git add packages/shared/src/index.ts packages/memory/src/graph-retriever.ts packages/memory/src/index.ts packages/memory/src/graph-retriever.test.ts
git commit -m "feat(graphrag): GraphRetriever + NeighborSummary/ScoredNeighbor types"
```

---

