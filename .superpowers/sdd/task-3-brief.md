### Task 3: `sha256Hex` + `eventHash` — Track B

**Package:** `@civ/history`. **Depends on:** Task 2 (`canonicalJSON` already exists in `packages/history/src/hash.ts`).

**Files:**
- Modify (append): `packages/history/src/hash.ts`
- Modify (append): `packages/history/src/hash.test.ts`

**Interfaces:**
- Consumes: `canonicalJSON` (same file).
- Produces: `sha256Hex(input: string): Hash` (returns `"0x" + 64 hex`);
  `eventHash(event: HistoryEvent): Hash` = `sha256Hex(canon(header) ‖ canon(payload))`
  where `payload` = event minus `header`.

This is TDD. Append to the existing files (do not rewrite what Task 2 wrote).

#### Step 1: Append the failing test to `packages/history/src/hash.test.ts`
```ts
import { sha256Hex, eventHash } from "./hash";
import { GENESIS_PARENT, SCHEMA_VERSION, type CognitiveTransition } from "./index";

function fakeCT(over: Partial<CognitiveTransition> = {}): CognitiveTransition {
  return {
    header: { eventId: "e1", parentHash: GENESIS_PARENT, worldId: "w1", tickId: 1,
      engineVersion: "test", schemaVersion: SCHEMA_VERSION, timestamp: "2026-06-27T00:00:00.000Z" },
    actor: "c1", observation: { query: "q" }, retrievedMemories: [], retrievedBeliefs: [],
    socialDrivers: [], availableActions: ["work"], selectedAction: "work", reasoning: "r",
    worldDelta: { relationshipsChanged: [], wealthTransferred: [], eventsCreated: [] },
    execution: { provider: "p", modelId: "m", modelVersion: "v", promptHash: "0x1",
      worldHash: "0x2", verified: true },
    candidates: null, beliefDelta: null, ...over,
  };
}

describe("eventHash", () => {
  it("sha256Hex is a 0x-prefixed 64-hex digest", () => {
    const h = sha256Hex("abc");
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it("is deterministic for equal events", () => {
    expect(eventHash(fakeCT())).toBe(eventHash(fakeCT()));
  });
  it("changes when the payload changes", () => {
    expect(eventHash(fakeCT())).not.toBe(eventHash(fakeCT({ reasoning: "different" })));
  });
  it("changes when the parentHash changes", () => {
    const a = fakeCT();
    const b = fakeCT({ header: { ...a.header, parentHash: sha256Hex("x") } });
    expect(eventHash(a)).not.toBe(eventHash(b));
  });
});
```
Note: the existing `import { describe, it, expect } from "vitest";` at the top of hash.test.ts already covers describe/it/expect — do NOT duplicate it. Add only the new imports shown above.

#### Step 2: Run to verify it fails
`pnpm vitest run packages/history/src/hash.test.ts`
Expected: FAIL ("sha256Hex is not a function"). Capture RED output.

#### Step 3: Append the implementation to `packages/history/src/hash.ts`
```ts
import { createHash } from "node:crypto";
import type { HistoryEvent, Hash } from "./types";

export function sha256Hex(input: string): Hash {
  return "0x" + createHash("sha256").update(input, "utf8").digest("hex");
}

/** eventHash = sha256( canon(header) ‖ canon(payload) ), payload = event minus header. */
export function eventHash(event: HistoryEvent): Hash {
  const { header, ...payload } = event;
  return sha256Hex(canonicalJSON(header) + "\n" + canonicalJSON(payload));
}
```
Place the two `import` lines at the TOP of hash.ts (imports must be at module top, above `canonicalJSON`). The functions can go below `canonicalJSON`.

#### Step 4: Run to verify it passes
`pnpm vitest run packages/history/src/hash.test.ts`
Expected: PASS (8 tests total). Then `pnpm -r typecheck` — confirm clean.

#### Step 5: Commit (NO Co-Authored-By, NO AI attribution)
```bash
git add packages/history/src/hash.ts packages/history/src/hash.test.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): sha256Hex + eventHash over canonical header‖payload"
```

#### Report
Write your full report to `/opt/civilization-0-history/.superpowers/sdd/task-3-report.md` (RED/GREEN evidence, files changed, test summary, concerns). Then reply ≤15 lines: Status, commit SHA+subject, one-line test summary, concerns, report path.
