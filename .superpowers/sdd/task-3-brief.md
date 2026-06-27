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

