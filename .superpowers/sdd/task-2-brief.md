### Task 2: Web types + chain builders emit the social node

**Files:**
- Modify: `apps/web/lib/types.ts` (add `"social"` kind + `SocialDriverView` + optional fields on `ChainNode`)
- Modify: `apps/web/lib/citizen-db.ts` (`RawChainInput` + `toCausalChain`)
- Modify: `apps/web/lib/world.ts:43-44` (`getCausalChain` from `decision.meta`)
- Modify: `packages/persistence/src/read.ts:178-204` (`readDecisionChainRaw` + `RawDecisionChain` surface meta drivers)
- Test: `apps/web/lib/citizen-db.test.ts` (create)

**Interfaces:**
- Consumes: `SocialDriver`, `OrgDriver` from `@civ/shared` (Task 1).
- Produces: `ChainNodeKind` now includes `"social"`; `ChainNode` gains optional `socialDrivers?: SocialDriverView[]`, `socialQuery?: string`, `orgDriver?: OrgDriverView`. `toCausalChain(raw)` inserts the social node after beliefs / before compute when drivers exist. `RawChainInput` gains `socialDrivers`, `socialQuery`, `orgDriver`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/citizen-db.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { toCausalChain, type RawChainInput } from "./citizen-db";

const base: RawChainInput = {
  decisionId: "d1", action: "invest", targetId: "marcus", reasoning: "trust",
  provider: "0xP", model: "qwen", verified: true,
  memories: [{ id: "m1", summary: "Marcus helped me", day: 3, weight: 0.6 }],
  beliefs: [{ id: "b1", statement: "Marcus is trustworthy", confidence: 0.8, weight: 0.8 }],
  event: { id: "e1", day: 12, type: "invest", targetId: "marcus" },
  rootHash: "0xroot", txHash: "0xtx",
  socialDrivers: [
    { id: "marcus", name: "Marcus Vale", relationshipStrength: 0.68, relevance: 0.46, blendedScore: 0.31, trust: 71, influence: 65, neighborText: "Marcus invests steadily" },
  ],
  socialQuery: "who do I trust on risk?",
  orgDriver: { id: "o1", name: "Harborline Guild", action: "partner", reasoning: "favor steady partners" },
};

describe("toCausalChain social node", () => {
  it("inserts a social node after beliefs and before compute when drivers exist", () => {
    const kinds = toCausalChain(base).nodes.map((n) => n.kind);
    expect(kinds).toEqual(["memory", "belief", "social", "compute", "decision", "event", "storage"]);
  });

  it("carries the drivers + query onto the social node", () => {
    const social = toCausalChain(base).nodes.find((n) => n.kind === "social")!;
    expect(social.socialQuery).toBe("who do I trust on risk?");
    expect(social.socialDrivers?.[0]).toMatchObject({ id: "marcus", blendedScore: 0.31 });
    expect(social.orgDriver?.name).toBe("Harborline Guild");
  });

  it("omits the social node when there are no drivers", () => {
    const kinds = toCausalChain({ ...base, socialDrivers: [], orgDriver: undefined, socialQuery: undefined }).nodes.map((n) => n.kind);
    expect(kinds).toEqual(["memory", "belief", "compute", "decision", "event", "storage"]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/lib/citizen-db.test.ts`
Expected: FAIL — `RawChainInput` has no `socialDrivers`; no social node emitted.

- [ ] **Step 3: Extend web types**

In `apps/web/lib/types.ts` replace lines 1-8 with:

```ts
export type ChainNodeKind = "memory" | "belief" | "social" | "compute" | "decision" | "event" | "storage";

export interface SocialDriverView {
  id: string; name: string;
  relationshipStrength: number; relevance: number; blendedScore: number;
  trust: number; influence: number; neighborText: string;
}
export interface OrgDriverView { id: string; name: string; action?: string; reasoning?: string; }

export interface ChainNode {
  kind: ChainNodeKind;
  title: string;
  detail: Record<string, string>;
  weight?: number;
  /** Present only on the "social" node. */
  socialDrivers?: SocialDriverView[];
  socialQuery?: string;
  orgDriver?: OrgDriverView;
}
```

- [ ] **Step 4: Emit the social node in `toCausalChain`**

In `apps/web/lib/citizen-db.ts`, extend `RawChainInput` (after the `beliefs` field) and insert the node. Replace the whole file body with:

```ts
import type { CausalChainView, ChainNode, SocialDriverView, OrgDriverView } from "./types";

export interface RawChainInput {
  decisionId: string; action: string; targetId: string | null; reasoning: string;
  provider: string; model: string; verified: boolean;
  memories: { id: string; summary: string; day: number; weight: number }[];
  beliefs: { id: string; statement: string; confidence: number; weight: number }[];
  event: { id: string; day: number; type: string; targetId: string | null } | null;
  rootHash: string | null; txHash: string | null;
  socialDrivers?: SocialDriverView[];
  socialQuery?: string;
  orgDriver?: OrgDriverView;
}

export function socialNode(
  drivers: SocialDriverView[] | undefined,
  socialQuery: string | undefined,
  orgDriver: OrgDriverView | undefined,
): ChainNode | null {
  const hasSocial = (drivers?.length ?? 0) > 0 || !!orgDriver;
  if (!hasSocial) return null;
  return {
    kind: "social",
    title: "Social context",
    weight: drivers?.length ? Math.max(...drivers.map((d) => d.blendedScore)) : undefined,
    detail: {
      query: socialQuery ?? "—",
      neighbors: String(drivers?.length ?? 0),
      ...(orgDriver ? { org: orgDriver.name } : {}),
    },
    socialDrivers: drivers ?? [],
    socialQuery,
    orgDriver,
  };
}

export function toCausalChain(raw: RawChainInput): CausalChainView {
  const nodes: ChainNode[] = [];
  for (const m of raw.memories)
    nodes.push({ kind: "memory", title: `Memory ${m.id}`, weight: m.weight, detail: { summary: m.summary, weight: m.weight.toFixed(2), day: String(m.day) } });
  for (const b of raw.beliefs)
    nodes.push({ kind: "belief", title: `Belief ${b.id}`, weight: b.weight, detail: { statement: b.statement, weight: b.weight.toFixed(2), confidence: b.confidence.toFixed(2) } });
  const social = socialNode(raw.socialDrivers, raw.socialQuery, raw.orgDriver);
  if (social) nodes.push(social);
  nodes.push({ kind: "compute", title: "0G Compute", detail: { provider: raw.provider, model: raw.model, verified: String(raw.verified) } });
  nodes.push({ kind: "decision", title: "Decision", detail: { action: raw.action, target: raw.targetId ?? "—", reasoning: raw.reasoning } });
  nodes.push({ kind: "event", title: "Event", detail: { type: raw.event?.type ?? "—", day: raw.event ? String(raw.event.day) : "—" } });
  nodes.push({ kind: "storage", title: "0G Storage", detail: { rootHash: raw.rootHash ?? "—", txHash: raw.txHash ?? "—" } });
  return { decisionId: raw.decisionId, nodes, rootHash: raw.rootHash ?? undefined, txHash: raw.txHash ?? undefined };
}
```

- [ ] **Step 5: Surface meta drivers from `readDecisionChainRaw`**

In `packages/persistence/src/read.ts`, find the `RawDecisionChain` interface (the type returned by `readDecisionChainRaw`) and add three fields to it:

```ts
  socialDrivers: SocialDriver[];
  socialQuery: string | null;
  orgDriver: OrgDriver | null;
```

Add `SocialDriver, OrgDriver` to the existing `@civ/shared` import at the top of the file. Then in `readDecisionChainRaw` (after `const meta = (dec.meta ?? {}) as Record<string, unknown>;` at line 193) add to the returned object (alongside `rootHash`/`txHash`):

```ts
    socialDrivers: (meta.socialDrivers as SocialDriver[] | undefined) ?? [],
    socialQuery: (meta.socialQuery as string | undefined) ?? null,
    orgDriver: (meta.orgDriver as OrgDriver | undefined) ?? null,
```

- [ ] **Step 6: Wire the live citizen page builder to pass drivers through**

The page that calls `readDecisionChainRaw` then `toCausalChain` (find it: `grep -rn "readDecisionChainRaw\|toCausalChain" apps/web` — it is the citizen profile path) must forward the three new fields into the `RawChainInput` it builds. Add to that mapping object:

```ts
    socialDrivers: raw.socialDrivers,
    socialQuery: raw.socialQuery ?? undefined,
    orgDriver: raw.orgDriver ?? undefined,
```

- [ ] **Step 7: Emit the social node in the snapshot builder too**

In `apps/web/lib/world.ts`, after the beliefs loop (after line 42, before the `compute` push at line 44) insert:

```ts
  const meta = decision.meta;
  const social = socialNode(meta?.socialDrivers, meta?.socialQuery, meta?.orgDriver);
  if (social) nodes.push(social);
```

Remove the now-duplicate `const meta = decision.meta;` that previously sat on line 43 (keep a single declaration above the compute push). Add the import at the top: `import { socialNode } from "./citizen-db";`.

- [ ] **Step 8: Run tests + typecheck**

Run: `npx vitest run apps/web/lib/citizen-db.test.ts apps/web/lib/world.test.ts && pnpm -r typecheck`
Expected: PASS + clean. (`world.test.ts` exercises `getCausalChain`; if its snapshot fixtures lack `meta.socialDrivers`, the social node is correctly omitted and existing assertions hold.)

- [ ] **Step 9: Commit**

```bash
git add apps/web/lib/types.ts apps/web/lib/citizen-db.ts apps/web/lib/citizen-db.test.ts apps/web/lib/world.ts packages/persistence/src/read.ts apps/web/app/citizens
git commit -m "feat(web): emit social-context node in causal chain builders"
```

---

