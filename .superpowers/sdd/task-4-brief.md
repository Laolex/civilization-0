### Task 4: `merkleRoot` — Track B

**Package:** `@civ/history`. **Depends on:** Tasks 2–3 (`sha256Hex` exists in `packages/history/src/hash.ts`).

**Files:**
- Modify (append): `packages/history/src/hash.ts`
- Modify (append): `packages/history/src/hash.test.ts`

**Interfaces:**
- Produces: `merkleRoot(hashes: Hash[]): Hash` — binary merkle, duplicate-last on odd,
  `sha256Hex(left + right)` per node; empty → `sha256Hex("")`; single → that leaf.

This is TDD. Append only — do not rewrite existing Task 2/3 content.

#### Step 1: Append the failing test to `packages/history/src/hash.test.ts`
```ts
import { merkleRoot } from "./hash";

describe("merkleRoot", () => {
  it("is deterministic", () => {
    const hs = [sha256Hex("a"), sha256Hex("b"), sha256Hex("c")];
    expect(merkleRoot(hs)).toBe(merkleRoot(hs));
  });
  it("is order-sensitive", () => {
    expect(merkleRoot([sha256Hex("a"), sha256Hex("b")]))
      .not.toBe(merkleRoot([sha256Hex("b"), sha256Hex("a")]));
  });
  it("returns the single leaf unchanged", () => {
    const h = sha256Hex("only");
    expect(merkleRoot([h])).toBe(h);
  });
});
```
`sha256Hex` is already imported from Task 3 — reuse that import; add only `import { merkleRoot } from "./hash";`.

#### Step 2: Run to verify it fails
`pnpm vitest run packages/history/src/hash.test.ts`
Expected: FAIL ("merkleRoot is not a function"). Capture RED output.

#### Step 3: Append the implementation to `packages/history/src/hash.ts`
```ts
export function merkleRoot(hashes: Hash[]): Hash {
  if (hashes.length === 0) return sha256Hex("");
  let level = hashes.slice();
  while (level.length > 1) {
    const next: Hash[] = [];
    for (let i = 0; i < level.length; i += 2) {
      const left = level[i]!;
      const right = i + 1 < level.length ? level[i + 1]! : left; // duplicate last on odd
      next.push(sha256Hex(left + right));
    }
    level = next;
  }
  return level[0]!;
}
```

#### Step 4: Run to verify it passes
`pnpm vitest run packages/history/src/hash.test.ts`
Expected: PASS (11 tests total). Then `pnpm -r typecheck` — confirm clean.

#### Step 5: Commit (NO Co-Authored-By, NO AI attribution)
```bash
git add packages/history/src/hash.ts packages/history/src/hash.test.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): merkleRoot over event hashes"
```

#### Report
Write your full report to `/opt/civilization-0-history/.superpowers/sdd/task-4-report.md` (RED/GREEN evidence, files changed, test summary, concerns). Then reply ≤15 lines: Status, commit SHA+subject, one-line test summary, concerns, report path.
