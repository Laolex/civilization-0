# `@civ/history` Event Engine — Phase 1A (Walking Skeleton) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Stand up an append-only, hash-chained, 0G-anchored history log of authenticated cognition for ONE fat event type (`CognitiveTransition`), dual-written transactionally alongside the untouched live tick, from which `civ explain --citizen <id> --tick <day>` reconstructs and verifies a cognitive trace — without altering live civilization behavior.

**Architecture:** A new `@civ/history` package owns the event types, canonical hashing, per-world hash chain, transactional append, fold→project, verification proofs, and 0G anchoring. The engine stays history-agnostic (it only returns richer *pure values*). `@civ/persistence`'s `persistTick` calls `history.append(tx, transition)` **inside its existing transaction** so a tick's decision and its `CognitiveTransition` commit or roll back together (Invariant #2). Legacy rows remain the source of truth; history is a verified *shadow* (no truth-flip in 1A).

**Tech Stack:** TypeScript ESM, pnpm workspace, Node 20, Postgres 16 + pgvector (`pg`), vitest (unit project + `*.itest.ts` integration project against `civ0_test`), Node `crypto` (sha-256), `@civ/zerog` (`createZeroGStorage` → 0G Storage), `tsx` for CLI scripts.

## Global Constraints

- **The four Provenance Invariants are the spec.** Copy verbatim into `packages/history/src/types.ts` as a doc comment, and never violate them:
  - **#1 Authenticated cognition only.** Never reconstruct/infer/estimate/fabricate cognition. Unknown cognition stays `null` and renders as `"unavailable"`, never a fabricated value. `candidates` and `beliefDelta` are ALWAYS `null` in 1A.
  - **#2 Mutation ⇔ history (bidirectional).** Every committed world mutation has a corresponding `CognitiveTransition`, and vice versa, written in the **same DB transaction**. No orphans either direction. `Anchor` events are system events — exempt from ⇔ but bound by #3.
  - **#3 Append-only.** No event modified, deleted, reordered, or recomputed. Corrections are new events only.
  - **#4 Schema permanence.** Events are interpreted under the `schemaVersion` recorded at emission. Readers dispatch on `schemaVersion`; never silently re-read under a later schema.
- **Canonicalization is normative.** Hashing MUST use the deterministic, language-independent, versioned `canonicalJSON` (JCS-style, RFC 8785 intent). NEVER hash a language-default `JSON.stringify`. Pin `CANON_VERSION = "jcs-1"`. `SCHEMA_VERSION = 1`.
- **Engine imports NOTHING from `@civ/history`.** `runCitizenTick` only returns richer pure values (`observation`, `availableActions`) as structural inline types. Dependency direction is strictly `history → engine`/`shared`, never the reverse.
- **No truth-flip, no brain-interface change, no candidate scoring / belief-deltas, no new event types beyond `CognitiveTransition` + `Anchor`.** Legacy per-decision 0G trace archival stays untouched (additive coexistence).
- **Build order (do NOT reorder):** types → canonical hash → chain verify → event builder → fold → projection → schema+append → transactional wiring → shadow/faithfulness verification → `civ explain` → **then** 0G anchor (an optimization/external-timestamp layer, NOT a correctness layer) → optional web explorer. Anchoring (and any 0G dependency) must never gate the correctness tracks.
- **Faithfulness Proof is WARN-ONLY in 1A** (logs a divergence, never fails the tick). It becomes fail-hard in 1B.
- **Commits:** no `Co-Authored-By` trailer, no AI attribution anywhere. Commit with `git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit`.
- **Branch isolation:** all work stays on `feat/history-event-engine` in worktree `/opt/civilization-0-history`. Never touch the live `/opt/civilization-0` checkout.
- **Tests:** unit tests are network-free (vitest default project). DB tests are `*.itest.ts` (run via `pnpm test:it`, `civ0_test` DB). Live 0G smoke is manual/gated only.

---

## File Structure

```
packages/history/                       NEW — @civ/history
  package.json                          workspace pkg (deps: @civ/shared, @civ/engine, @civ/zerog, @civ/storage, pg)
  tsconfig.json                         extends root, references shared/engine
  src/
    index.ts                            barrel re-export
    types.ts                            EventHeader, Observation, ExecutionContext, WorldDelta,
                                        Weighted{Memory,Belief}, Candidate/BeliefDelta, CognitiveTransition,
                                        AnchorEvent, WorldState, ExplainView, constants, the 4 invariants
    hash.ts                             canonicalJSON, sha256Hex, eventHash, merkleRoot, verifyChain
    build.ts                            buildCognitiveTransition(args) — pure
    reduce.ts                           fold(transitions) -> WorldState
    project.ts                          project(input, mode) -> ExplainView (+ replay stub)
    append.ts                           append(tx, event) -> {seq, eventHash, parentHash} (transactional)
    read.ts                             loadWorldEvents / loadTransition / loadLegacyDecision (read helpers)
    verify.ts                           faithfulnessProof(folded, legacy), verifyWorldChain(tx, worldId)
    anchor.ts                           anchorTick(...) — merkle -> 0G archive -> AnchorEvent + history_anchors
  scripts/
    explain.ts                          `civ explain` CLI (tsx)
    anchor-smoke.ts                     manual live 0G anchor smoke (~0.002 OG)

Touched (additive only):
  packages/engine/src/index.ts          TickResult gains observation + availableActions (pure return values)
  packages/persistence/src/schema.sql   + history_events, history_anchors, indexes, RLS enable
  packages/persistence/src/repository.ts persistTick calls history.append(client, transition) in-tx
  apps/web/app/explain/[citizen]/[tick]  OPTIONAL thin keyless explain view (only if CLI acceptance passes + time)
```

---

## Track A — Package scaffold & types

**Acceptance:** `@civ/history` resolves in the workspace; `types.ts` compiles and exports every Phase-1A type with the four invariants documented verbatim.
**Rollback:** delete `packages/history/`; no other package imports it yet.
**Invariants exercised:** #1, #4 (schema/version constants), structure for #2/#3.

### Task 1: Scaffold the `@civ/history` package + types

**Files:**
- Create: `packages/history/package.json`
- Create: `packages/history/tsconfig.json`
- Create: `packages/history/src/types.ts`
- Create: `packages/history/src/index.ts`
- Test: `packages/history/src/types.test.ts`

**Interfaces:**
- Produces: all exported types/constants below — consumed by every later task.

- [ ] **Step 1: Write the package manifest**

`packages/history/package.json`:
```json
{
  "name": "@civ/history",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": { "build": "tsc -p tsconfig.json --noEmit" },
  "dependencies": {
    "@civ/shared": "workspace:*",
    "@civ/engine": "workspace:*",
    "@civ/storage": "workspace:*",
    "@civ/zerog": "workspace:*",
    "pg": "^8.13.1"
  },
  "devDependencies": { "@types/pg": "^8.11.10" }
}
```

- [ ] **Step 2: Write the tsconfig**

`packages/history/tsconfig.json` (mirror a sibling package, e.g. `packages/persistence/tsconfig.json` — copy its exact `extends`/`compilerOptions`; if unsure run `cat packages/persistence/tsconfig.json` and replicate):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src", "scripts"]
}
```

**Also register the package in the workspace path map** (every other `@civ/*` package is listed there; bare `@civ/history` imports and `tsc --noEmit` typecheck depend on it). In root `tsconfig.base.json`, add to `compilerOptions.paths`, alongside the existing entries:
```json
      "@civ/history": ["packages/history/src"],
```

- [ ] **Step 3: Write `types.ts`**

`packages/history/src/types.ts`:
```ts
import type { SocialDriver } from "@civ/shared";

/**
 * THE FOUR PROVENANCE INVARIANTS (binding — these are the spec):
 *  #1 Authenticated cognition only. Never reconstruct/infer/estimate/fabricate cognition.
 *     Unknown cognition stays null and renders "unavailable", never a fabricated value.
 *  #2 Mutation <=> history (bidirectional). Every committed world mutation has a corresponding
 *     CognitiveTransition and vice versa, written in the SAME db transaction. No orphans.
 *  #3 Append-only. No event modified/deleted/reordered/recomputed. Corrections are new events.
 *  #4 Schema permanence. Events are read under the schemaVersion recorded at emission;
 *     readers dispatch on schemaVersion, never silently re-read under a later schema.
 */
export const SCHEMA_VERSION = 1 as const;
export const CANON_VERSION = "jcs-1" as const;
export const GENESIS_PARENT = "0x" + "0".repeat(64);

export type EventId = string;
export type Hash = string; // hex sha-256

export interface EventHeader {
  eventId: EventId;
  parentHash: Hash;          // prior event in this world's chain (chronology)
  causalParents?: EventId[]; // causality — present, unused in 1A
  worldId: string;
  tickId: number;            // = day in current engine
  engineVersion: string;
  schemaVersion: number;
  timestamp: string;         // ISO
}

export interface Observation {
  query: string;
  worldHeadline?: string;
  observedEntities?: string[];
  observationHash?: string;
}

export interface ExecutionContext {
  provider: string;
  modelId: string;
  modelVersion: string;
  promptHash: string;
  worldHash: string;
  runtimeHash?: string;
  temperature?: number;
  seed?: number;
  verified: boolean;
}

export interface WorldDelta {
  relationshipsChanged: { a: string; b: string; field: string; from: number; to: number }[];
  wealthTransferred: { actor: string; delta: number }[];
  eventsCreated: { id: string; type: string; targetId: string | null }[];
}

export interface WeightedMemory { id: string; weight: number; summary?: string }
export interface WeightedBelief { id: string; weight: number; statement?: string }

// 1A: always null (Invariant #1). Shapes pinned now so the schema is stable.
export interface CandidateEvaluation { action: string; utility?: number; confidence?: number; rationale?: string }
export interface BeliefDelta { beliefId: string; before: number; after: number; justification?: string }

export interface CognitiveTransition {
  header: EventHeader;
  actor: string;
  observation: Observation;
  retrievedMemories: WeightedMemory[];
  retrievedBeliefs: WeightedBelief[];
  socialDrivers: SocialDriver[];
  availableActions: string[];
  selectedAction: string;
  reasoning: string;
  worldDelta: WorldDelta | null;
  execution: ExecutionContext;
  candidates: CandidateEvaluation[] | null; // null in 1A
  beliefDelta: BeliefDelta | null;          // null in 1A
}

export interface AnchorEvent {
  header: EventHeader;
  merkleRoot: Hash;
  coveredEventIds: EventId[];
  zgRootHash: string | null;
  zgTxHash: string | null;
}

export type HistoryEvent = CognitiveTransition | AnchorEvent;
export type EventKind = "CognitiveTransition" | "Anchor";

export function eventKind(e: HistoryEvent): EventKind {
  return "merkleRoot" in e ? "Anchor" : "CognitiveTransition";
}

/** fold() output: minimal derived world state for 1A — latest authenticated transition per (world,tick,actor). */
export interface WorldState {
  latest: Map<string, CognitiveTransition>; // key = `${worldId}:${tickId}:${actor}`
}

/** What `civ explain` and the optional web view render. Null cognition -> "unavailable" (Invariant #1). */
export interface ExplainView {
  world: string;
  citizen: string;
  tick: number;
  observation: Observation;
  retrievedMemories: WeightedMemory[];
  retrievedBeliefs: WeightedBelief[];
  socialDrivers: SocialDriver[];
  availableActions: string[];
  selectedAction: string;
  reasoning: string;
  worldDelta: WorldDelta | null;
  execution: ExecutionContext;
  candidates: CandidateEvaluation[] | "unavailable";
  beliefDelta: BeliefDelta | "unavailable";
  eventHash: Hash;
  parentHash: Hash;
  chainVerified: boolean;
  anchor: { merkleRoot: Hash; zgRootHash: string | null; zgTxHash: string | null } | null;
}
```

- [ ] **Step 4: Write the barrel**

`packages/history/src/index.ts`:
```ts
export * from "./types";
```

- [ ] **Step 5: Write the failing test**

`packages/history/src/types.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { SCHEMA_VERSION, CANON_VERSION, GENESIS_PARENT, eventKind } from "./index";
import type { CognitiveTransition, AnchorEvent } from "./index";

describe("history types", () => {
  it("pins schema + canon versions and genesis parent", () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(CANON_VERSION).toBe("jcs-1");
    expect(GENESIS_PARENT).toBe("0x" + "0".repeat(64));
  });

  it("discriminates event kinds", () => {
    const anchor = { merkleRoot: "0xab" } as AnchorEvent;
    const ct = { actor: "1" } as CognitiveTransition;
    expect(eventKind(anchor)).toBe("Anchor");
    expect(eventKind(ct)).toBe("CognitiveTransition");
  });
});
```

- [ ] **Step 6: Install + run the test to verify it passes**

Run: `pnpm install && pnpm vitest run packages/history/src/types.test.ts`
Expected: PASS (2 tests). If `@civ/history` does not resolve, re-run `pnpm install` so the workspace links the new package.

- [ ] **Step 7: Commit**

```bash
git add packages/history pnpm-lock.yaml
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): scaffold @civ/history package + Phase 1A event types"
```

---

## Track B — Canonical hash & chain (no DB)

**Acceptance:** `eventHash` is deterministic and key-order-independent; a per-event chain re-walk detects any tamper; `merkleRoot` is deterministic.
**Rollback:** revert `hash.ts`; no DB or engine touched.
**Invariants exercised:** #3 (append-only tamper-evidence), canonicalization constraint.

### Task 2: Canonical JSON (`canonicalJSON`)

**Files:**
- Modify: `packages/history/src/hash.ts` (create)
- Test: `packages/history/src/hash.test.ts` (create)

**Interfaces:**
- Produces: `canonicalJSON(value: unknown): string` — deterministic, recursively key-sorted, language-independent serialization (JCS intent). Consumed by `eventHash`.

- [ ] **Step 1: Write the failing test**

`packages/history/src/hash.test.ts`:
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

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/history/src/hash.test.ts`
Expected: FAIL ("canonicalJSON is not a function" / module not found).

- [ ] **Step 3: Implement `canonicalJSON`**

`packages/history/src/hash.ts`:
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

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run packages/history/src/hash.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/history/src/hash.ts packages/history/src/hash.test.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): deterministic canonicalJSON (JCS-1)"
```

### Task 3: `sha256Hex` + `eventHash`

**Files:**
- Modify: `packages/history/src/hash.ts`
- Test: `packages/history/src/hash.test.ts`

**Interfaces:**
- Consumes: `canonicalJSON`.
- Produces: `sha256Hex(input: string): Hash` (returns `"0x" + 64 hex`); `eventHash(event: HistoryEvent): Hash` — `sha256Hex(canon(header) ‖ canon(payload))` where `payload` = event minus `header`.

- [ ] **Step 1: Write the failing test** (append to `hash.test.ts`)

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

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/history/src/hash.test.ts`
Expected: FAIL ("sha256Hex is not a function").

- [ ] **Step 3: Implement** (append to `hash.ts`)

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

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run packages/history/src/hash.test.ts`
Expected: PASS (8 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/history/src/hash.ts packages/history/src/hash.test.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): sha256Hex + eventHash over canonical header‖payload"
```

### Task 4: `merkleRoot`

**Files:**
- Modify: `packages/history/src/hash.ts`
- Test: `packages/history/src/hash.test.ts`

**Interfaces:**
- Produces: `merkleRoot(hashes: Hash[]): Hash` — binary merkle, duplicate-last on odd, `sha256Hex(left + right)` per node; empty → `sha256Hex("")`; single → that leaf.

- [ ] **Step 1: Write the failing test** (append)

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

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/history/src/hash.test.ts`
Expected: FAIL ("merkleRoot is not a function").

- [ ] **Step 3: Implement** (append to `hash.ts`)

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

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run packages/history/src/hash.test.ts`
Expected: PASS (11 tests total).

- [ ] **Step 5: Commit**

```bash
git add packages/history/src/hash.ts packages/history/src/hash.test.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): merkleRoot over event hashes"
```

### Task 5: `verifyChain` (pure re-walk + tamper detection)

**Files:**
- Modify: `packages/history/src/hash.ts`
- Test: `packages/history/src/hash.test.ts`

**Interfaces:**
- Produces: `verifyChain(events: { event: HistoryEvent; eventHash: Hash; parentHash: Hash }[]): { ok: boolean; brokenAt?: number; reason?: string }`. Verifies (a) each stored `eventHash` recomputes from the event, (b) `parentHash[i] === eventHash[i-1]` (first links to `GENESIS_PARENT`). Input is a single world's events in `seq` order.

- [ ] **Step 1: Write the failing test** (append)

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

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/history/src/hash.test.ts`
Expected: FAIL ("verifyChain is not a function").

- [ ] **Step 3: Implement** (append to `hash.ts`)

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

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run packages/history/src/hash.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/history/src/hash.ts packages/history/src/hash.test.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): verifyChain re-walk with tamper + parent-link detection"
```

---

## Track C — Event builder (no DB)

**Acceptance:** `buildCognitiveTransition` assembles a real `CognitiveTransition` from a `TickResult` + persisted weights, with `candidates`/`beliefDelta` strictly `null` and a real `worldDelta.eventsCreated`.
**Rollback:** revert `build.ts` and the engine return-field additions.
**Invariants exercised:** #1 (nulls never fabricated), #4 (header carries schemaVersion).

### Task 6: `buildCognitiveTransition` (pure)

**Files:**
- Create: `packages/history/src/build.ts`
- Test: `packages/history/src/build.test.ts`

**Interfaces:**
- Consumes: `@civ/engine` `TickResult` (after Task 7 gains `observation`+`availableActions`; this task uses a hand-built fixture so it does not depend on Task 7 landing first), `@civ/shared` `SocialDriver`/`ExecutionMeta`.
- Produces:
```ts
interface BuildArgs {
  result: { decision: Decision; event: WorldEvent;
            observation: { query: string; worldHeadline?: string };
            availableActions: string[] };
  worldId: string;
  engineVersion: string;
  timestamp: string;
  parentHash: Hash;                 // overwritten by append() from the live tip; pass GENESIS_PARENT here
  newEventId: () => string;
  retrievedMemories: WeightedMemory[];
  retrievedBeliefs: WeightedBelief[];
}
function buildCognitiveTransition(args: BuildArgs): CognitiveTransition
```

- [ ] **Step 1: Write the failing test**

`packages/history/src/build.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { buildCognitiveTransition } from "./build";
import { GENESIS_PARENT, SCHEMA_VERSION } from "./index";
import type { Decision, WorldEvent } from "@civ/shared";

const decision: Decision = {
  id: "d1", citizenId: "c1", goalId: null, day: 3, reasoning: "save up",
  action: "work", targetId: null, brainProvider: "0g-compute", brainModel: "llama-3.3-70b",
  meta: { provider: "0xprov", model: "llama-3.3-70b", verified: true,
    socialDrivers: [{ id: "c2", name: "Bo", relationshipStrength: 0.6, relevance: 0.5,
      blendedScore: 0.55, trust: 0.7, influence: 0.4, neighborText: "Bo invested" }],
    socialQuery: "save up" },
};
const event: WorldEvent = { id: "e1", day: 3, type: "work", actorId: "c1",
  targetId: null, decisionId: "d1", payload: {} };

function build() {
  return buildCognitiveTransition({
    result: { decision, event, observation: { query: "save up Boomtown", worldHeadline: "Boomtown" },
      availableActions: ["work", "rest", "invest"] },
    worldId: "w1", engineVersion: "engine@test", timestamp: "2026-06-27T00:00:00.000Z",
    parentHash: GENESIS_PARENT, newEventId: () => "evt-1",
    retrievedMemories: [{ id: "m1", weight: 0.9, summary: "got paid" }],
    retrievedBeliefs: [{ id: "b1", weight: 0.8, statement: "work pays" }],
  });
}

describe("buildCognitiveTransition", () => {
  it("populates real cognitive fields", () => {
    const ct = build();
    expect(ct.actor).toBe("c1");
    expect(ct.selectedAction).toBe("work");
    expect(ct.reasoning).toBe("save up");
    expect(ct.observation.query).toBe("save up Boomtown");
    expect(ct.availableActions).toEqual(["work", "rest", "invest"]);
    expect(ct.retrievedMemories[0]).toEqual({ id: "m1", weight: 0.9, summary: "got paid" });
    expect(ct.socialDrivers[0].name).toBe("Bo");
    expect(ct.execution.verified).toBe(true);
    expect(ct.execution.provider).toBe("0xprov");
  });

  it("records the created event in worldDelta, no fabricated wealth/relationship deltas", () => {
    const ct = build();
    expect(ct.worldDelta?.eventsCreated).toEqual([{ id: "e1", type: "work", targetId: null }]);
    expect(ct.worldDelta?.wealthTransferred).toEqual([]);
    expect(ct.worldDelta?.relationshipsChanged).toEqual([]);
  });

  it("NEVER fabricates candidates or beliefDelta (Invariant #1)", () => {
    const ct = build();
    expect(ct.candidates).toBeNull();
    expect(ct.beliefDelta).toBeNull();
  });

  it("stamps schemaVersion + header identity", () => {
    const ct = build();
    expect(ct.header.schemaVersion).toBe(SCHEMA_VERSION);
    expect(ct.header.worldId).toBe("w1");
    expect(ct.header.tickId).toBe(3);
    expect(ct.header.eventId).toBe("evt-1");
    expect(ct.header.parentHash).toBe(GENESIS_PARENT);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/history/src/build.test.ts`
Expected: FAIL ("buildCognitiveTransition is not a function").

- [ ] **Step 3: Implement**

`packages/history/src/build.ts`:
```ts
import type { Decision, WorldEvent } from "@civ/shared";
import {
  SCHEMA_VERSION, type CognitiveTransition, type Hash,
  type WeightedMemory, type WeightedBelief,
} from "./types";

export interface BuildArgs {
  result: {
    decision: Decision;
    event: WorldEvent;
    observation: { query: string; worldHeadline?: string };
    availableActions: string[];
  };
  worldId: string;
  engineVersion: string;
  timestamp: string;
  parentHash: Hash; // append() overwrites with the real tip; callers pass GENESIS_PARENT
  newEventId: () => string;
  retrievedMemories: WeightedMemory[];
  retrievedBeliefs: WeightedBelief[];
}

/**
 * Assemble a CognitiveTransition from authenticated runtime output only (Invariant #1).
 * candidates/beliefDelta stay null — they are NOT produced by the runtime in 1A and must
 * never be inferred. worldDelta records the created event; wealth/relationship mutations
 * happen outside the persist transaction (in the scheduler loop), so they are honestly [].
 */
export function buildCognitiveTransition(args: BuildArgs): CognitiveTransition {
  const { result } = args;
  const d = result.decision;
  const meta = d.meta;
  return {
    header: {
      eventId: args.newEventId(),
      parentHash: args.parentHash,
      worldId: args.worldId,
      tickId: d.day,
      engineVersion: args.engineVersion,
      schemaVersion: SCHEMA_VERSION,
      timestamp: args.timestamp,
    },
    actor: d.citizenId,
    observation: { query: result.observation.query, worldHeadline: result.observation.worldHeadline },
    retrievedMemories: args.retrievedMemories,
    retrievedBeliefs: args.retrievedBeliefs,
    socialDrivers: meta?.socialDrivers ?? [],
    availableActions: result.availableActions,
    selectedAction: d.action,
    reasoning: d.reasoning,
    worldDelta: {
      relationshipsChanged: [],
      wealthTransferred: [],
      eventsCreated: [{ id: result.event.id, type: result.event.type, targetId: result.event.targetId }],
    },
    execution: {
      provider: meta?.provider ?? d.brainProvider,
      modelId: meta?.model ?? d.brainModel,
      modelVersion: meta?.model ?? d.brainModel,
      promptHash: "",
      worldHash: "",
      verified: meta?.verified ?? false,
    },
    candidates: null,
    beliefDelta: null,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run packages/history/src/build.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/history/src/build.ts packages/history/src/build.test.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): buildCognitiveTransition — authenticated fields only, candidates/beliefDelta null"
```

### Task 7: Engine `TickResult` gains `observation` + `availableActions` (pure return values)

**Files:**
- Modify: `packages/engine/src/index.ts` (TickResult interface ~line 40; `runCitizenTick` return ~line 170)
- Test: `packages/engine/src/index.test.ts` (add a case) — or the engine's existing tick test file (run `ls packages/engine/src/*.test.ts` and append to the tick test).

**Interfaces:**
- Produces: `TickResult.observation: { query: string; worldHeadline: string }` and `TickResult.availableActions: string[]`. **Inline structural types — the engine imports NOTHING from `@civ/history`.** These are exactly the `query` and `forced ?? ALL_ACTIONS` already computed in the tick.

- [ ] **Step 1: Write the failing test** (add to the engine tick test; adapt the existing `runCitizenTick` harness in that file — reuse its fakes)

```ts
it("returns the observation query and the available action set as pure values", async () => {
  // (reuse this file's existing deps/store setup for a single-citizen tick)
  const result = await runCitizenTick(deps, "c1");
  expect(typeof result.observation.query).toBe("string");
  expect(result.observation.worldHeadline).toBe(store.getWorldState().headline);
  expect(Array.isArray(result.availableActions)).toBe(true);
  expect(result.availableActions.length).toBeGreaterThan(0);
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/engine/src/index.test.ts`
Expected: FAIL (`observation`/`availableActions` undefined on TickResult).

- [ ] **Step 3: Extend `TickResult` and the return** in `packages/engine/src/index.ts`

Add to the `TickResult` interface (after `consumedDilemma: boolean;`):
```ts
  observation: { query: string; worldHeadline: string };
  availableActions: string[];
```

In `runCitizenTick`, compute the available set next to the existing `forced` line (~line 86):
```ts
  const forced = store.getForcedActions(citizenId);
  const availableActions: string[] = forced ?? ALL_ACTIONS;
```
and pass `availableActions` into the existing `brain.decide({ ... availableActions: forced ?? ALL_ACTIONS ...})` call by replacing that expression with the new `availableActions` const (no behavior change — same value).

Change the final return (~line 170) to:
```ts
  return {
    decision, event, trace, storedMemory, consumedPins,
    consumedDilemma: forced != null,
    observation: { query, worldHeadline: worldState.headline },
    availableActions,
  };
```

- [ ] **Step 4: Run to verify it passes (and nothing else regressed)**

Run: `pnpm vitest run packages/engine`
Expected: PASS (new case + all existing engine tests). The change is additive-return-only — no existing assertion should change.

- [ ] **Step 5: Commit**

```bash
git add packages/engine/src/index.ts packages/engine/src/index.test.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(engine): TickResult returns observation + availableActions as pure values"
```

---

## Track D — Fold & projection (no DB)

**Acceptance:** `fold` over a transition sequence yields the latest-per-`(world,tick,actor)` `WorldState`; `project(...,"explain")` yields the `ExplainView` the CLI prints; `null` cognition projects to `"unavailable"`.
**Rollback:** revert `reduce.ts`, `project.ts`.
**Invariants exercised:** #1 (`null` → `"unavailable"`, never fabricated).

### Task 8: `fold(transitions) → WorldState`

**Files:**
- Create: `packages/history/src/reduce.ts`
- Test: `packages/history/src/reduce.test.ts`

**Interfaces:**
- Produces: `fold(transitions: CognitiveTransition[]): WorldState` and `worldStateKey(worldId, tickId, actor): string`. Pure reducer; later transitions overwrite earlier for the same key (last write wins by input order = seq order).

- [ ] **Step 1: Write the failing test**

`packages/history/src/reduce.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { fold, worldStateKey } from "./reduce";
import { GENESIS_PARENT, SCHEMA_VERSION, type CognitiveTransition } from "./index";

function ct(over: Partial<CognitiveTransition> & { tickId: number; actor: string; action: string }): CognitiveTransition {
  return {
    header: { eventId: `${over.actor}-${over.tickId}`, parentHash: GENESIS_PARENT, worldId: "w1",
      tickId: over.tickId, engineVersion: "t", schemaVersion: SCHEMA_VERSION, timestamp: "2026-06-27T00:00:00.000Z" },
    actor: over.actor, observation: { query: "q" }, retrievedMemories: [], retrievedBeliefs: [],
    socialDrivers: [], availableActions: ["work"], selectedAction: over.action, reasoning: "r",
    worldDelta: null, execution: { provider: "p", modelId: "m", modelVersion: "v", promptHash: "",
      worldHash: "", verified: true }, candidates: null, beliefDelta: null,
  };
}

describe("fold", () => {
  it("indexes latest transition per (world,tick,actor)", () => {
    const ws = fold([
      ct({ tickId: 1, actor: "c1", action: "work" }),
      ct({ tickId: 1, actor: "c2", action: "rest" }),
      ct({ tickId: 2, actor: "c1", action: "invest" }),
    ]);
    expect(ws.latest.get(worldStateKey("w1", 1, "c1"))?.selectedAction).toBe("work");
    expect(ws.latest.get(worldStateKey("w1", 2, "c1"))?.selectedAction).toBe("invest");
    expect(ws.latest.get(worldStateKey("w1", 1, "c2"))?.selectedAction).toBe("rest");
  });
  it("last write wins for a duplicate key", () => {
    const ws = fold([
      ct({ tickId: 1, actor: "c1", action: "work" }),
      ct({ tickId: 1, actor: "c1", action: "rest" }),
    ]);
    expect(ws.latest.get(worldStateKey("w1", 1, "c1"))?.selectedAction).toBe("rest");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/history/src/reduce.test.ts`
Expected: FAIL ("fold is not a function").

- [ ] **Step 3: Implement**

`packages/history/src/reduce.ts`:
```ts
import type { CognitiveTransition, WorldState } from "./types";

export function worldStateKey(worldId: string, tickId: number, actor: string): string {
  return `${worldId}:${tickId}:${actor}`;
}

/** Pure reducer: derive minimal 1A world state = latest authenticated transition per (world,tick,actor). */
export function fold(transitions: CognitiveTransition[]): WorldState {
  const latest = new Map<string, CognitiveTransition>();
  for (const t of transitions) {
    latest.set(worldStateKey(t.header.worldId, t.header.tickId, t.actor), t);
  }
  return { latest };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run packages/history/src/reduce.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/history/src/reduce.ts packages/history/src/reduce.test.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): fold(transitions) -> minimal WorldState reducer"
```

### Task 9: `project(input, mode) → ExplainView`

**Files:**
- Create: `packages/history/src/project.ts`
- Test: `packages/history/src/project.test.ts`

**Interfaces:**
- Produces:
```ts
interface ProjectInput {
  transition: CognitiveTransition;
  eventHash: Hash; parentHash: Hash; chainVerified: boolean;
  anchor: { merkleRoot: Hash; zgRootHash: string | null; zgTxHash: string | null } | null;
}
function project(input: ProjectInput, mode: "explain"): ExplainView
function project(input: ProjectInput, mode: "replay"): never // stub: throws "replay projection is Phase 2"
```
`candidates`/`beliefDelta` map `null → "unavailable"` (Invariant #1).

- [ ] **Step 1: Write the failing test**

`packages/history/src/project.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { project } from "./project";
import { GENESIS_PARENT, SCHEMA_VERSION, type CognitiveTransition } from "./index";

const transition: CognitiveTransition = {
  header: { eventId: "e1", parentHash: GENESIS_PARENT, worldId: "w1", tickId: 3, engineVersion: "t",
    schemaVersion: SCHEMA_VERSION, timestamp: "2026-06-27T00:00:00.000Z" },
  actor: "c1", observation: { query: "save up" }, retrievedMemories: [], retrievedBeliefs: [],
  socialDrivers: [], availableActions: ["work", "rest"], selectedAction: "work", reasoning: "r",
  worldDelta: null, execution: { provider: "p", modelId: "m", modelVersion: "v", promptHash: "",
    worldHash: "", verified: true }, candidates: null, beliefDelta: null,
};
const input = { transition, eventHash: "0xaa", parentHash: GENESIS_PARENT, chainVerified: true,
  anchor: { merkleRoot: "0xbb", zgRootHash: "0xcc", zgTxHash: "0xdd" } };

describe("project explain", () => {
  it("renders authenticated fields + chain/anchor metadata", () => {
    const v = project(input, "explain");
    expect(v.citizen).toBe("c1");
    expect(v.tick).toBe(3);
    expect(v.selectedAction).toBe("work");
    expect(v.chainVerified).toBe(true);
    expect(v.eventHash).toBe("0xaa");
    expect(v.anchor?.zgTxHash).toBe("0xdd");
  });
  it("maps null cognition to 'unavailable' (Invariant #1)", () => {
    const v = project(input, "explain");
    expect(v.candidates).toBe("unavailable");
    expect(v.beliefDelta).toBe("unavailable");
  });
  it("replay projection is not implemented in 1A", () => {
    expect(() => project(input, "replay" as "explain")).toThrow(/Phase 2/);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run packages/history/src/project.test.ts`
Expected: FAIL ("project is not a function").

- [ ] **Step 3: Implement**

`packages/history/src/project.ts`:
```ts
import type { CognitiveTransition, ExplainView, Hash } from "./types";

export interface ProjectInput {
  transition: CognitiveTransition;
  eventHash: Hash;
  parentHash: Hash;
  chainVerified: boolean;
  anchor: { merkleRoot: Hash; zgRootHash: string | null; zgTxHash: string | null } | null;
}

export function project(input: ProjectInput, mode: "explain"): ExplainView {
  if (mode !== "explain") throw new Error("replay projection is Phase 2 (world reconstruction over the same fold)");
  const t = input.transition;
  return {
    world: t.header.worldId,
    citizen: t.actor,
    tick: t.header.tickId,
    observation: t.observation,
    retrievedMemories: t.retrievedMemories,
    retrievedBeliefs: t.retrievedBeliefs,
    socialDrivers: t.socialDrivers,
    availableActions: t.availableActions,
    selectedAction: t.selectedAction,
    reasoning: t.reasoning,
    worldDelta: t.worldDelta,
    execution: t.execution,
    candidates: t.candidates ?? "unavailable",   // Invariant #1: null -> unavailable, never fabricated
    beliefDelta: t.beliefDelta ?? "unavailable",
    eventHash: input.eventHash,
    parentHash: input.parentHash,
    chainVerified: input.chainVerified,
    anchor: input.anchor,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run packages/history/src/project.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/history/src/project.ts packages/history/src/project.test.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): project(...,'explain') -> ExplainView; null cognition -> 'unavailable'; replay stub"
```

---

## Track E — Schema & transactional append (DB integration)

**Acceptance:** migrating the schema creates `history_events` + `history_anchors` (RLS-enabled); `append` links `parentHash` from the world's live tip and writes a row; a world's DB-loaded chain passes `verifyChain`; wiring into `persistTick` writes the transition in the SAME transaction (Invariant #2 — both commit or both roll back).
**Rollback:** remove the two tables from `schema.sql`, remove the `history.append` call from `persistTick`, revert `append.ts`/`read.ts`. Legacy rows are untouched throughout.
**Invariants exercised:** #2 (transactional ⇔), #3 (append-only chain in DB).

### Task 10: Schema — `history_events` + `history_anchors` + RLS

**Files:**
- Modify: `packages/persistence/src/schema.sql` (append at end, after the existing RLS `ALTER TABLE … ENABLE ROW LEVEL SECURITY` block ~line 162)
- Test: `packages/persistence/src/history-schema.itest.ts` (create)

**Interfaces:**
- Produces: tables `history_events(seq BIGSERIAL PK, event_id UNIQUE, world_id, tick_id, parent_hash, event_hash, kind, payload JSONB, created_at)` + indexes, and `history_anchors(id PK, world_id, tick_id, merkle_root, zg_root_hash, zg_tx_hash, created_at)`, both RLS-enabled (deny-all; owner/superuser bypass, matching existing posture).

- [ ] **Step 1: Write the failing integration test**

`packages/persistence/src/history-schema.itest.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { migrate } from "./migrate";
import { getPool, closePool } from "./pool";

describe("history schema", () => {
  beforeAll(async () => { await migrate(); });
  afterAll(async () => { await closePool(); });

  it("creates history_events and history_anchors", async () => {
    const r = await getPool().query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_name IN ('history_events','history_anchors') ORDER BY table_name`);
    expect(r.rows.map((x) => x.table_name)).toEqual(["history_anchors", "history_events"]);
  });

  it("enables RLS on both tables", async () => {
    const r = await getPool().query(
      `SELECT relname FROM pg_class
        WHERE relname IN ('history_events','history_anchors') AND relrowsecurity = true
        ORDER BY relname`);
    expect(r.rows.map((x) => x.relname)).toEqual(["history_anchors", "history_events"]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:it packages/persistence/src/history-schema.itest.ts`
Expected: FAIL (tables don't exist).

- [ ] **Step 3: Append to `schema.sql`**

At the end of `packages/persistence/src/schema.sql`:
```sql
-- ── @civ/history (Phase 1A) — append-only shadow log (additive; rows stay truth) ──
CREATE TABLE IF NOT EXISTS history_events (
  seq         BIGSERIAL PRIMARY KEY,
  event_id    TEXT NOT NULL UNIQUE,
  world_id    TEXT NOT NULL,
  tick_id     INT  NOT NULL,
  parent_hash TEXT NOT NULL,
  event_hash  TEXT NOT NULL,
  kind        TEXT NOT NULL,
  payload     JSONB NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS history_world_tick_idx ON history_events (world_id, tick_id);
CREATE INDEX IF NOT EXISTS history_world_seq_idx  ON history_events (world_id, seq);

CREATE TABLE IF NOT EXISTS history_anchors (
  id           TEXT PRIMARY KEY,
  world_id     TEXT NOT NULL,
  tick_id      INT  NOT NULL,
  merkle_root  TEXT NOT NULL,
  zg_root_hash TEXT,
  zg_tx_hash   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE history_events  ENABLE ROW LEVEL SECURITY;
ALTER TABLE history_anchors ENABLE ROW LEVEL SECURITY;
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:it packages/persistence/src/history-schema.itest.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/persistence/src/schema.sql packages/persistence/src/history-schema.itest.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): history_events + history_anchors tables with RLS"
```

### Task 11: `append(tx, event)` — links parentHash from tip, writes row

**Files:**
- Create: `packages/history/src/append.ts`
- Create: `packages/history/src/read.ts` (the `loadWorldEvents` reader used to verify the DB chain)
- Test: `packages/history/src/append.itest.ts`

**Interfaces:**
- Consumes: a pg-compatible `Executor` (`{ query(text, params?): Promise<{ rows: any[] }> }`) — satisfied by both `Pool` and an in-transaction `PoolClient`.
- Produces:
  - `append(tx: Executor, event: HistoryEvent): Promise<{ seq: number; eventId: EventId; eventHash: Hash; parentHash: Hash }>` — reads the world's tip (`ORDER BY seq DESC LIMIT 1`), sets `event.header.parentHash` to it (or `GENESIS_PARENT`), recomputes `eventHash`, inserts the row. **Mutates `event.header.parentHash` in place** so the caller's object matches what was hashed.
  - `loadWorldEvents(tx: Executor, worldId: string): Promise<{ event: HistoryEvent; eventHash: Hash; parentHash: Hash }[]>` — rows for a world in `seq` order, payload rehydrated into `{ ...payload, header }`.

- [ ] **Step 1: Write the failing integration test**

`packages/history/src/append.itest.ts`:
```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool } from "@civ/persistence";
import { append, loadWorldEvents } from "./append";
import { verifyChain } from "./hash";
import { GENESIS_PARENT, SCHEMA_VERSION, type CognitiveTransition } from "./index";

function ct(worldId: string, tick: number, actor: string): CognitiveTransition {
  return {
    header: { eventId: `${actor}-${tick}-${Math.random()}`, parentHash: GENESIS_PARENT, worldId,
      tickId: tick, engineVersion: "t", schemaVersion: SCHEMA_VERSION, timestamp: new Date().toISOString() },
    actor, observation: { query: "q" }, retrievedMemories: [], retrievedBeliefs: [], socialDrivers: [],
    availableActions: ["work"], selectedAction: "work", reasoning: "r", worldDelta: null,
    execution: { provider: "p", modelId: "m", modelVersion: "v", promptHash: "", worldHash: "", verified: true },
    candidates: null, beliefDelta: null,
  };
}

describe("append", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => { await getPool().query("DELETE FROM history_events WHERE world_id = 'wa'"); });
  afterAll(async () => { await closePool(); });

  it("links the chain across appends and verifies from the DB", async () => {
    const a = await append(getPool(), ct("wa", 1, "c1"));
    const b = await append(getPool(), ct("wa", 2, "c1"));
    expect(a.parentHash).toBe(GENESIS_PARENT);
    expect(b.parentHash).toBe(a.eventHash);

    const rows = await loadWorldEvents(getPool(), "wa");
    expect(rows).toHaveLength(2);
    expect(verifyChain(rows).ok).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:it packages/history/src/append.itest.ts`
Expected: FAIL ("append is not a function" / module not found).

- [ ] **Step 3: Implement `append.ts`**

`packages/history/src/append.ts`:
```ts
import { eventHash } from "./hash";
import { GENESIS_PARENT, eventKind, type EventId, type Hash, type HistoryEvent } from "./types";

export interface Executor {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

/** Append one event to a world's chain. Reads the tip, links parentHash, hashes, inserts.
 *  MUST be called inside the caller's transaction (Invariant #2) when paired with a mutation. */
export async function append(
  tx: Executor,
  event: HistoryEvent,
): Promise<{ seq: number; eventId: EventId; eventHash: Hash; parentHash: Hash }> {
  const tip = await tx.query(
    `SELECT event_hash FROM history_events WHERE world_id = $1 ORDER BY seq DESC LIMIT 1`,
    [event.header.worldId],
  );
  const parentHash: Hash = tip.rows[0]?.event_hash ?? GENESIS_PARENT;
  event.header.parentHash = parentHash; // hash over the linked header
  const hash = eventHash(event);
  const { header, ...payload } = event;
  const ins = await tx.query(
    `INSERT INTO history_events (event_id, world_id, tick_id, parent_hash, event_hash, kind, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING seq`,
    [header.eventId, header.worldId, header.tickId, parentHash, hash, eventKind(event),
     JSON.stringify({ header, ...payload })],
  );
  return { seq: Number(ins.rows[0].seq), eventId: header.eventId, eventHash: hash, parentHash };
}

export async function loadWorldEvents(
  tx: Executor,
  worldId: string,
): Promise<{ event: HistoryEvent; eventHash: Hash; parentHash: Hash }[]> {
  const r = await tx.query(
    `SELECT event_hash, parent_hash, payload FROM history_events WHERE world_id = $1 ORDER BY seq ASC`,
    [worldId],
  );
  return r.rows.map((row) => ({
    event: row.payload as HistoryEvent, // payload already includes header
    eventHash: row.event_hash,
    parentHash: row.parent_hash,
  }));
}
```

Note: the row's `payload` JSONB stores the WHOLE event (`{ header, ...rest }`) so `loadWorldEvents` rehydrates a complete `HistoryEvent` whose recomputed `eventHash` matches. (The separate `kind`/`event_hash`/`parent_hash` columns are query/index conveniences.)

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:it packages/history/src/append.itest.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add packages/history/src/append.ts packages/history/src/append.itest.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): transactional append() linking per-world hash chain + loadWorldEvents"
```

### Task 12: Wire `history.append` into `persistTick` (Invariant #2)

**Files:**
- Modify: `packages/persistence/src/repository.ts` (`persistTick`, after the `traces` insert, before `COMMIT`)
- Modify: `packages/persistence/package.json` (add `"@civ/history": "workspace:*"` to dependencies)
- Test: `packages/persistence/src/history-append.itest.ts` (create)

**Interfaces:**
- Consumes: `buildCognitiveTransition` (Task 6), `append` (Task 11), the in-transaction `client`, `store.getDecisionMemories(id)` / `store.getDecisionBeliefs(id)` (weights), `result.observation` / `result.availableActions` (Task 7).
- Produces: a committed `history_events` row per committed tick. **The append must throw on failure so the existing `catch { ROLLBACK }` rolls back BOTH the decision and the transition** (no orphans either direction).

Resolve the world id inside `persistTick`: query the citizen's `world_id` on the same `client` (the repo already joins worlds in `loadContext`). If `world_id` is null, use `"default"`.

- [ ] **Step 1: Write the failing integration test**

`packages/persistence/src/history-append.itest.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { migrate, getPool, closePool } from "./pool"; // re-exported via index; adjust to ./migrate/./pool as needed
import { Repository } from "./repository";
// Reuse this package's existing itest seeding helpers (see repository.itest.ts) to build a
// store + TickResult for one citizen in a known world.

describe("persistTick writes history in the same transaction (Invariant #2)", () => {
  beforeAll(async () => { await migrate(); });
  afterAll(async () => { await closePool(); });

  it("on success: a decision row AND a history_events row both exist", async () => {
    // ... seed world 'w1' + citizen 'c1' (copy the seed block from repository.itest.ts) ...
    // const repo = new Repository(getPool());
    // const { store, result } = await makeTick("c1"); // existing helper / inline build
    // await repo.persistTick(store, result, "c1");
    const d = await getPool().query("SELECT id FROM decisions WHERE citizen_id = 'c1'");
    const h = await getPool().query("SELECT event_id FROM history_events WHERE world_id = 'w1'");
    expect(d.rows.length).toBeGreaterThan(0);
    expect(h.rows.length).toBe(d.rows.length); // Invariant #2: one transition per decision
  });

  it("on history append failure: the whole tick rolls back (no orphan decision)", async () => {
    // Force append to throw by inserting a duplicate event_id first (UNIQUE violation),
    // OR temporarily wrap repo with a history stub that throws; assert NO new decision row landed.
  });
});
```

(The second case is a real integration assertion — implement it by pre-inserting a `history_events` row whose `event_id` collides with the one the tick will generate, or by injecting a throwing append seam; either way assert the `decisions` count is unchanged after the failed `persistTick` rejects.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:it packages/persistence/src/history-append.itest.ts`
Expected: FAIL (no `history_events` row written by `persistTick` yet).

- [ ] **Step 3: Add the dependency + wire the append**

In `packages/persistence/package.json` dependencies add:
```json
    "@civ/history": "workspace:*",
```
Run `pnpm install` to link.

In `packages/persistence/src/repository.ts`, add imports at top (deep `src/` imports, matching how `append`/`verify`/`anchor` are imported elsewhere — the barrel `index.ts` only re-exports `./types`, so `buildCognitiveTransition` must come from `./src/build`, NOT from `@civ/history`):
```ts
import { buildCognitiveTransition } from "@civ/history/src/build";
import { append } from "@civ/history/src/append";
import { GENESIS_PARENT } from "@civ/history/src/types";
```

Inside `persistTick`, after the `traces` insert and before `await client.query("COMMIT")`, add:
```ts
    // ── @civ/history shadow append (Invariant #2: same transaction as the decision) ──
    const wr = await client.query(`SELECT world_id FROM citizens WHERE id = $1`, [citizenId]);
    const worldId: string = wr.rows[0]?.world_id ?? "default";
    const retrievedMemories = store.getDecisionMemories(d.id).map((dm) => ({ id: dm.memoryId, weight: dm.weight }));
    const retrievedBeliefs = store.getDecisionBeliefs(d.id).map((db) => ({ id: db.beliefId, weight: db.weight }));
    const transition = buildCognitiveTransition({
      result: { decision: d, event: e, observation: result.observation, availableActions: result.availableActions },
      worldId,
      engineVersion: process.env.ENGINE_VERSION ?? "civ0@dev",
      timestamp: new Date().toISOString(),
      parentHash: GENESIS_PARENT, // append() overwrites with the live tip
      newEventId: () => `ct-${d.id}`,
      retrievedMemories,
      retrievedBeliefs,
    });
    await append(client, transition);
```
(`d`, `e`, `result` are already in scope in `persistTick`; `result.observation`/`result.availableActions` exist after Task 7.)

- [ ] **Step 4: Run to verify it passes (and nothing regressed)**

Run: `pnpm test:it packages/persistence`
Expected: PASS — new history-append cases AND all existing persistence itests (the existing `repository.itest.ts` tick now also writes a history row; confirm none of its assertions break, since they only check legacy rows).

- [ ] **Step 5: Commit**

```bash
git add packages/persistence/src/repository.ts packages/persistence/package.json packages/persistence/src/history-append.itest.ts pnpm-lock.yaml
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(persistence): append CognitiveTransition in persistTick transaction (Invariant #2)"
```

---

## Track F — Verification proofs (DB)

**Acceptance:** `verifyWorldChain` re-walks a world's DB chain and passes for an untampered world; `faithfulnessProof` returns ok when the folded shadow matches legacy decisions and a divergence (warn-only) when it doesn't.
**Rollback:** revert `verify.ts`; the warn-only call site logs nothing on revert.
**Invariants exercised:** #3 (chain integrity), faithfulness (shadow == legacy), Invariant #1 (proof never fabricates).

### Task 13: `verifyWorldChain` + `faithfulnessProof` (warn-only)

**Files:**
- Create: `packages/history/src/verify.ts`
- Modify: `packages/history/src/read.ts` (add `loadLegacyActions(tx, worldId)` reader)
- Test: `packages/history/src/verify.itest.ts`

**Interfaces:**
- Produces:
  - `verifyWorldChain(tx: Executor, worldId: string): Promise<{ ok: boolean; brokenAt?: number; reason?: string }>` — `verifyChain(await loadWorldEvents(...))` filtered to `CognitiveTransition` kind.
  - `faithfulnessProof(tx: Executor, worldId: string): Promise<{ ok: boolean; divergences: { key: string; folded?: string; legacy?: string }[] }>` — compares `fold(transitions).latest` selectedAction per `(world,tick,actor)` against legacy `decisions(action)` for the same world. **Warn-only**: returns divergences; callers log, never throw.
  - `loadLegacyActions(tx, worldId): Promise<{ tick: number; actor: string; action: string }[]>` — from `decisions` joined to `citizens.world_id`.

- [ ] **Step 1: Write the failing integration test**

`packages/history/src/verify.itest.ts`:
```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool } from "@civ/persistence";
import { append } from "./append";
import { verifyWorldChain, faithfulnessProof } from "./verify";
import { GENESIS_PARENT, SCHEMA_VERSION, type CognitiveTransition } from "./index";

// seed a world+citizen+decision so legacy has a comparable row (reuse persistence itest seeds),
// then append a matching transition. Helper ctFor(tick,actor,action) like prior tasks.

describe("verification proofs", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => { await getPool().query("DELETE FROM history_events WHERE world_id = 'wv'"); });
  afterAll(async () => { await closePool(); });

  it("verifyWorldChain passes for an untampered DB chain", async () => {
    await append(getPool(), ctFor("wv", 1, "c1", "work"));
    await append(getPool(), ctFor("wv", 2, "c1", "rest"));
    expect((await verifyWorldChain(getPool(), "wv")).ok).toBe(true);
  });

  it("verifyWorldChain fails after a tamper", async () => {
    const { eventId } = await append(getPool(), ctFor("wv", 1, "c1", "work"));
    await getPool().query(
      `UPDATE history_events SET payload = jsonb_set(payload, '{reasoning}', '"TAMPERED"') WHERE event_id = $1`,
      [eventId]);
    expect((await verifyWorldChain(getPool(), "wv")).ok).toBe(false);
  });

  it("faithfulnessProof returns ok when shadow matches legacy decisions", async () => {
    // seed legacy decision (c1, tick 1, action 'work') for world wv, append matching transition
    const r = await faithfulnessProof(getPool(), "wv");
    expect(r.ok).toBe(true);
    expect(r.divergences).toEqual([]);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:it packages/history/src/verify.itest.ts`
Expected: FAIL ("verifyWorldChain is not a function").

- [ ] **Step 3: Implement `verify.ts` (+ reader)**

`packages/history/src/read.ts` (create; add `loadLegacyActions`):
```ts
import type { Executor } from "./append";

export async function loadLegacyActions(
  tx: Executor,
  worldId: string,
): Promise<{ tick: number; actor: string; action: string }[]> {
  const r = await tx.query(
    `SELECT d.day AS tick, d.citizen_id AS actor, d.action AS action
       FROM decisions d JOIN citizens c ON c.id = d.citizen_id
      WHERE COALESCE(c.world_id, 'default') = $1`,
    [worldId],
  );
  return r.rows.map((x) => ({ tick: x.tick, actor: x.actor, action: x.action }));
}
```

`packages/history/src/verify.ts`:
```ts
import { type Executor, loadWorldEvents } from "./append";
import { loadLegacyActions } from "./read";
import { verifyChain } from "./hash";
import { fold, worldStateKey } from "./reduce";
import { eventKind, type CognitiveTransition } from "./types";

export async function verifyWorldChain(
  tx: Executor,
  worldId: string,
): Promise<{ ok: boolean; brokenAt?: number; reason?: string }> {
  const rows = await loadWorldEvents(tx, worldId);
  const transitions = rows.filter((r) => eventKind(r.event) === "CognitiveTransition");
  return verifyChain(transitions);
}

/**
 * Historical Faithfulness Proof: assert fold(history) reflects legacy reality.
 * WARN-ONLY in 1A — returns divergences; callers log, never throw. Fail-hard in 1B.
 */
export async function faithfulnessProof(
  tx: Executor,
  worldId: string,
): Promise<{ ok: boolean; divergences: { key: string; folded?: string; legacy?: string }[] }> {
  const rows = await loadWorldEvents(tx, worldId);
  const transitions = rows
    .map((r) => r.event)
    .filter((e) => eventKind(e) === "CognitiveTransition") as CognitiveTransition[];
  const ws = fold(transitions);
  const legacy = await loadLegacyActions(tx, worldId);

  const divergences: { key: string; folded?: string; legacy?: string }[] = [];
  for (const l of legacy) {
    const key = worldStateKey(worldId, l.tick, l.actor);
    const folded = ws.latest.get(key)?.selectedAction;
    if (folded !== l.action) divergences.push({ key, folded, legacy: l.action });
  }
  return { ok: divergences.length === 0, divergences };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:it packages/history/src/verify.itest.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Wire the warn-only Faithfulness Proof into the persist path**

In `packages/persistence/src/repository.ts` `persistTick`, AFTER `COMMIT` succeeds (post-transaction, never blocking the tick), add a best-effort check:
```ts
    await client.query("COMMIT");
    // Faithfulness Proof — WARN-ONLY in 1A (logs divergence, never fails the tick).
    try {
      const { faithfulnessProof } = await import("@civ/history/src/verify");
      const proof = await faithfulnessProof(this.pool, worldId);
      if (!proof.ok) console.warn(`[history] faithfulness divergence world=${worldId}`, proof.divergences);
    } catch (err) { console.warn("[history] faithfulness proof skipped:", err); }
```
(`worldId` is in scope from Task 12. Use `this.pool` — the post-commit read must NOT reuse the released `client`.)

Run: `pnpm test:it packages/persistence` → Expected: PASS (unchanged legacy assertions; no divergence warnings for a normal tick).

- [ ] **Step 6: Commit**

```bash
git add packages/history/src/verify.ts packages/history/src/read.ts packages/history/src/verify.itest.ts packages/persistence/src/repository.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): verifyWorldChain + warn-only Historical Faithfulness Proof"
```

---

## Track G — `civ explain` CLI (the acceptance surface)

**Acceptance:** after a seeded tick, `tsx packages/history/scripts/explain.ts --citizen <id> --tick <day>` prints the authenticated, chain-verified trace; `null` cognition prints `unavailable`. This is the **only definition of done** for Phase 1A.
**Rollback:** delete `scripts/explain.ts` + `loadTransition`.
**Invariants exercised:** all four (the CLI is the end-to-end proof).

### Task 14: `loadTransition` reader + `civ explain` CLI

**Files:**
- Modify: `packages/history/src/read.ts` (add `loadTransition`)
- Create: `packages/history/src/explainView.ts` (assemble `ExplainView` from DB: load + verify chain + load anchor + project)
- Create: `packages/history/scripts/explain.ts`
- Test: `packages/history/src/explainView.itest.ts`

**Interfaces:**
- Consumes: `loadWorldEvents`, `verifyChain`, `project`, `loadAnchor` (inline query on `history_anchors`).
- Produces:
  - `loadTransition(tx, worldId, citizenId, tickId): Promise<{ transition: CognitiveTransition; eventHash; parentHash } | null>`.
  - `buildExplainView(tx, worldId, citizenId, tickId): Promise<ExplainView | null>` — loads the transition, sets `chainVerified` from `verifyWorldChain`, attaches the tick's anchor (or `null`), returns `project(input, "explain")`.

- [ ] **Step 1: Write the failing integration test**

`packages/history/src/explainView.itest.ts`:
```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool } from "@civ/persistence";
import { append } from "./append";
import { buildExplainView } from "./explainView";
import { ctFor } from "./testhelpers"; // small shared fixture builder (or inline as in prior tasks)

describe("buildExplainView", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => { await getPool().query("DELETE FROM history_events WHERE world_id = 'we'"); });
  afterAll(async () => { await closePool(); });

  it("reconstructs an authenticated, chain-verified trace; null cognition is 'unavailable'", async () => {
    await append(getPool(), ctFor("we", 5, "c1", "work"));
    const view = await buildExplainView(getPool(), "we", "c1", 5);
    expect(view).not.toBeNull();
    expect(view!.selectedAction).toBe("work");
    expect(view!.chainVerified).toBe(true);
    expect(view!.candidates).toBe("unavailable");
    expect(view!.beliefDelta).toBe("unavailable");
    expect(view!.anchor).toBeNull(); // no anchor yet (Track H)
  });

  it("returns null for a missing (citizen,tick)", async () => {
    expect(await buildExplainView(getPool(), "we", "ghost", 99)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:it packages/history/src/explainView.itest.ts`
Expected: FAIL ("buildExplainView is not a function").

- [ ] **Step 3: Implement reader + view assembler**

Add to `packages/history/src/read.ts`:
```ts
import { eventKind, type CognitiveTransition, type Hash } from "./types";
import { loadWorldEvents } from "./append";

export async function loadTransition(
  tx: import("./append").Executor,
  worldId: string,
  citizenId: string,
  tickId: number,
): Promise<{ transition: CognitiveTransition; eventHash: Hash; parentHash: Hash } | null> {
  const rows = await loadWorldEvents(tx, worldId);
  for (let i = rows.length - 1; i >= 0; i--) { // latest wins
    const r = rows[i]!;
    if (eventKind(r.event) !== "CognitiveTransition") continue;
    const ct = r.event as CognitiveTransition;
    if (ct.actor === citizenId && ct.header.tickId === tickId)
      return { transition: ct, eventHash: r.eventHash, parentHash: r.parentHash };
  }
  return null;
}

export async function loadAnchor(
  tx: import("./append").Executor,
  worldId: string,
  tickId: number,
): Promise<{ merkleRoot: Hash; zgRootHash: string | null; zgTxHash: string | null } | null> {
  const r = await tx.query(
    `SELECT merkle_root, zg_root_hash, zg_tx_hash FROM history_anchors
      WHERE world_id = $1 AND tick_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [worldId, tickId],
  );
  if (!r.rows[0]) return null;
  return { merkleRoot: r.rows[0].merkle_root, zgRootHash: r.rows[0].zg_root_hash, zgTxHash: r.rows[0].zg_tx_hash };
}
```

`packages/history/src/explainView.ts`:
```ts
import type { Executor } from "./append";
import { loadTransition, loadAnchor } from "./read";
import { verifyWorldChain } from "./verify";
import { project } from "./project";
import type { ExplainView } from "./types";

export async function buildExplainView(
  tx: Executor,
  worldId: string,
  citizenId: string,
  tickId: number,
): Promise<ExplainView | null> {
  const found = await loadTransition(tx, worldId, citizenId, tickId);
  if (!found) return null;
  const chain = await verifyWorldChain(tx, worldId);
  const anchor = await loadAnchor(tx, worldId, tickId);
  return project(
    { transition: found.transition, eventHash: found.eventHash, parentHash: found.parentHash,
      chainVerified: chain.ok, anchor },
    "explain",
  );
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:it packages/history/src/explainView.itest.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Write the CLI**

`packages/history/scripts/explain.ts`:
```ts
import { getPool, closePool } from "@civ/persistence";
import { buildExplainView } from "../src/explainView";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const citizen = arg("citizen");
  const tick = arg("tick");
  const world = arg("world") ?? "default";
  if (!citizen || !tick) {
    console.error("usage: tsx scripts/explain.ts --citizen <id> --tick <day> [--world <id>]");
    process.exit(2);
  }
  const view = await buildExplainView(getPool(), world, citizen, Number(tick));
  if (!view) {
    console.error(`no authenticated transition for citizen=${citizen} tick=${tick} world=${world}`);
    process.exit(1);
  }
  const line = (l: string) => console.log(l);
  line(`\n══ civ explain — citizen ${view.citizen} · tick ${view.tick} · world ${view.world} ══`);
  line(`chain verified : ${view.chainVerified ? "✓" : "✗ BROKEN"}   event ${view.eventHash.slice(0, 12)}…`);
  line(`anchor         : ${view.anchor ? `0G ${view.anchor.zgTxHash ?? "(pending)"}` : "unanchored"}`);
  line(`\n① observe      : ${view.observation.query}`);
  line(`② retrieve     : ${view.retrievedMemories.length} memories, ${view.retrievedBeliefs.length} beliefs`);
  line(`③ social       : ${view.socialDrivers.map((s) => `${s.name}(${s.blendedScore.toFixed(2)})`).join(", ") || "none"}`);
  line(`④ candidates   : ${view.candidates === "unavailable" ? "unavailable" : view.candidates.map((c) => c.action).join(", ")}`);
  line(`⑤ choose       : ${view.selectedAction}   (from: ${view.availableActions.join(", ")})`);
  line(`⑥ reasoning    : ${view.reasoning}`);
  line(`⑦ beliefΔ      : ${view.beliefDelta === "unavailable" ? "unavailable" : JSON.stringify(view.beliefDelta)}`);
  line(`⑧ outcome      : ${view.worldDelta ? `${view.worldDelta.eventsCreated.length} event(s)` : "none"}`);
  line(`⑨ execution    : ${view.execution.provider}/${view.execution.modelId}  verified=${view.execution.verified}`);
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 6: Verify the CLI end-to-end against a seeded tick**

Run (against `civ0_test` — seed one real tick first via the existing persistence itest seeding, or run a one-off seeding script, then):
```bash
DATABASE_URL=$CIV0_TEST_DATABASE_URL tsx packages/history/scripts/explain.ts --citizen c1 --tick 5 --world we
```
Expected: prints the 9-step trace with `chain verified : ✓`, `candidates : unavailable`, `beliefΔ : unavailable`. (If you seeded via Track F's helper world `we`, use those ids.)

- [ ] **Step 7: Commit**

```bash
git add packages/history/src/read.ts packages/history/src/explainView.ts packages/history/scripts/explain.ts packages/history/src/explainView.itest.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): civ explain CLI — reconstruct + verify authenticated trace from the log"
```

> **Phase 1A acceptance test is now satisfiable.** Everything below (Track H anchoring, Track I web view) is additive and must not regress the CLI or the live tick.

---

## Track H — 0G anchor (AFTER correctness; optimization layer, NOT correctness)

**Acceptance:** `anchorTick` builds the tick's merkle root over its `CognitiveTransition` hashes, archives a `civ.history/v0` record via 0G Storage (fake uploader in unit test), and writes an `AnchorEvent` + `history_anchors` row; a missed anchor leaves the chain intact and re-anchorable.
**Rollback:** revert `anchor.ts` + the post-commit anchor call; the chain and CLI are unaffected (anchor is best-effort).
**Invariants exercised:** #3 (anchor is itself append-only), Anchor exempt from #2.

### Task 15: `anchorTick` (merkle → 0G archive → AnchorEvent + history_anchors)

**Files:**
- Create: `packages/history/src/anchor.ts`
- Test: `packages/history/src/anchor.itest.ts`

**Interfaces:**
- Consumes: `loadWorldEvents`, `merkleRoot`, `append` (for the `AnchorEvent`), a `StorageProvider` (`@civ/storage` — `{ archive(key, data): Promise<{rootHash, txHash, ts}> }`).
- Produces: `anchorTick(tx: Executor, storage: StorageProvider, worldId: string, tickId: number, opts?: { engineVersion?: string }): Promise<{ merkleRoot: Hash; zgRootHash: string | null; zgTxHash: string | null } | null>` — returns `null` if the tick has no transitions; on success archives + writes `history_anchors` + appends an `AnchorEvent`.

- [ ] **Step 1: Write the failing integration test**

`packages/history/src/anchor.itest.ts`:
```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool } from "@civ/persistence";
import { append } from "./append";
import { anchorTick } from "./anchor";
import { ctFor } from "./testhelpers";

const fakeStorage = {
  name: "fake",
  archive: async (_k: string, _d: unknown) => ({ rootHash: "0xROOT", txHash: "0xTX", ts: Date.now() }),
};

describe("anchorTick", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wh'");
    await getPool().query("DELETE FROM history_anchors WHERE world_id = 'wh'");
  });
  afterAll(async () => { await closePool(); });

  it("anchors a tick's transitions to 0G and records the anchor row + event", async () => {
    await append(getPool(), ctFor("wh", 7, "c1", "work"));
    await append(getPool(), ctFor("wh", 7, "c2", "rest"));
    const res = await anchorTick(getPool(), fakeStorage, "wh", 7);
    expect(res?.zgRootHash).toBe("0xROOT");
    expect(res?.zgTxHash).toBe("0xTX");

    const a = await getPool().query("SELECT merkle_root, zg_tx_hash FROM history_anchors WHERE world_id='wh' AND tick_id=7");
    expect(a.rows[0].zg_tx_hash).toBe("0xTX");
    const ev = await getPool().query("SELECT kind FROM history_events WHERE world_id='wh' AND kind='Anchor'");
    expect(ev.rows.length).toBe(1);
  });

  it("returns null when the tick has no transitions", async () => {
    expect(await anchorTick(getPool(), fakeStorage, "wh", 999)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:it packages/history/src/anchor.itest.ts`
Expected: FAIL ("anchorTick is not a function").

- [ ] **Step 3: Implement**

`packages/history/src/anchor.ts`:
```ts
import type { StorageProvider } from "@civ/storage";
import { type Executor, append, loadWorldEvents } from "./append";
import { merkleRoot } from "./hash";
import {
  GENESIS_PARENT, SCHEMA_VERSION, eventKind,
  type AnchorEvent, type CognitiveTransition, type Hash,
} from "./types";

export async function anchorTick(
  tx: Executor,
  storage: StorageProvider,
  worldId: string,
  tickId: number,
  opts: { engineVersion?: string } = {},
): Promise<{ merkleRoot: Hash; zgRootHash: string | null; zgTxHash: string | null } | null> {
  const rows = await loadWorldEvents(tx, worldId);
  const tickRows = rows.filter(
    (r) => eventKind(r.event) === "CognitiveTransition" && (r.event as CognitiveTransition).header.tickId === tickId,
  );
  if (tickRows.length === 0) return null;

  const root = merkleRoot(tickRows.map((r) => r.eventHash));
  const coveredEventIds = tickRows.map((r) => (r.event as CognitiveTransition).header.eventId);

  let zgRootHash: string | null = null;
  let zgTxHash: string | null = null;
  try {
    const res = await storage.archive(`civ.history/v0/${worldId}/${tickId}`, { merkleRoot: root, coveredEventIds });
    zgRootHash = res.rootHash;
    zgTxHash = res.txHash;
  } catch (err) {
    // best-effort: a missed anchor leaves the chain intact and re-anchorable
    console.warn(`[history] 0G anchor archive failed world=${worldId} tick=${tickId}:`, err);
  }

  const anchorId = `anchor-${worldId}-${tickId}`;
  await tx.query(
    `INSERT INTO history_anchors (id, world_id, tick_id, merkle_root, zg_root_hash, zg_tx_hash)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET merkle_root=$4, zg_root_hash=$5, zg_tx_hash=$6`,
    [anchorId, worldId, tickId, root, zgRootHash, zgTxHash],
  );

  const anchorEvent: AnchorEvent = {
    header: { eventId: anchorId, parentHash: GENESIS_PARENT, worldId, tickId,
      engineVersion: opts.engineVersion ?? "civ0@dev", schemaVersion: SCHEMA_VERSION, timestamp: new Date().toISOString() },
    merkleRoot: root, coveredEventIds, zgRootHash, zgTxHash,
  };
  await append(tx, anchorEvent); // append-only; Anchor is exempt from #2 but bound by #3

  return { merkleRoot: root, zgRootHash, zgTxHash };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:it packages/history/src/anchor.itest.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Wire best-effort anchoring after the tick (post-commit)**

In `packages/persistence/src/repository.ts` `persistTick`, extend the post-commit block (Track F Step 5) — anchoring is best-effort and never blocks the tick:
```ts
      if (process.env.HISTORY_ANCHOR === "1") {
        const { anchorTick } = await import("@civ/history/src/anchor");
        const { createZeroGStorage } = await import("@civ/zerog");
        // reuse the same storage config the engine uses; guarded by HISTORY_ANCHOR so default ticks don't spend OG
        await anchorTick(this.pool, createZeroGStorage(zeroGConfigFromEnv()), worldId, d.day)
          .catch((err) => console.warn("[history] anchor skipped:", err));
      }
```
(Anchoring is OFF by default — gated behind `HISTORY_ANCHOR=1` so the live 2h scheduler does not spend OG until explicitly enabled. Source the 0G config the same way the engine does; if a helper like `zeroGConfigFromEnv()` does not exist, inline the same env reads the engine uses to build its storage — grep `createZeroGStorage` call sites.)

- [ ] **Step 6: Commit**

```bash
git add packages/history/src/anchor.ts packages/history/src/anchor.itest.ts packages/persistence/src/repository.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): anchorTick — merkle -> 0G archive -> AnchorEvent + history_anchors (gated, best-effort)"
```

### Task 16: Live 0G anchor smoke script (manual, gated)

**Files:**
- Create: `packages/history/scripts/anchor-smoke.ts`

**Interfaces:**
- Consumes: `createZeroGStorage`, `anchorTick`. No automated test — this spends ~0.002 OG and is run by hand.

- [ ] **Step 1: Write the smoke script**

`packages/history/scripts/anchor-smoke.ts`:
```ts
// Manual, gated: archives one world+tick's merkle root to REAL 0G (~0.002 OG) and prints the anchor.
// Run: HISTORY_ANCHOR=1 DATABASE_URL=... <0G envs> tsx packages/history/scripts/anchor-smoke.ts --world <id> --tick <day>
import { getPool, closePool } from "@civ/persistence";
import { createZeroGStorage } from "@civ/zerog";
import { anchorTick } from "../src/anchor";
// import the same env->config builder the engine uses (grep createZeroGStorage call sites)

function arg(n: string) { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; }

async function main() {
  const world = arg("world") ?? "default";
  const tick = Number(arg("tick"));
  if (!Number.isFinite(tick)) { console.error("usage: --world <id> --tick <day>"); process.exit(2); }
  const storage = createZeroGStorage(/* zeroGConfigFromEnv() */ undefined as never);
  const res = await anchorTick(getPool(), storage, world, tick);
  console.log("anchor:", res);
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Commit (do NOT run automatically — it spends OG)**

```bash
git add packages/history/scripts/anchor-smoke.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "chore(history): manual gated live 0G anchor smoke script"
```

---

## Track I — Optional thin web explorer (only if CLI acceptance passes + time permits)

**Acceptance:** `/explain/[citizen]/[tick]` renders the same `ExplainView` reusing the shipped `CausalChain` + `SocialDrivers` components; `null` cognition shows "unavailable".
**Rollback:** delete the route; CLI + engine unaffected.
**Invariants exercised:** #1 (UI shows "unavailable", never fabricated).

### Task 17: `/explain/[citizen]/[tick]` route (OPTIONAL)

**Files:**
- Create: `apps/web/app/explain/[citizen]/[tick]/page.tsx`
- Create: `apps/web/app/api/explain/[citizen]/[tick]/route.ts` (keyless read; world via `?world=` query, default `"default"`)
- Test: `apps/web/app/explain/explain.test.tsx` (render-level: null cognition shows "unavailable")

**Interfaces:**
- Consumes: `buildExplainView` (Task 14), the existing `CausalChain` + `SocialDrivers` components (reuse — do not reimplement).

- [ ] **Step 1: Write the failing render test**

`apps/web/app/explain/explain.test.tsx`:
```tsx
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExplainPanel } from "./ExplainPanel";

const view = {
  world: "w1", citizen: "c1", tick: 5, observation: { query: "save up" },
  retrievedMemories: [], retrievedBeliefs: [], socialDrivers: [], availableActions: ["work"],
  selectedAction: "work", reasoning: "r", worldDelta: null,
  execution: { provider: "0g-compute", modelId: "llama", modelVersion: "v", promptHash: "", worldHash: "", verified: true },
  candidates: "unavailable" as const, beliefDelta: "unavailable" as const,
  eventHash: "0xaa", parentHash: "0x00", chainVerified: true, anchor: null,
};

describe("ExplainPanel", () => {
  it("renders 'unavailable' for null cognition (Invariant #1)", () => {
    render(<ExplainPanel view={view} />);
    expect(screen.getAllByText(/unavailable/i).length).toBeGreaterThanOrEqual(2);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm vitest run apps/web/app/explain/explain.test.tsx`
Expected: FAIL ("Cannot find module './ExplainPanel'").

- [ ] **Step 3: Implement the API route, panel, and page**

`apps/web/app/api/explain/[citizen]/[tick]/route.ts`:
```ts
import { NextRequest, NextResponse } from "next/server";
import { getPool } from "@civ/persistence";
import { buildExplainView } from "@civ/history/src/explainView";

export async function GET(
  req: NextRequest,
  { params }: { params: { citizen: string; tick: string } },
) {
  const world = req.nextUrl.searchParams.get("world") ?? "default";
  const view = await buildExplainView(getPool(), world, params.citizen, Number(params.tick));
  if (!view) return NextResponse.json({ error: "not found" }, { status: 404 });
  return NextResponse.json(view);
}
```

`apps/web/app/explain/[citizen]/[tick]/ExplainPanel.tsx` (a small presentational component; reuse `CausalChain`/`SocialDrivers` for the populated steps and render "unavailable" plainly for the null ones):
```tsx
"use client";
import type { ExplainView } from "@civ/history/src/types";
import { SocialDrivers } from "@/components/SocialDrivers"; // adjust import to the shipped component path

export function ExplainPanel({ view }: { view: ExplainView }) {
  return (
    <div className="explain">
      <header>
        citizen {view.citizen} · tick {view.tick} · chain {view.chainVerified ? "✓" : "✗"}
      </header>
      <p>① observe: {view.observation.query}</p>
      <SocialDrivers drivers={view.socialDrivers} />
      <p>④ candidates: {view.candidates === "unavailable" ? "unavailable" : view.candidates.map((c) => c.action).join(", ")}</p>
      <p>⑤ choose: {view.selectedAction}</p>
      <p>⑥ reasoning: {view.reasoning}</p>
      <p>⑦ beliefΔ: {view.beliefDelta === "unavailable" ? "unavailable" : JSON.stringify(view.beliefDelta)}</p>
      <p>⑨ execution: {view.execution.provider}/{view.execution.modelId} verified={String(view.execution.verified)}</p>
    </div>
  );
}
```
(Match the `SocialDrivers` prop contract to the shipped component — run `grep -rn "export function SocialDrivers\|export const SocialDrivers" apps/web` and adapt the import/props. Do NOT reimplement it.)

`apps/web/app/explain/[citizen]/[tick]/page.tsx`:
```tsx
import { getPool } from "@civ/persistence";
import { buildExplainView } from "@civ/history/src/explainView";
import { ExplainPanel } from "./ExplainPanel";

export default async function Page({
  params, searchParams,
}: { params: { citizen: string; tick: string }; searchParams: { world?: string } }) {
  const view = await buildExplainView(getPool(), searchParams.world ?? "default", params.citizen, Number(params.tick));
  if (!view) return <main>No authenticated transition for this citizen/tick.</main>;
  return <main><ExplainPanel view={view} /></main>;
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm vitest run apps/web/app/explain/explain.test.tsx`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/web/app/explain apps/web/app/api/explain
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(web): optional /explain/[citizen]/[tick] keyless trace view"
```

---

## Final verification (Phase 1A acceptance)

- [ ] **Full unit suite green:** `pnpm vitest run packages/history packages/engine` — all history + engine unit tests pass; engine change is additive-return-only.
- [ ] **Full integration suite green:** `pnpm test:it packages/history packages/persistence` — schema, append (Invariant #2 both directions), faithfulness, explain view, anchor (fake storage) all pass.
- [ ] **CLI acceptance:** seed one tick in `civ0_test`, run `tsx packages/history/scripts/explain.ts --citizen <id> --tick <day> --world <id>` → authenticated trace prints, `chain verified : ✓`, `candidates`/`beliefΔ` show `unavailable`.
- [ ] **Live tick unchanged:** diff `packages/engine` and confirm it is additive-return-only; the `/opt/civilization-0` scheduler (default `HISTORY_ANCHOR` unset) behaves byte-for-byte as before — history append is the only new write, and it is inside the existing transaction.
- [ ] **Invariant audit:** #1 — `candidates`/`beliefDelta` are `null` everywhere they appear and never fabricated; #2 — a forced append failure rolls back the decision (itest); #3 — `verifyWorldChain` detects a tamper (itest); #4 — `header.schemaVersion === 1` on every event and `CANON_VERSION === "jcs-1"`.
- [ ] **Branch review:** request a whole-branch code review (superpowers:requesting-code-review) before any merge; merge via PR (never commit to master). Live 0G anchor smoke (`anchor-smoke.ts`) is run manually only, gated by `HISTORY_ANCHOR=1`.
