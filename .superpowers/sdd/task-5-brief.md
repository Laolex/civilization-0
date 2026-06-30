### Task 5: `verifyChain` (pure re-walk + tamper detection) — Track B

**Package:** `@civ/history`. **Depends on:** Tasks 2–4 (`canonicalJSON`, `sha256Hex`, `eventHash`, `merkleRoot` all in `packages/history/src/hash.ts`). This is the LAST Track B task — after it, the controller runs one consolidated independent review of the whole `hash.ts`.

**Files:**
- Modify (append): `packages/history/src/hash.ts`
- Modify (append): `packages/history/src/hash.test.ts`

**Interfaces:**
- Produces: `verifyChain(events: { event: HistoryEvent; eventHash: Hash; parentHash: Hash }[]): { ok: boolean; brokenAt?: number; reason?: string }`.
  Verifies (a) each stored `eventHash` recomputes from the event, (b) `parentHash[i] === eventHash[i-1]`
  (first row links to `GENESIS_PARENT`). Input is a single world's events in `seq` order.
  This is the Invariant #3 (append-only) tamper-evidence walk.

This is TDD. Append only.

#### Step 1: Append the failing test to `packages/history/src/hash.test.ts`
```ts
import { verifyChain } from "./hash";

function chainOf(cts: CognitiveTransition[]) {
  let parent = GENESIS_PARENT;
  return cts.map((raw) => {
    const ev = { ...raw, header: { ...raw.header, parentHash: parent } };
    const h = eventHash(ev);
    const row = { event: ev as HistoryEvent, eventHash: h, parentHash: parent };
    parent = h;
    return row;
  });
}

describe("verifyChain", () => {
  it("accepts a well-formed chain", () => {
    const rows = chainOf([fakeCT({ header: undefined as never }), fakeCT()]
      .map((_, i) => fakeCT({ reasoning: `r${i}` })));
    expect(verifyChain(rows).ok).toBe(true);
  });
  it("detects a tampered payload", () => {
    const rows = chainOf([fakeCT({ reasoning: "a" }), fakeCT({ reasoning: "b" })]);
    (rows[1].event as CognitiveTransition).reasoning = "TAMPERED";
    const r = verifyChain(rows);
    expect(r.ok).toBe(false);
    expect(r.brokenAt).toBe(1);
  });
  it("detects a broken parent link", () => {
    const rows = chainOf([fakeCT({ reasoning: "a" }), fakeCT({ reasoning: "b" })]);
    rows[1].parentHash = sha256Hex("wrong");
    (rows[1].event as CognitiveTransition).header.parentHash = rows[1].parentHash;
    rows[1].eventHash = eventHash(rows[1].event);
    expect(verifyChain(rows).ok).toBe(false);
  });
});
```
Reuse imports already in the file: `eventHash`, `sha256Hex`, `GENESIS_PARENT`, `CognitiveTransition`, `HistoryEvent`, `fakeCT` are all already present from Tasks 3–4. Add ONLY `import { verifyChain } from "./hash";`. (`HistoryEvent` type — if not already imported as a value/type in the test file, add it to the existing `./index` type import; check before adding to avoid a duplicate.)

#### Step 2: Run to verify it fails
`pnpm vitest run packages/history/src/hash.test.ts`
Expected: FAIL ("verifyChain is not a function"). Capture RED output.

#### Step 3: Append the implementation to `packages/history/src/hash.ts`
```ts
import { GENESIS_PARENT } from "./types";

export function verifyChain(
  events: { event: HistoryEvent; eventHash: Hash; parentHash: Hash }[],
): { ok: boolean; brokenAt?: number; reason?: string } {
  let expectedParent = GENESIS_PARENT;
  for (let i = 0; i < events.length; i++) {
    const row = events[i]!;
    const recomputed = eventHash(row.event);
    if (recomputed !== row.eventHash)
      return { ok: false, brokenAt: i, reason: "eventHash mismatch (tampered payload)" };
    if (row.parentHash !== expectedParent)
      return { ok: false, brokenAt: i, reason: "parentHash discontinuity" };
    expectedParent = row.eventHash;
  }
  return { ok: true };
}
```
Add the `import { GENESIS_PARENT } from "./types";` at the top of hash.ts with the other imports (it's a value import, separate from the existing `import type { HistoryEvent, Hash } from "./types";` — both valid).

#### Step 4: Run to verify it passes
`pnpm vitest run packages/history/src/hash.test.ts`
Expected: PASS (all Track B tests). Then `pnpm -r typecheck` — confirm clean.

#### Step 5: Commit (NO Co-Authored-By, NO AI attribution)
```bash
git add packages/history/src/hash.ts packages/history/src/hash.test.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): verifyChain re-walk with tamper + parent-link detection"
```

#### Report
Write your full report to `/opt/civilization-0-history/.superpowers/sdd/task-5-report.md` (RED/GREEN evidence, files changed, test summary, concerns). Then reply ≤15 lines: Status, commit SHA+subject, one-line test summary, concerns, report path.
