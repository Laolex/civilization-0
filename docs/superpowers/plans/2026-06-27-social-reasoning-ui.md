# Social Reasoning UI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Surface GraphRAG social reasoning across the causal chain, the verify page, and the `/map` showpiece (interactive + decision replay), so the verifiable graph-reasoned retrieval is visible and dramatized.

**Architecture:** `socialDrivers` (already archived to 0G) are mirrored into the existing `decisions.meta` jsonb so every UI surface can render them without a 0G round-trip. A single `SocialDrivers` component renders the driver rows + "recompute yourself" reveal everywhere. The causal chain gains a `"social"` node; the map gains idle aliveness, a click-to-open side panel showing a citizen's latest decision chain, and a "Replay last decision" control that lights the exact retrieved edges. All additive — pre-GraphRAG decisions degrade to today's behavior.

**Tech Stack:** TypeScript pnpm monorepo, Next.js App Router (apps/web), React client components, Postgres (pg), vitest + @testing-library/react (jsdom), 0G Storage/Compute.

## Global Constraints

- Additive only — no destructive migration; `socialDrivers` ride existing `decisions.meta` jsonb + existing 0G trace `drivers` (unchanged). Empty/absent ⇒ today's exact behavior.
- Branch `feat/graphrag-neighbor-retrieval` in worktree `/opt/civilization-0-graphrag`; never commit to master. Merge via PR.
- Observatory tokens only: `--bg #0a0b0d`, `--accent #4f7ef8` (signal-blue), `--org #c792ea`, `--down #c46a6a`, mono-as-data. No new color identities.
- One reused `SocialDrivers.tsx` — not three copies.
- Idle aliveness is CSS-only; do not add a client physics loop (would break deterministic SSR layout / cause hydration drift).
- No new runtime dependencies.
- Commits: no Co-Authored-By trailer, no AI attribution.
- Run tests from repo root: `npx vitest run <path>`. Typecheck: `pnpm -r typecheck`. Web dev: port 8792.
- `SocialDriver` field numbers are pre-rounded to 2dp by the engine (`r2`); UI formats for display only, never recomputes the stored values.

---

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

### Task 3: SocialDrivers component + CausalChain renders the social node

**Files:**
- Create: `apps/web/components/SocialDrivers.tsx`
- Create: `apps/web/components/SocialDrivers.test.tsx`
- Modify: `apps/web/components/CausalChain.tsx` (render social node body)
- Modify: `apps/web/components/CausalChain.test.tsx` (add social-node case)
- Modify: `apps/web/app/globals.css` (driver-row + bar styles)

**Interfaces:**
- Consumes: `SocialDriverView`, `OrgDriverView` from `lib/types`; `ChainNode.socialDrivers/socialQuery/orgDriver` (Task 2).
- Produces: `SocialDrivers({ drivers, socialQuery, orgDriver }: { drivers: SocialDriverView[]; socialQuery?: string; orgDriver?: OrgDriverView })`.

- [ ] **Step 1: Write the failing test**

Create `apps/web/components/SocialDrivers.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SocialDrivers } from "./SocialDrivers";
import type { SocialDriverView } from "../lib/types";

const drivers: SocialDriverView[] = [
  { id: "marcus", name: "Marcus Vale", relationshipStrength: 0.68, relevance: 0.46, blendedScore: 0.31, trust: 71, influence: 65, neighborText: "Marcus invests steadily" },
  { id: "lena", name: "Lena Cho", relationshipStrength: 0.68, relevance: 0.10, blendedScore: 0.07, trust: 70, influence: 66, neighborText: "Lena is cautious" },
];

describe("SocialDrivers", () => {
  it("renders one row per driver with the blended math", () => {
    render(<SocialDrivers drivers={drivers} socialQuery="who do I trust on risk?" />);
    expect(screen.getByText("Marcus Vale")).toBeDefined();
    expect(screen.getByText("Lena Cho")).toBeDefined();
    expect(screen.getByText(/0\.31/)).toBeDefined(); // blended score shown
  });

  it("reveals raw recompute inputs on toggle", () => {
    render(<SocialDrivers drivers={drivers} socialQuery="who do I trust on risk?" />);
    expect(screen.queryByText("Marcus invests steadily")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /recompute/i }));
    expect(screen.getByText("Marcus invests steadily")).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/components/SocialDrivers.test.tsx`
Expected: FAIL — module `./SocialDrivers` not found.

- [ ] **Step 3: Implement `SocialDrivers.tsx`**

Create `apps/web/components/SocialDrivers.tsx`:

```tsx
"use client";
import { useState } from "react";
import type { SocialDriverView, OrgDriverView } from "../lib/types";

function Bar({ value }: { value: number }) {
  return (
    <span className="sd-bar" aria-hidden="true">
      <span className="sd-bar-fill" style={{ width: `${Math.round(Math.min(1, value) * 100)}%` }} />
    </span>
  );
}

export function SocialDrivers({
  drivers, socialQuery, orgDriver,
}: { drivers: SocialDriverView[]; socialQuery?: string; orgDriver?: OrgDriverView }) {
  const [open, setOpen] = useState(false);
  const sorted = [...drivers].sort((a, b) => b.blendedScore - a.blendedScore);
  return (
    <div className="sd-root">
      {socialQuery && (
        <p className="sd-query mono">
          <span className="sd-query-label">social query</span> “{socialQuery}”
        </p>
      )}
      <ul className="sd-list">
        {sorted.map((d) => (
          <li key={d.id} className="sd-row">
            <span className="sd-name">{d.name}</span>
            <span className="sd-math mono">
              {d.relationshipStrength.toFixed(2)} <span className="sd-x">×</span> {d.relevance.toFixed(2)} <span className="sd-arrow">→</span>
            </span>
            <span className="sd-blended mono">{d.blendedScore.toFixed(2)}</span>
            <Bar value={d.blendedScore} />
          </li>
        ))}
      </ul>
      {orgDriver && (
        <p className="sd-org mono">
          <span className="sd-org-mark" aria-hidden>◠</span> {orgDriver.name}
          {orgDriver.reasoning ? <span className="sd-org-reason"> — “{orgDriver.reasoning}”</span> : null}
        </p>
      )}
      <button className="sd-recompute" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? "− hide raw inputs" : "▸ recompute yourself"}
      </button>
      {open && (
        <div className="sd-raw">
          <p className="sd-raw-note mono">
            strength = clamp((trust+influence)/200) · relevance = clamp(cosine(embed(neighborText), embed(socialQuery)))
          </p>
          <dl className="sd-raw-grid">
            {sorted.map((d) => (
              <div key={d.id} className="sd-raw-item">
                <dt className="sd-raw-key mono">{d.name}</dt>
                <dd className="sd-raw-val mono">trust {d.trust} · influence {d.influence} · “{d.neighborText}”</dd>
              </div>
            ))}
          </dl>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/components/SocialDrivers.test.tsx`
Expected: PASS.

- [ ] **Step 5: Render the social node inside CausalChain**

In `apps/web/components/CausalChain.tsx`: import the component and the type at the top:

```tsx
import { SocialDrivers } from "./SocialDrivers";
```

In `NodeCard`, when the node is the social node, render `SocialDrivers` as the expanded body instead of (in addition to) the generic detail grid. Change the `NodeCard` signature to accept the node (it already does) and add, right after the opening of the `{open && (` block (line 44), a branch:

```tsx
      {open && node.kind === "social" ? (
        <div className="node-detail">
          <SocialDrivers drivers={node.socialDrivers ?? []} socialQuery={node.socialQuery} orgDriver={node.orgDriver} />
        </div>
      ) : open ? (
        <div className="node-detail">
          <dl className="node-detail-grid">
            {Object.entries(node.detail).map(([k, v]) => {
              const isMono = k.toLowerCase().includes("hash") || k.toLowerCase().includes("tx") || k.toLowerCase() === "provider" || k.toLowerCase() === "model";
              return (
                <div key={k} style={{ display: "contents" }}>
                  <dt className="node-detail-key">{k}</dt>
                  <dd className={`node-detail-val${isMono ? " mono-val" : ""}`}>{v}</dd>
                </div>
              );
            })}
            {extra}
          </dl>
        </div>
      ) : null}
```

Remove the original single `{open && ( … )}` block (lines 44-59) that this replaces. Also add `"social"` to `ACCENT_KINDS` so the social node reads as a reasoning step:

```tsx
const ACCENT_KINDS = new Set(["compute", "storage", "social"]);
```

- [ ] **Step 6: Add the social-node case to CausalChain.test.tsx**

In `apps/web/components/CausalChain.test.tsx`, add a `social` node to the `chain.nodes` array between the `belief` and `compute` entries:

```ts
    { kind: "social", title: "Social context", weight: 0.31, detail: { query: "who do I trust on risk?", neighbors: "1" },
      socialDrivers: [{ id: "marcus", name: "Marcus Vale", relationshipStrength: 0.68, relevance: 0.46, blendedScore: 0.31, trust: 71, influence: 65, neighborText: "Marcus invests steadily" }],
      socialQuery: "who do I trust on risk?" },
```

Add a test:

```ts
  it("renders the social node body on click", () => {
    render(<CausalChain chain={chain} />);
    fireEvent.click(screen.getByText("Social context"));
    expect(screen.getByText("Marcus Vale")).toBeDefined();
  });
```

(The existing "renders all node titles in order" test stays correct because it derives expectations from `chain.nodes`.)

- [ ] **Step 7: Add styles**

Append to `apps/web/app/globals.css` (Observatory tokens only):

```css
/* Social-context drivers (GraphRAG) */
.sd-root { display: flex; flex-direction: column; gap: 8px; }
.sd-query { color: var(--muted); font-size: 12px; margin: 0; }
.sd-query-label { color: var(--accent); margin-right: 6px; text-transform: uppercase; letter-spacing: .06em; font-size: 10px; }
.sd-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 6px; }
.sd-row { display: grid; grid-template-columns: minmax(80px,1fr) auto auto 64px; align-items: center; gap: 8px; }
.sd-name { color: var(--fg); font-size: 13px; }
.sd-math { color: var(--muted); font-size: 11px; }
.sd-x, .sd-arrow { color: var(--accent); }
.sd-blended { color: var(--fg); font-size: 12px; text-align: right; }
.sd-bar { display: block; height: 4px; border-radius: 2px; background: rgba(255,255,255,.06); overflow: hidden; }
.sd-bar-fill { display: block; height: 100%; background: var(--accent); }
.sd-org { color: var(--org); font-size: 12px; margin: 2px 0 0; }
.sd-org-reason { color: var(--muted); }
.sd-recompute { align-self: flex-start; background: none; border: none; color: var(--accent); font-size: 11px; cursor: pointer; padding: 2px 0; font-family: inherit; }
.sd-raw { border-top: 1px solid var(--line); padding-top: 6px; }
.sd-raw-note { color: var(--muted); font-size: 10px; margin: 0 0 6px; }
.sd-raw-grid { margin: 0; display: flex; flex-direction: column; gap: 4px; }
.sd-raw-key { color: var(--fg); font-size: 11px; }
.sd-raw-val { color: var(--muted); font-size: 11px; }
```

> If a referenced token (`--muted`, `--line`, `--fg`) is not already defined in `:root`, reuse the nearest existing token in `globals.css` (e.g. text color, hairline border color) rather than inventing a new one.

- [ ] **Step 8: Run tests + typecheck**

Run: `npx vitest run apps/web/components/SocialDrivers.test.tsx apps/web/components/CausalChain.test.tsx && pnpm -r typecheck`
Expected: PASS + clean.

- [ ] **Step 9: Commit**

```bash
git add apps/web/components/SocialDrivers.tsx apps/web/components/SocialDrivers.test.tsx apps/web/components/CausalChain.tsx apps/web/components/CausalChain.test.tsx apps/web/app/globals.css
git commit -m "feat(web): render social-context drivers in the causal chain"
```

---

### Task 4: Verify page shows social drivers

**Files:**
- Modify: `apps/web/components/VerifyOnZeroG.tsx` (type the excerpt's socialDrivers, render `SocialDrivers`)
- Modify: `apps/web/components/VerifyOnZeroG.test.tsx` (assert drivers render)

**Interfaces:**
- Consumes: `/api/verify` excerpt `{ decision, verified, socialQuery, socialDrivers, orgDriver }` (already returned), `SocialDrivers` component (Task 3), `SocialDriverView`/`OrgDriverView` types.

- [ ] **Step 1: Write the failing test**

In `apps/web/components/VerifyOnZeroG.test.tsx`, add a test that mocks `fetch` to return an excerpt with `socialDrivers` and asserts a driver name appears after clicking "Verify on 0G". Match the file's existing fetch-mock style; the shape to return:

```ts
const excerpt = {
  decision: { action: "invest", targetId: "marcus" }, verified: true,
  socialQuery: "who do I trust on risk?",
  socialDrivers: [{ id: "marcus", name: "Marcus Vale", relationshipStrength: 0.68, relevance: 0.46, blendedScore: 0.31, trust: 71, influence: 65, neighborText: "steady" }],
  orgDriver: null,
};
// fetch resolves { ok: true, key: "k", bytes: 100, excerpt }
// after clicking "Verify on 0G": expect(await screen.findByText("Marcus Vale")).toBeDefined();
```

> If `VerifyOnZeroG.test.tsx` does not exist or does not mock fetch, create the test with a `vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, key: "k", bytes: 100, excerpt }) }))` setup and `vi.unstubAllGlobals()` teardown.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/components/VerifyOnZeroG.test.tsx`
Expected: FAIL — drivers not rendered.

- [ ] **Step 3: Render drivers in VerifyOnZeroG**

In `apps/web/components/VerifyOnZeroG.tsx`:
- Import: `import { SocialDrivers } from "./SocialDrivers";` and `import type { SocialDriverView, OrgDriverView } from "../lib/types";`
- Extend the `State` "ok" excerpt type and the `j.excerpt` parse type to include `socialQuery?: string | null; socialDrivers?: SocialDriverView[]; orgDriver?: OrgDriverView | null`.
- In the `s.status === "ok"` block, after the `<pre>` excerpt, add (only when drivers exist):

```tsx
          {Array.isArray(s.excerpt.socialDrivers) && s.excerpt.socialDrivers.length > 0 && (
            <div className="verify-social">
              <div className="verify-social-head mono">social context · graph-reasoned</div>
              <SocialDrivers
                drivers={s.excerpt.socialDrivers}
                socialQuery={s.excerpt.socialQuery ?? undefined}
                orgDriver={s.excerpt.orgDriver ?? undefined}
              />
            </div>
          )}
```

(Keep the existing `<pre>` JSON dump — it remains the raw proof; the `SocialDrivers` block is the readable layer.)

- [ ] **Step 4: Add minimal style**

Append to `apps/web/app/globals.css`:

```css
.verify-social { margin-top: 12px; border-top: 1px solid var(--line); padding-top: 10px; }
.verify-social-head { color: var(--accent); font-size: 11px; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run apps/web/components/VerifyOnZeroG.test.tsx && pnpm -r typecheck`
Expected: PASS + clean.

- [ ] **Step 6: Commit**

```bash
git add apps/web/components/VerifyOnZeroG.tsx apps/web/components/VerifyOnZeroG.test.tsx apps/web/app/globals.css
git commit -m "feat(web): show social drivers on the verify page"
```

---

### Task 5: Citizen-chain API route for the map side panel

**Files:**
- Create: `apps/web/app/api/citizen-chain/route.ts`
- Test: `apps/web/app/api/citizen-chain/route.test.ts`

**Interfaces:**
- Consumes: `readDecisionChainRaw` (now with social fields, Task 2), `toCausalChain` (Task 2), `getPool` (existing — find via `grep -rn "getPool" apps/web/lib`).
- Produces: `GET /api/citizen-chain?id=<citizenId>` → `{ ok: true, name?: string, chain: CausalChainView } | { ok: false, error }`. Returns `{ ok: true, chain: null }` when the citizen has no decision yet.

- [ ] **Step 1: Write the failing test**

Create `apps/web/app/api/citizen-chain/route.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest";

vi.mock("@civ/persistence/src/read", () => ({
  readDecisionChainRaw: vi.fn(async () => ({
    decisionId: "d1", action: "invest", targetId: "marcus", reasoning: "trust",
    provider: "0xP", model: "qwen", verified: true,
    memories: [], beliefs: [], event: null, rootHash: "0xroot", txHash: "0xtx",
    socialDrivers: [{ id: "marcus", name: "Marcus Vale", relationshipStrength: 0.68, relevance: 0.46, blendedScore: 0.31, trust: 71, influence: 65, neighborText: "steady" }],
    socialQuery: "who do I trust?", orgDriver: null,
  })),
}));
vi.mock("../../../lib/db", () => ({ getPool: () => ({}) })); // adjust path to the real getPool module

import { GET } from "./route";

describe("GET /api/citizen-chain", () => {
  it("returns a causal chain with the social node", async () => {
    const res = await GET(new Request("http://x/api/citizen-chain?id=ada"));
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.chain.nodes.map((n: { kind: string }) => n.kind)).toContain("social");
  });

  it("400s without an id", async () => {
    const res = await GET(new Request("http://x/api/citizen-chain"));
    expect(res.status).toBe(400);
  });
});
```

> Before writing, run `grep -rn "getPool" apps/web/lib apps/web/app/api` to find the real pool module and fix the `vi.mock` path + the route import accordingly.

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/app/api/citizen-chain/route.test.ts`
Expected: FAIL — `./route` not found.

- [ ] **Step 3: Implement the route**

Create `apps/web/app/api/citizen-chain/route.ts` (mirror the deep-import + `force-dynamic` pattern from `app/api/verify/route.ts`; use the real `getPool` path found above):

```ts
import { NextResponse } from "next/server";
import { readDecisionChainRaw } from "@civ/persistence/src/read";
import { toCausalChain } from "../../../lib/citizen-db";
import { getPool } from "../../../lib/db"; // adjust to the real module

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id) return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  try {
    const raw = await readDecisionChainRaw(getPool(), id);
    if (!raw) return NextResponse.json({ ok: true, chain: null });
    const chain = toCausalChain({
      decisionId: raw.decisionId, action: raw.action, targetId: raw.targetId, reasoning: raw.reasoning,
      provider: raw.provider, model: raw.model, verified: raw.verified,
      memories: raw.memories, beliefs: raw.beliefs, event: raw.event,
      rootHash: raw.rootHash, txHash: raw.txHash,
      socialDrivers: raw.socialDrivers, socialQuery: raw.socialQuery ?? undefined, orgDriver: raw.orgDriver ?? undefined,
    });
    return NextResponse.json({ ok: true, chain });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/app/api/citizen-chain/route.test.ts && pnpm -r typecheck`
Expected: PASS + clean.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/api/citizen-chain
git commit -m "feat(web): add /api/citizen-chain for the map side panel"
```

---

### Task 6: Replay edge-selection helper

**Files:**
- Create: `apps/web/lib/replay.ts`
- Test: `apps/web/lib/replay.test.ts`

**Interfaces:**
- Consumes: `SocialDriverView` (Task 2), `MapEdge` shape `{ a: string; b: string; strength: number }`.
- Produces: `edgeKey(a, b): string` (order-independent) and `replayEdges(deciderId, drivers): Map<string, number>` mapping `edgeKey(decider, driver.id) → blendedScore` for each driver, clamped to [0,1]. Task 7 consumes both to light edges on the map.

- [ ] **Step 1: Write the failing test**

Create `apps/web/lib/replay.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { edgeKey, replayEdges } from "./replay";
import type { SocialDriverView } from "./types";

const drivers: SocialDriverView[] = [
  { id: "marcus", name: "Marcus", relationshipStrength: 0.68, relevance: 0.46, blendedScore: 0.31, trust: 71, influence: 65, neighborText: "" },
  { id: "lena", name: "Lena", relationshipStrength: 0.68, relevance: 0.10, blendedScore: 0.07, trust: 70, influence: 66, neighborText: "" },
];

describe("replay edges", () => {
  it("edgeKey is order-independent", () => {
    expect(edgeKey("ada", "marcus")).toBe(edgeKey("marcus", "ada"));
  });
  it("maps each driver to a lit edge keyed from the decider", () => {
    const lit = replayEdges("ada", drivers);
    expect(lit.get(edgeKey("ada", "marcus"))).toBeCloseTo(0.31);
    expect(lit.get(edgeKey("ada", "lena"))).toBeCloseTo(0.07);
    expect(lit.size).toBe(2);
  });
  it("clamps intensity to [0,1] and ignores self-edges", () => {
    const lit = replayEdges("ada", [{ ...drivers[0], id: "ada", blendedScore: 2 }]);
    expect(lit.size).toBe(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/lib/replay.test.ts`
Expected: FAIL — `./replay` not found.

- [ ] **Step 3: Implement `replay.ts`**

Create `apps/web/lib/replay.ts`:

```ts
import type { SocialDriverView } from "./types";

/** Order-independent key for an undirected edge between two node ids. */
export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Map each social driver to the (decider ↔ driver) edge it lit, valued by blended score. */
export function replayEdges(deciderId: string, drivers: SocialDriverView[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of drivers) {
    if (d.id === deciderId) continue;
    m.set(edgeKey(deciderId, d.id), Math.max(0, Math.min(1, d.blendedScore)));
  }
  return m;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run apps/web/lib/replay.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/lib/replay.ts apps/web/lib/replay.test.ts
git commit -m "feat(web): replay edge-selection helper for the map"
```

---

### Task 7: Map — idle aliveness, click-to-panel, decision replay

**Files:**
- Modify: `apps/web/components/Constellation.tsx` (click → panel; replay edge lighting; selection state)
- Create: `apps/web/components/MapSidePanel.tsx` (side panel: fetches `/api/citizen-chain`, renders chain + replay button)
- Modify: `apps/web/app/globals.css` (idle halo pulse, replay-edge glow, side-panel layout)
- Modify: `apps/web/app/map/page.tsx` (tagline polish only)
- Test: `apps/web/components/MapSidePanel.test.tsx`

**Interfaces:**
- Consumes: `replayEdges`/`edgeKey` (Task 6), `/api/citizen-chain` (Task 5), `CausalChain` + `SocialDrivers` (Task 3), `MapWorld` (existing).
- Produces: `MapSidePanel({ citizenId, name, onReplay, onClose })`; `Constellation` selection + replay state.

- [ ] **Step 1: Write the failing test (side panel)**

Create `apps/web/components/MapSidePanel.test.tsx`:

```tsx
// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MapSidePanel } from "./MapSidePanel";

afterEach(() => vi.unstubAllGlobals());

const chain = {
  decisionId: "d1", rootHash: "0xroot", txHash: "0xtx",
  nodes: [
    { kind: "social", title: "Social context", detail: { query: "q", neighbors: "1" },
      socialDrivers: [{ id: "marcus", name: "Marcus Vale", relationshipStrength: 0.68, relevance: 0.46, blendedScore: 0.31, trust: 71, influence: 65, neighborText: "steady" }],
      socialQuery: "q" },
    { kind: "decision", title: "Decision", detail: { action: "invest", target: "marcus", reasoning: "trust" } },
  ],
};

describe("MapSidePanel", () => {
  it("fetches and renders the citizen's chain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, chain }) }));
    render(<MapSidePanel citizenId="ada" name="Ada" onReplay={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Social context")).toBeDefined());
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run apps/web/components/MapSidePanel.test.tsx`
Expected: FAIL — `./MapSidePanel` not found.

- [ ] **Step 3: Implement `MapSidePanel.tsx`**

Create `apps/web/components/MapSidePanel.tsx`:

```tsx
"use client";
import { useEffect, useState } from "react";
import type { CausalChainView, SocialDriverView } from "../lib/types";
import { CausalChain } from "./CausalChain";

type Loaded = { chain: CausalChainView | null };

export function MapSidePanel({
  citizenId, name, onReplay, onClose,
}: {
  citizenId: string; name: string;
  onReplay: (deciderId: string, drivers: SocialDriverView[]) => void;
  onClose: () => void;
}) {
  const [state, setState] = useState<"loading" | "error" | Loaded>("loading");

  useEffect(() => {
    let alive = true;
    setState("loading");
    fetch(`/api/citizen-chain?id=${encodeURIComponent(citizenId)}`)
      .then((r) => r.json())
      .then((j: { ok: boolean; chain: CausalChainView | null }) => {
        if (!alive) return;
        setState(j.ok ? { chain: j.chain } : "error");
      })
      .catch(() => { if (alive) setState("error"); });
    return () => { alive = false; };
  }, [citizenId]);

  const chain = typeof state === "object" ? state.chain : null;
  const social = chain?.nodes.find((n) => n.kind === "social");
  const drivers = social?.socialDrivers ?? [];

  return (
    <aside className="map-panel">
      <header className="map-panel-head">
        <span className="map-panel-name">{name}</span>
        <div className="map-panel-actions">
          {drivers.length > 0 && (
            <button className="map-panel-replay" onClick={() => onReplay(citizenId, drivers)}>
              ▸ Replay last decision
            </button>
          )}
          <a className="map-panel-open" href={`/citizens/${citizenId}`}>open profile →</a>
          <button className="map-panel-close" onClick={onClose} aria-label="Close">×</button>
        </div>
      </header>
      {state === "loading" && <p className="map-panel-status mono">loading reasoning…</p>}
      {state === "error" && <p className="map-panel-status mono">could not load this citizen’s reasoning</p>}
      {chain === null && typeof state === "object" && <p className="map-panel-status mono">no decision recorded yet</p>}
      {chain && <CausalChain chain={chain} />}
    </aside>
  );
}
```

- [ ] **Step 4: Run side-panel test to verify it passes**

Run: `npx vitest run apps/web/components/MapSidePanel.test.tsx`
Expected: PASS.

- [ ] **Step 5: Wire selection + replay into Constellation**

In `apps/web/components/Constellation.tsx`:

- Add imports: `import { MapSidePanel } from "./MapSidePanel";`, `import { edgeKey, replayEdges } from "../lib/replay";`, `import type { SocialDriverView } from "../lib/types";`
- In `Field`, add state for the click-selected node and the replay map:

```tsx
  const [selected, setSelected] = useState<{ id: string; name: string } | null>(null);
  const [replay, setReplay] = useState<Map<string, number> | null>(null);
```

- Change the citizen node `<a href=…>` to a clickable `<g>` that selects instead of navigating (keep org nodes as links). Replace the citizen branch so clicking sets `selected` and clears replay:

```tsx
              onClick={(e) => { e.preventDefault(); setSelected({ id: n.id, name: n.name }); setReplay(null); }}
```

  (Apply to the `<a>` wrapper; keep `href` for orgs and as a middle-click fallback for citizens.)

- Light replay edges: in the relationship-edges map, when `replay` is set, override stroke + width for keys present in it:

```tsx
          const rk = replay?.get(edgeKey(e.a, e.b));
          // …on the <line>:
          className={`cn-edge${rk != null ? " cn-edge--replay" : ""}`}
          strokeWidth={rk != null ? 0.5 + rk * 1.6 : 0.35 + e.strength * 0.6}
          opacity={rk != null ? 1 : (on ? 1 : 0.1) * (0.28 + e.strength * 0.55)}
```

- Render the panel at the end of the `Field` return (inside the panel wrapper, after `</svg>`), passing a replay handler that builds the map:

```tsx
      {selected && (
        <MapSidePanel
          citizenId={selected.id}
          name={selected.name}
          onReplay={(deciderId, drivers: SocialDriverView[]) => setReplay(replayEdges(deciderId, drivers))}
          onClose={() => { setSelected(null); setReplay(null); }}
        />
      )}
```

  (Wrap `<svg>` + panel in a positioned container `<div className="cn-field-inner">` so the panel can sit beside/over the field.)

- [ ] **Step 6: Add idle aliveness + replay/panel styles**

Append to `apps/web/app/globals.css`:

```css
/* idle aliveness — staggered, CSS-only (no client physics; SSR layout stays deterministic) */
@keyframes cn-breathe { 0%,100% { opacity: .12; } 50% { opacity: .30; } }
.cn-halo { animation: cn-breathe 6s ease-in-out infinite; }
.cn-node:nth-child(3n) .cn-halo { animation-delay: -2s; }
.cn-node:nth-child(3n+1) .cn-halo { animation-delay: -4s; }
@media (prefers-reduced-motion: reduce) { .cn-halo { animation: none; } }

/* decision replay — light the retrieved edges in signal-blue */
@keyframes cn-pulse { 0% { stroke-dashoffset: 6; } 100% { stroke-dashoffset: 0; } }
.cn-edge--replay { stroke: var(--accent); stroke-dasharray: 3 3; animation: cn-pulse 1s linear infinite; filter: drop-shadow(0 0 1px var(--accent)); }

/* map side panel */
.cn-field-inner { position: relative; }
.map-panel { position: absolute; top: 0; right: 0; width: min(340px, 92%); max-height: 100%; overflow: auto;
  background: rgba(10,11,13,.94); border: 1px solid var(--line); border-radius: 10px; padding: 12px;
  backdrop-filter: blur(6px); display: flex; flex-direction: column; gap: 10px; }
.map-panel-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.map-panel-name { color: var(--fg); font-size: 14px; font-weight: 600; }
.map-panel-actions { display: flex; align-items: center; gap: 8px; }
.map-panel-replay { background: none; border: 1px solid var(--accent); color: var(--accent); border-radius: 6px; padding: 3px 8px; font-size: 11px; cursor: pointer; font-family: inherit; }
.map-panel-open { color: var(--muted); font-size: 11px; text-decoration: none; }
.map-panel-close { background: none; border: none; color: var(--muted); font-size: 16px; cursor: pointer; line-height: 1; }
.map-panel-status { color: var(--muted); font-size: 12px; }
```

> Reuse existing tokens for any of `--fg`/`--muted`/`--line` not already defined (same note as Task 3 Step 7).

- [ ] **Step 7: Polish the map page copy**

In `apps/web/app/map/page.tsx`, update the sub-tagline to name the new capability (keep the existing hero/tagline structure; change only the descriptive line):

```tsx
        the provenance layer for autonomous AI — watch citizens reason over the social graph, live on 0G. click any citizen to replay the decision and see which ties pulled it.
```

- [ ] **Step 8: Build + typecheck + full test sweep**

Run: `cd apps/web && npx next build` then from repo root `pnpm -r typecheck && npx vitest run`
Expected: web build succeeds; typecheck clean; all unit tests pass (the 2 known pre-existing `judge-metric.test.ts` failures needing `OPIK_API_KEY` are unrelated and out of this branch's diff).

- [ ] **Step 9: Commit**

```bash
git add apps/web/components/Constellation.tsx apps/web/components/MapSidePanel.tsx apps/web/components/MapSidePanel.test.tsx apps/web/app/globals.css apps/web/app/map/page.tsx
git commit -m "feat(web): make the map interactive with decision replay"
```

---

## Self-Review

**Spec coverage:**
- Goal 1 (graph reasoning visible): Task 2 (builders emit social node) + Task 3 (SocialDrivers + chain render) + Task 4 (verify page). ✓
- Goal 2 (map showpiece, interactive + replay): Task 5 (chain API) + Task 6 (replay helper) + Task 7 (idle aliveness, panel, replay). ✓
- Data model (mirror socialDrivers into meta, types in shared): Task 1. ✓
- One reused `SocialDrivers`: built in Task 3, reused in Task 4 (verify) and Task 7 (via CausalChain in the panel). ✓
- Graceful degradation: `socialNode` returns null with no drivers (Task 2); replay button hidden when `drivers.length === 0` (Task 7); panel shows "no decision recorded yet". ✓
- Observatory tokens / CSS-only aliveness / no new deps / branch isolation: enforced in Global Constraints + per-task style notes. ✓

**Type consistency:** `SocialDriver` (shared, Task 1) ↔ `SocialDriverView` (web, Task 2) share identical fields; `toCausalChain`/`socialNode` signatures stable across Tasks 2/5/7; `edgeKey`/`replayEdges` names consistent across Tasks 6/7; `/api/citizen-chain` return `{ ok, chain }` consumed identically in Tasks 5 (test) and 7 (panel).

**Placeholder scan:** No TBD/TODO; every code step shows full code; tests include real assertions. Three deliberate "find the real path" notes (existing engine test harness, the `getPool` module, the citizen-page builder mapping) are grep-guided lookups, not placeholders — each gives the exact grep and the exact edit to make once found.
