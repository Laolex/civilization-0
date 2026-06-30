### Task 2: Canonical JSON (`canonicalJSON`) — Track B

**Package:** `@civ/history` (scaffolded in Task 1; types live in `packages/history/src/types.ts`, barrel `packages/history/src/index.ts`).

**Files:**
- Create: `packages/history/src/hash.ts`
- Create: `packages/history/src/hash.test.ts`

**Interfaces:**
- Produces: `canonicalJSON(value: unknown): string` — deterministic, recursively
  key-sorted, language-independent serialization (JCS / RFC 8785 intent).
  Consumed by `eventHash` (Task 3).

**Binding constraint (canonicalization):** This is the hashing substrate for the
whole event chain. Key order and number formatting MUST be stable across runtimes.
NEVER substitute a bare `JSON.stringify` for hashing — a non-canonical hash silently
breaks replay (Invariant #3 tamper-evidence depends on this being deterministic).
`CANON_VERSION` is pinned to `"jcs-1"` in types.ts.

This is TDD. Follow the steps in order.

#### Step 1: Write the failing test — `packages/history/src/hash.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { canonicalJSON } from "./hash";

describe("canonicalJSON", () => {
  it("is key-order independent", () => {
    expect(canonicalJSON({ b: 1, a: 2 })).toBe(canonicalJSON({ a: 2, b: 1 }));
  });
  it("sorts nested keys and preserves array order", () => {
    expect(canonicalJSON({ z: { y: 1, x: 2 }, a: [3, 1, 2] }))
      .toBe('{"a":[3,1,2],"z":{"x":2,"y":1}}');
  });
  it("serializes null/bool/number/string deterministically", () => {
    expect(canonicalJSON({ n: null, t: true, i: 42, s: "hi" }))
      .toBe('{"i":42,"n":null,"s":"hi","t":true}');
  });
  it("omits undefined object properties", () => {
    expect(canonicalJSON({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});
```

#### Step 2: Run to verify it fails
`pnpm vitest run packages/history/src/hash.test.ts`
Expected: FAIL ("canonicalJSON is not a function" / module not found). Capture this RED output for your report.

#### Step 3: Implement `canonicalJSON` — `packages/history/src/hash.ts`
```ts
/**
 * Deterministic, language-independent JSON canonicalization (JCS / RFC 8785 intent).
 * Object keys sorted lexicographically (by UTF-16 code unit, matching Array.sort default,
 * which is sufficient for our ASCII keys); arrays keep order; undefined props omitted.
 * NEVER replace this with a bare JSON.stringify for hashing — key order/number formatting
 * are not stable across runtimes and a non-canonical hash silently breaks replay.
 */
export function canonicalJSON(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value as number)) throw new Error("canonicalJSON: non-finite number");
    return JSON.stringify(value);
  }
  if (t === "boolean" || t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map((v) => canonicalJSON(v ?? null)).join(",") + "]";
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJSON(obj[k])).join(",") + "}";
  }
  throw new Error(`canonicalJSON: unsupported type ${t}`);
}
```

#### Step 4: Run to verify it passes
`pnpm vitest run packages/history/src/hash.test.ts`
Expected: PASS (4 tests). Then run `pnpm -r typecheck` and confirm clean.

#### Step 5: Commit (NO Co-Authored-By, NO AI attribution)
```bash
git add packages/history/src/hash.ts packages/history/src/hash.test.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): deterministic canonicalJSON (JCS-1)"
```

#### Report
Write your full report to `/opt/civilization-0-history/.superpowers/sdd/task-2-report.md` (TDD RED/GREEN evidence, files changed, test summary, concerns). Then reply ≤15 lines: Status, commit SHA+subject, one-line test summary, concerns, report path.
