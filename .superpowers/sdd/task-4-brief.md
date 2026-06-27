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

