### Task 3: Brain context fields + prompt social block

**Files:**
- Modify: `packages/brain/src/index.ts` (`DecisionContext`)
- Modify: `packages/zerog/src/brain.ts` (`buildMessages`)
- Test: `packages/zerog/src/brain.test.ts` (add cases)

**Interfaces:**
- Produces: `DecisionContext.neighbors?: ScoredNeighbor[]`, `DecisionContext.orgContext?: OrgContext | null`.
- Consumes: `ScoredNeighbor`, `OrgContext` from `@civ/shared`.

- [ ] **Step 1: Widen `DecisionContext`.** In `packages/brain/src/index.ts`, add `ScoredNeighbor, OrgContext` to the `@civ/shared` import and add to the `DecisionContext` interface (after `availableActions: ActionType[];`):

```typescript
  neighbors?: ScoredNeighbor[];
  orgContext?: OrgContext | null;
```

- [ ] **Step 2: Write the failing test.** Append to `packages/zerog/src/brain.test.ts` (inside the existing top-level `describe`, or a new one — import `buildMessages` if not already):

```typescript
import { buildMessages } from "./brain";
import type { DecisionContext } from "@civ/brain";

function ctxWith(extra: Partial<DecisionContext>): DecisionContext {
  return {
    citizen: { id: "ada", name: "Ada", occupation: "Engineer", age: 29,
      traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
      wealth: 0, reputation: 50, tier: 3, createdDay: 0 },
    goal: null, memories: [], beliefs: [], relationships: [],
    worldState: { day: 3, economy: {}, headline: "Recession" },
    availableActions: ["work", "partner"], ...extra,
  };
}

describe("buildMessages social context", () => {
  it("omits the People/Org blocks when none are present", () => {
    const user = buildMessages(ctxWith({}))[1].content;
    expect(user).not.toContain("People around you");
    expect(user).not.toContain("Your organization");
  });

  it("renders neighbors and org when present", () => {
    const user = buildMessages(ctxWith({
      neighbors: [{
        summary: { id: "marcus", name: "Marcus", relationship: { trust: 70, friendship: 50, influence: 60 },
          latestAction: "invest", latestReasoning: "backed Ada", topGoal: "grow capital", wealth: 100000, reputation: 70 },
        relationshipStrength: 0.65, relevance: 0.6, blendedScore: 0.39 }],
      orgContext: { id: "o1", name: "Ada Collective", kind: "guild", latestAction: "partner", latestReasoning: "expand" },
    }))[1].content;
    expect(user).toContain("People around you");
    expect(user).toContain("Marcus");
    expect(user).toContain("invest");
    expect(user).toContain("Your organization Ada Collective");
  });
});
```

- [ ] **Step 3: Run it, verify it fails.** Run: `pnpm test packages/zerog/src/brain.test.ts`
Expected: FAIL — assertions on missing "People around you" text.

- [ ] **Step 4: Render the social block in `buildMessages`.** In `packages/zerog/src/brain.ts`, inside `buildMessages`, after the `rels` line (~line 22) add:

```typescript
  const people = (ctx.neighbors ?? []).map((n) => {
    const s = n.summary;
    const move = s.latestAction
      ? `${s.latestAction}${s.latestReasoning ? ` (${s.latestReasoning})` : ""}`
      : "no recent move";
    const drive = s.topGoal ?? s.strongestBelief ?? "unknown drive";
    return `- ${s.name}: trust ${s.relationship.trust}, influence ${s.relationship.influence}; recently ${move}; pursuing ${drive}; wealth ${s.wealth}, reputation ${s.reputation}`;
  }).join("\n");
  const org = ctx.orgContext
    ? `Your organization ${ctx.orgContext.name} (${ctx.orgContext.kind})` +
      (ctx.orgContext.latestAction
        ? ` recently chose to ${ctx.orgContext.latestAction}${ctx.orgContext.latestReasoning ? `: ${ctx.orgContext.latestReasoning}` : ""}.`
        : ".")
    : "";
```

Then change the `user` template's tail. Replace:

```typescript
Relationships:
${rels}
Choose ONE action and return the JSON.`;
```

with:

```typescript
Relationships:
${rels}
${people ? `People around you:\n${people}\n` : ""}${org ? `${org}\n` : ""}Choose ONE action and return the JSON.`;
```

- [ ] **Step 5: Run the test, verify it passes.** Run: `pnpm test packages/zerog/src/brain.test.ts`
Expected: PASS (existing cases + 2 new).

- [ ] **Step 6: Commit.**

```bash
git add packages/brain/src/index.ts packages/zerog/src/brain.ts packages/zerog/src/brain.test.ts
git commit -m "feat(graphrag): brain DecisionContext neighbors/org + prompt social block"
```

---

