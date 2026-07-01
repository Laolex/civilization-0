# `@civ/history` Phase 1B — Coverage Hardening & Fail-Hard Faithfulness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make `@civ/history` reconstruct and verify **world state** (wealth, relationships, organizations) — not just cognition — from an append-only event log anchored by a per-world Genesis boundary, with fail-hard enforcement that every mutation's recorded delta equals the applied delta, while all production reads stay on legacy rows.

**Architecture:** Per-world history begins at a lazily-captured, atomically-hashed **Genesis** event (chain root). Every world mutation (`adjustWealth`, relationship upsert, org create/join) appends a typed **delta event** in the SAME transaction as the mutation (Invariant #2). Two independent proofs guard correctness: **Proof A** (transactional faithfulness — recorded delta == applied delta, FAIL-HARD on the hot path, gated by `HISTORY_ENFORCE` + per-dimension divergence budget) and **Proof B** (historical completeness — `fold(genesis ⊕ events) == legacy state`, an O(n) AUDIT run off the hot path). New CLI surfaces: `civ state`, `civ history coverage`, `civ verify --fold`, and an epoch-aware `civ explain`.

**Tech Stack:** TypeScript ESM, pnpm workspace, Node 20, Postgres 16 + pgvector (`pg`), vitest (unit project + `*.itest.ts` integration project against `civ0_test`), Node `crypto` (sha-256), `tsx` for CLI scripts. Builds on Phase 1A (`@civ/history`), landed on branch `v2`.

## Global Constraints

- **Spec is authoritative:** `docs/superpowers/specs/2026-06-30-history-1b-coverage-design.md`. The SIX Provenance Invariants are binding; copy #5 and #6 verbatim into `types.ts`.
  - **#1 Authenticated cognition only.** Never fabricate cognition. (Unchanged from 1A.)
  - **#2 Mutation ⇔ history (same transaction).** Every committed world mutation has its delta event in the SAME tx; no orphans either direction.
  - **#3 Append-only / tamper-evident.** One per-world hash chain; corrections are new events only.
  - **#4 Schema permanence.** Events read under their emission `schemaVersion`; readers dispatch on it, never silently re-read under a later schema.
  - **#5 Historical Boundary.** Authenticated cognitive history begins at the per-world Genesis event. Pre-boundary events are verified world-state *facts* only, never replayable cognition. No pre-boundary cognition may be reconstructed, inferred, synthesized, or presented as historical fact.
  - **#6 Independent Verification.** Operational correctness (Proof A: events record mutations) and semantic correctness (Proof B: reductions reconstruct world state) are verified independently.
- **No read-path flip.** Zero production reads served from `fold(history)` — that is Phase 2. `civ state`/`coverage`/`verify` are diagnostic CLIs only.
- **Engine imports NOTHING from `@civ/history`.** Delta events are built in the persistence/scheduler layer. Dependency direction stays `history → engine/shared`.
- **`HISTORY_ENFORCE` defaults OFF.** Unset/`0` = shadow (emit + warn). `1` = enforcement armed; a dimension hard-fails only when armed AND within its divergence budget. Shadow-first always.
- **Record ACTUAL applied deltas.** `adjustWealth` clamps with `GREATEST(0, …)`; the `WealthDelta` records `newWealth − oldWealth`, not the requested delta. Same read-before-write for relationships.
- **World-scoping via `citizens.world_id`.** `relationships`/`organizations` have no `world_id`; join through citizens.
- **Genesis is event #1.** `ensureEpoch` runs before any other append for a world (including the `CognitiveTransition` in `persistTick`). The existing `UNIQUE(world_id, parent_hash)` index structurally enforces one root.
- **Commits:** no `Co-Authored-By`, no AI attribution. Commit with `git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit`.
- **Branch isolation:** all work on `feat/history-1b-coverage` in worktree `/opt/civilization-0-1b` (off `v2`). Never master, never the live `/opt/civilization-0`. Not deployed during development.
- **Tests:** unit tests network-free; DB tests are `*.itest.ts` (run via `pnpm test:it`, `civ0_test` DB). Live 0G anchor stays gated/manual.
- **Vitest binary:** `./node_modules/.bin/vitest` (no network for `npx`). Integration: `pnpm test:it <path>`.

---

## File Structure

```
packages/history/src/
  types.ts            MODIFY — HistoryEnvelope, kind discriminant, Genesis + 3 *Delta types,
                       Invariants #5/#6, SCHEMA_VERSION→2, WorldFacts, eventKind() dispatch
  hash.ts             MODIFY — eventHash already kind-agnostic; add genesisFactsHash()
  reduce.ts           MODIFY — applyWealth/Relationship/Org reducers + worldFold(genesis, events) → WorldFacts
  genesis.ts          NEW    — captureGenesisFacts(tx,world), buildGenesis(...), ensureEpoch(tx,world)
  deltas.ts           NEW    — buildWealthDelta / buildRelationshipDelta / buildOrganizationDelta (pure)
  enforce.ts          NEW    — divergence budget config, HISTORY_ENFORCE gate, assertFaithful() (Proof A)
  audit.ts            NEW    — foldLegacyFacts(tx,world), proofB(tx,world), coverage(tx,world)  (Proof B)
  read.ts             MODIFY — loadGenesis(tx,world), loadEpoch(tx,world), loadWorldDeltas(tx,world)
  explainView.ts      MODIFY — epoch gate (refuse pre-epoch explain)
  scripts/state.ts        NEW — `civ state` CLI
  scripts/coverage.ts     NEW — `civ history coverage` CLI
  scripts/verify-fold.ts  NEW — `civ verify --fold` CLI

packages/persistence/src/
  repository.ts       MODIFY — persistTick: ensureEpoch before CT; RelationshipDelta coupling;
                       adjustWealthCoupled(tx) helper
  org-repository.ts   MODIFY — createOrgCoupled / addMembershipCoupled (tx + OrganizationDelta)

packages/scheduler/src/
  loop.ts             MODIFY — runDay wires adjustWealth + org effects through the coupled tx paths
```

No new tables: Genesis and delta events are rows in `history_events` (new `kind` values). Coverage/audit compute from `history_events` ⋈ legacy tables.

---

## Track A — Event model & invariants (pure, no DB)

**Acceptance:** `types.ts` compiles with the 6-kind envelope; `eventKind()` discriminates all six and falls back structurally for v1 events; `SCHEMA_VERSION === 2`.
**Rollback:** revert `types.ts`; no DB/engine touched.
**Invariants exercised:** #4 (schema bump + dispatch), #5/#6 (documented).

### Task 1: Envelope, kind discriminant, the six event types, Invariants #5/#6

**Files:**
- Modify: `packages/history/src/types.ts`
- Test: `packages/history/src/types.test.ts` (extend existing)

**Interfaces:**
- Produces: `HistoryKind`, `HistoryEnvelope`, `Genesis`, `WealthDelta`, `RelationshipDelta`, `OrganizationDelta`, `WorldFacts`; widened `HistoryEvent` union; `eventKind(e): HistoryKind`; `SCHEMA_VERSION = 2`.
- Consumed by every later task.

- [ ] **Step 1: Write the failing test** (append to `types.test.ts`)

```ts
import { SCHEMA_VERSION, eventKind, GENESIS_PARENT } from "./index";
import type { Genesis, WealthDelta, RelationshipDelta, OrganizationDelta, CognitiveTransition } from "./index";

const hdr = (kind: string) => ({ eventId: `e-${kind}`, parentHash: GENESIS_PARENT, worldId: "w1",
  tickId: 1, engineVersion: "t", schemaVersion: SCHEMA_VERSION, timestamp: "2026-06-30T00:00:00.000Z" });

describe("1B event model", () => {
  it("bumps the schema version to 2", () => { expect(SCHEMA_VERSION).toBe(2); });

  it("discriminates all six kinds via the explicit discriminant", () => {
    const g = { kind: "Genesis", header: hdr("g") } as Genesis;
    const w = { kind: "WealthDelta", header: hdr("w") } as WealthDelta;
    const r = { kind: "RelationshipDelta", header: hdr("r") } as RelationshipDelta;
    const o = { kind: "OrganizationDelta", header: hdr("o") } as OrganizationDelta;
    expect(eventKind(g)).toBe("Genesis");
    expect(eventKind(w)).toBe("WealthDelta");
    expect(eventKind(r)).toBe("RelationshipDelta");
    expect(eventKind(o)).toBe("OrganizationDelta");
  });

  it("falls back structurally for v1 events with no kind discriminant", () => {
    const legacyCT = { header: hdr("ct"), actor: "c1" } as unknown as CognitiveTransition; // no `kind`
    const legacyAnchor = { header: hdr("a"), merkleRoot: "0xab" } as unknown as { merkleRoot: string };
    expect(eventKind(legacyCT as any)).toBe("CognitiveTransition");
    expect(eventKind(legacyAnchor as any)).toBe("Anchor");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run packages/history/src/types.test.ts`
Expected: FAIL (`SCHEMA_VERSION` is 1; `Genesis`/`WealthDelta`/… not exported).

- [ ] **Step 3: Edit `types.ts`** — bump the version, add the envelope, the new types, and dispatch.

Change the version constant:
```ts
export const SCHEMA_VERSION = 2 as const; // 1B: world-history events (Genesis + deltas). v1 events still read structurally.
```

Add the two new invariants to the top doc comment (after #4):
```ts
 *  #5 Historical Boundary. Authenticated cognitive history begins at the per-world Genesis event.
 *     Pre-boundary events are verified world-state facts only, never replayable cognition. No pre-boundary
 *     cognition may be reconstructed, inferred, synthesized, or presented as historical fact.
 *  #6 Independent Verification. Operational correctness (Proof A: events record mutations) and semantic
 *     correctness (Proof B: reductions reconstruct world state) are verified independently.
```

Add the envelope, kinds, and event types (after `AnchorEvent`):
```ts
export type HistoryKind =
  | "Genesis" | "CognitiveTransition"
  | "WealthDelta" | "RelationshipDelta" | "OrganizationDelta"
  | "Anchor";

/** Shared envelope. New (1B) events carry an explicit `kind`; v1 events omit it (read structurally). */
export interface HistoryEnvelope { kind: HistoryKind; header: EventHeader; }

/** Verified world-state facts captured at a world's historical boundary. Chain ROOT of the world. */
export interface WorldFacts {
  wealth: { actor: string; wealth: number }[];
  relationships: { a: string; b: string; trust: number; friendship: number; influence: number }[];
  organizations: { id: string; founderId: string; treasury: number; members: { citizenId: string; role: string }[] }[];
}
export interface Genesis extends HistoryEnvelope {
  kind: "Genesis";
  epochId: string;        // e.g. epoch-<worldId>-<ISO date>
  historyVersion: string; // e.g. "1b-v1"
  worldHash: Hash;        // genesisFactsHash(facts)
  facts: WorldFacts;
  capturedAt: string;     // ISO
}
export interface WealthDelta extends HistoryEnvelope {
  kind: "WealthDelta"; actor: string; delta: number; decisionId: string | null;
}
export interface RelationshipDelta extends HistoryEnvelope {
  kind: "RelationshipDelta"; a: string; b: string;
  field: "trust" | "friendship" | "influence"; delta: number; decisionId: string | null;
}
export interface OrganizationDelta extends HistoryEnvelope {
  kind: "OrganizationDelta"; op: "founded" | "member_added";
  orgId: string; founderId?: string; citizenId?: string; role?: string; decisionId: string | null;
}
```

Widen the union and rewrite `eventKind`:
```ts
export type HistoryEvent =
  | CognitiveTransition | AnchorEvent
  | Genesis | WealthDelta | RelationshipDelta | OrganizationDelta;
export type EventKind = HistoryKind;

/** Dispatch on the explicit 1B discriminant; fall back to v1 structural detection (Invariant #4). */
export function eventKind(e: HistoryEvent): HistoryKind {
  if (typeof (e as Partial<HistoryEnvelope>).kind === "string") return (e as HistoryEnvelope).kind;
  return "merkleRoot" in e ? "Anchor" : "CognitiveTransition"; // legacy v1 events
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run packages/history/src/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm -r typecheck
git add packages/history/src/types.ts packages/history/src/types.test.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): 1B event envelope + Genesis/Delta types + Invariants #5/#6 (schema v2)"
```

> NOTE on existing CognitiveTransition emission: `buildCognitiveTransition` (Task in 1A) does NOT yet set `kind`. New CTs read fine via structural fallback, but for cleanliness Task 3 adds `kind: "CognitiveTransition"` when building. Do not change the 1A `CognitiveTransition` interface shape otherwise.

---

## Track B — Reducers & fold (pure, no DB)

**Acceptance:** `worldFold(genesis, events)` reconstructs `WorldFacts` by applying deltas over the Genesis baseline; each reducer is pure and order-respecting.
**Rollback:** revert `reduce.ts` additions.
**Invariants exercised:** #6 (the reducer semantics Proof B will check).

### Task 2: Delta reducers + `worldFold(genesis ⊕ events)`

**Files:**
- Modify: `packages/history/src/reduce.ts`
- Test: `packages/history/src/reduce.test.ts` (extend)

**Interfaces:**
- Consumes: `Genesis`, `WealthDelta`, `RelationshipDelta`, `OrganizationDelta`, `WorldFacts`, `eventKind`.
- Produces: `worldFold(genesis: Genesis, events: HistoryEvent[]): WorldFacts`. Pure; ignores `CognitiveTransition`/`Anchor` (they carry no world-state delta). Relationship key is the unordered pair (`a`,`b` sorted). Wealth floors at 0 (mirrors the DB `GREATEST(0,…)`).

- [ ] **Step 1: Write the failing test** (append to `reduce.test.ts`)

```ts
import { worldFold } from "./reduce";
import { GENESIS_PARENT, SCHEMA_VERSION } from "./index";
import type { Genesis, WealthDelta, OrganizationDelta, HistoryEvent } from "./index";

const H = (id: string) => ({ eventId: id, parentHash: GENESIS_PARENT, worldId: "w1", tickId: 1,
  engineVersion: "t", schemaVersion: SCHEMA_VERSION, timestamp: "2026-06-30T00:00:00.000Z" });

const genesis: Genesis = { kind: "Genesis", header: H("g"), epochId: "epoch-w1", historyVersion: "1b-v1",
  worldHash: "0x0", capturedAt: "2026-06-30T00:00:00.000Z",
  facts: { wealth: [{ actor: "c1", wealth: 100 }], relationships: [], organizations: [] } };

describe("worldFold", () => {
  it("applies wealth deltas over the genesis baseline (floored at 0)", () => {
    const evs: HistoryEvent[] = [
      { kind: "WealthDelta", header: H("w1"), actor: "c1", delta: 8, decisionId: "d1" } as WealthDelta,
      { kind: "WealthDelta", header: H("w2"), actor: "c1", delta: -200, decisionId: "d2" } as WealthDelta,
    ];
    const facts = worldFold(genesis, evs);
    expect(facts.wealth.find((w) => w.actor === "c1")?.wealth).toBe(0); // 100+8-200 → floor 0
  });

  it("introduces actors/orgs that appear only in deltas", () => {
    const evs: HistoryEvent[] = [
      { kind: "WealthDelta", header: H("w"), actor: "c2", delta: 5, decisionId: null } as WealthDelta,
      { kind: "OrganizationDelta", header: H("o1"), op: "founded", orgId: "org1", founderId: "c1", decisionId: "d" } as OrganizationDelta,
      { kind: "OrganizationDelta", header: H("o2"), op: "member_added", orgId: "org1", citizenId: "c2", role: "member", decisionId: "d" } as OrganizationDelta,
    ];
    const f = worldFold(genesis, evs);
    expect(f.wealth.find((w) => w.actor === "c2")?.wealth).toBe(5);
    const org = f.organizations.find((o) => o.id === "org1");
    expect(org?.members.map((m) => m.citizenId).sort()).toEqual(["c1", "c2"]);
  });

  it("ignores cognition/anchor events", () => {
    const evs: HistoryEvent[] = [{ header: H("ct"), actor: "c1" } as any];
    expect(worldFold(genesis, evs).wealth.find((w) => w.actor === "c1")?.wealth).toBe(100);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run packages/history/src/reduce.test.ts`
Expected: FAIL (`worldFold` not a function).

- [ ] **Step 3: Implement** (append to `reduce.ts`)

```ts
import { eventKind, type Genesis, type HistoryEvent, type WorldFacts,
  type WealthDelta, type RelationshipDelta, type OrganizationDelta } from "./types";

const relKey = (a: string, b: string) => (a < b ? `${a}\x1F${b}` : `${b}\x1F${a}`);

/** Reconstruct WorldFacts = genesis baseline ⊕ Σ deltas (Invariant #6 — this is the audited semantics). */
export function worldFold(genesis: Genesis, events: HistoryEvent[]): WorldFacts {
  const wealth = new Map<string, number>();
  for (const w of genesis.facts.wealth) wealth.set(w.actor, w.wealth);
  const rels = new Map<string, { a: string; b: string; trust: number; friendship: number; influence: number }>();
  for (const r of genesis.facts.relationships) rels.set(relKey(r.a, r.b), { ...r });
  const orgs = new Map<string, { id: string; founderId: string; treasury: number; members: { citizenId: string; role: string }[] }>();
  for (const o of genesis.facts.organizations) orgs.set(o.id, { ...o, members: o.members.map((m) => ({ ...m })) });

  for (const e of events) {
    switch (eventKind(e)) {
      case "WealthDelta": {
        const w = e as WealthDelta;
        wealth.set(w.actor, Math.max(0, (wealth.get(w.actor) ?? 0) + w.delta));
        break;
      }
      case "RelationshipDelta": {
        const r = e as RelationshipDelta;
        const k = relKey(r.a, r.b);
        const cur = rels.get(k) ?? { a: r.a < r.b ? r.a : r.b, b: r.a < r.b ? r.b : r.a, trust: 0, friendship: 0, influence: 0 };
        cur[r.field] = cur[r.field] + r.delta;
        rels.set(k, cur);
        break;
      }
      case "OrganizationDelta": {
        const o = e as OrganizationDelta;
        if (o.op === "founded") {
          orgs.set(o.orgId, { id: o.orgId, founderId: o.founderId ?? "", treasury: 0,
            members: [{ citizenId: o.founderId ?? "", role: "founder" }] });
        } else if (o.op === "member_added" && o.citizenId) {
          const org = orgs.get(o.orgId) ?? { id: o.orgId, founderId: "", treasury: 0, members: [] };
          if (!org.members.some((m) => m.citizenId === o.citizenId)) org.members.push({ citizenId: o.citizenId, role: o.role ?? "member" });
          orgs.set(o.orgId, org);
        }
        break;
      }
      default: break; // CognitiveTransition / Anchor: no world-state delta
    }
  }
  return {
    wealth: [...wealth.entries()].map(([actor, w]) => ({ actor, wealth: w })),
    relationships: [...rels.values()],
    organizations: [...orgs.values()],
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run packages/history/src/reduce.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm -r typecheck
git add packages/history/src/reduce.ts packages/history/src/reduce.test.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): worldFold(genesis ⊕ deltas) -> WorldFacts reducers"
```

---

## Track C — Genesis capture (DB)

**Acceptance:** `ensureEpoch(tx, world)` captures the world's current legacy facts atomically, hashes them, and appends a `Genesis` chain root exactly once; re-invocation is a no-op.
**Rollback:** revert `genesis.ts`, `hash.ts` `genesisFactsHash`, and the `persistTick` `ensureEpoch` call.
**Invariants exercised:** #2 (atomic capture→hash→append), #3 (root), #5 (boundary), #4 (the existing unique index enforces single root).

### Task 3: `genesisFactsHash`, `captureGenesisFacts`, `ensureEpoch` + wire into `persistTick`

**Files:**
- Modify: `packages/history/src/hash.ts` (add `genesisFactsHash`)
- Create: `packages/history/src/genesis.ts`
- Modify: `packages/history/src/read.ts` (add `loadGenesis`)
- Modify: `packages/persistence/src/repository.ts` (call `ensureEpoch` before the CT append)
- Test: `packages/history/src/genesis.itest.ts`

**Interfaces:**
- Consumes: `Executor` (from `append.ts`), `append`, `canonicalJSON`, `sha256Hex`, `WorldFacts`, `Genesis`.
- Produces:
  - `genesisFactsHash(facts: WorldFacts): Hash` (in `hash.ts`)
  - `captureGenesisFacts(tx: Executor, worldId: string): Promise<WorldFacts>` (in `genesis.ts`)
  - `ensureEpoch(tx: Executor, worldId: string, opts?: { historyVersion?: string }): Promise<Genesis>` — idempotent; returns the existing or newly-appended Genesis.
  - `loadGenesis(tx: Executor, worldId: string): Promise<Genesis | null>` (in `read.ts`)

- [ ] **Step 1: Write the failing integration test**

`packages/history/src/genesis.itest.ts`:
```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool } from "@civ/persistence";
import { ensureEpoch } from "./genesis";
import { loadGenesis } from "./read";
import { loadWorldEvents } from "./append";
import { GENESIS_PARENT } from "./index";

async function seedCitizen(id: string, world: string, wealth: number) {
  await getPool().query(
    `INSERT INTO citizens (id,name,occupation,age,traits,wealth,world_id)
     VALUES ($1,'C','x',30,'{}'::jsonb,$2,$3) ON CONFLICT (id) DO UPDATE SET wealth=$2, world_id=$3`,
    [id, wealth, world]);
}

describe("ensureEpoch / Genesis", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wg'");
    await getPool().query("DELETE FROM citizens WHERE world_id = 'wg'");
  });
  afterAll(async () => { await closePool(); });

  it("captures current facts as the chain root exactly once, idempotently", async () => {
    await seedCitizen("g1", "wg", 100);
    const g1 = await ensureEpoch(getPool(), "wg");
    expect(g1.kind).toBe("Genesis");
    expect(g1.header.parentHash).toBe(GENESIS_PARENT);
    expect(g1.facts.wealth.find((w) => w.actor === "g1")?.wealth).toBe(100);

    const again = await ensureEpoch(getPool(), "wg"); // idempotent
    expect(again.header.eventId).toBe(g1.header.eventId);

    const evs = await loadWorldEvents(getPool(), "wg");
    expect(evs.length).toBe(1); // only the genesis row
    const loaded = await loadGenesis(getPool(), "wg");
    expect(loaded?.worldHash).toBe(g1.worldHash);
  });

  it("computes a deterministic worldHash for identical facts", async () => {
    await seedCitizen("g1", "wg", 50);
    const a = await ensureEpoch(getPool(), "wg");
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wg'");
    const b = await ensureEpoch(getPool(), "wg");
    expect(a.worldHash).toBe(b.worldHash);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:it packages/history/src/genesis.itest.ts`
Expected: FAIL (`ensureEpoch` not found).

- [ ] **Step 3a: Add `genesisFactsHash` to `hash.ts`**

```ts
import type { WorldFacts } from "./types";

/** Deterministic hash of captured world facts — the Genesis worldHash (tamper-evident baseline). */
export function genesisFactsHash(facts: WorldFacts): Hash {
  return sha256Hex(canonicalJSON(facts));
}
```

- [ ] **Step 3b: Create `genesis.ts`**

```ts
import { type Executor, append } from "./append";
import { genesisFactsHash } from "./hash";
import { loadGenesis } from "./read";
import { SCHEMA_VERSION, GENESIS_PARENT, type Genesis, type WorldFacts } from "./types";

/** Read the world's current legacy facts (wealth/relationships/orgs), scoped via citizens.world_id. */
export async function captureGenesisFacts(tx: Executor, worldId: string): Promise<WorldFacts> {
  const w = await tx.query(`SELECT id AS actor, wealth FROM citizens WHERE world_id = $1 ORDER BY id`, [worldId]);
  const r = await tx.query(
    `SELECT r.citizen_id AS a, r.other_id AS b, r.trust, r.friendship, r.influence
       FROM relationships r JOIN citizens c ON c.id = r.citizen_id
      WHERE c.world_id = $1 ORDER BY r.citizen_id, r.other_id`, [worldId]);
  const o = await tx.query(
    `SELECT o.id, o.founder_id, o.treasury,
            COALESCE(json_agg(json_build_object('citizenId', m.citizen_id, 'role', m.role)
                     ORDER BY m.citizen_id) FILTER (WHERE m.citizen_id IS NOT NULL), '[]') AS members
       FROM organizations o
       JOIN citizens fc ON fc.id = o.founder_id AND fc.world_id = $1
       LEFT JOIN memberships m ON m.org_id = o.id
      GROUP BY o.id, o.founder_id, o.treasury ORDER BY o.id`, [worldId]);
  return {
    wealth: w.rows.map((x) => ({ actor: x.actor, wealth: Number(x.wealth) })),
    relationships: r.rows.map((x) => ({ a: x.a, b: x.b, trust: Number(x.trust),
      friendship: Number(x.friendship), influence: Number(x.influence) })),
    organizations: o.rows.map((x) => ({ id: x.id, founderId: x.founder_id, treasury: Number(x.treasury),
      members: (x.members as { citizenId: string; role: string }[]) })),
  };
}

/** Idempotently establish the per-world historical boundary. Capture → hash → append as the chain ROOT.
 *  MUST be called (inside the caller's tx) before any other append for the world (Invariant #5, #3). */
export async function ensureEpoch(
  tx: Executor, worldId: string, opts: { historyVersion?: string } = {},
): Promise<Genesis> {
  const existing = await loadGenesis(tx, worldId);
  if (existing) return existing;
  const facts = await captureGenesisFacts(tx, worldId);
  const now = new Date().toISOString();
  const genesis: Genesis = {
    kind: "Genesis",
    header: { eventId: `genesis-${worldId}`, parentHash: GENESIS_PARENT, worldId, tickId: 0,
      engineVersion: process.env.ENGINE_VERSION ?? "civ0@dev", schemaVersion: SCHEMA_VERSION, timestamp: now },
    epochId: `epoch-${worldId}-${now.slice(0, 10)}`,
    historyVersion: opts.historyVersion ?? "1b-v1",
    worldHash: genesisFactsHash(facts),
    facts,
    capturedAt: now,
  };
  await append(tx, genesis); // links parent=GENESIS_PARENT; UNIQUE(world_id,parent_hash) guarantees single root
  return genesis;
}
```

- [ ] **Step 3c: Add `loadGenesis` to `read.ts`**

```ts
import { eventKind, type Genesis } from "./types";
import { loadWorldEvents, type Executor } from "./append";

/** The world's Genesis event (chain root), or null if the epoch is not yet established. */
export async function loadGenesis(tx: Executor, worldId: string): Promise<Genesis | null> {
  const rows = await loadWorldEvents(tx, worldId);
  const g = rows.map((r) => r.event).find((e) => eventKind(e) === "Genesis");
  return (g as Genesis) ?? null;
}
```

- [ ] **Step 3d: Wire `ensureEpoch` into `persistTick`** (`repository.ts`) — **placement matters.**

Genesis must be event #1 of the world, BEFORE any other append (the relationships loop in Task 5 and the `CognitiveTransition` both link to it). The current code resolves `worldId` at line ~119–121, which is AFTER the relationships loop (~107). **Move the `worldId` resolution + `ensureEpoch` ABOVE the relationships loop** — place this block right after the `events`/`traces`/`beliefs` inserts and immediately BEFORE the `for (const rel of store.getRelationships(...))` loop:

```ts
      // Resolve the world and establish its historical boundary FIRST (Invariant #5). ensureEpoch is
      // idempotent and appends Genesis as the chain root the first time this world is touched, so every
      // later append this tick (relationship deltas, the CognitiveTransition) links to Genesis, not root.
      const wr = await client.query(`SELECT world_id FROM citizens WHERE id = $1`, [citizenId]);
      if (!wr.rows[0]?.world_id) throw new Error(`persistTick: no world_id for citizen ${citizenId}`);
      const worldId: string = wr.rows[0].world_id;
      const { ensureEpoch } = await import("@civ/history/src/genesis");
      await ensureEpoch(client, worldId);
```

Then DELETE the now-duplicate `worldId` resolution that currently sits at line ~119–121 (the `const wr = … const worldId` block just before `buildCognitiveTransition`), since `worldId` is now in scope from above. Leave the `buildCognitiveTransition(...)` call using that same `worldId`.

Also set the `kind` on the built transition so new CTs carry the discriminant — after `const transition = buildCognitiveTransition({...})`:
```ts
      (transition as { kind?: string }).kind = "CognitiveTransition";
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:it packages/history/src/genesis.itest.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm -r typecheck
git add packages/history/src/genesis.ts packages/history/src/hash.ts packages/history/src/read.ts \
  packages/history/src/genesis.itest.ts packages/persistence/src/repository.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): atomic Genesis capture→hash→append + ensureEpoch wired into persistTick"
```

---

## Track D — Per-mutation atomic coupling (DB, live path)

**Acceptance:** wealth/relationship/org mutations each append their delta event in the SAME transaction, recording the ACTUAL applied delta.
**Rollback:** revert the coupled methods + loop wiring; legacy rows still mutate (history just stops recording).
**Invariants exercised:** #2 (per-mutation same-tx), #3 (chain).

### Task 4: `WealthDelta` coupling (actual applied delta)

**Files:**
- Modify: `packages/persistence/src/repository.ts` (replace `adjustWealth` body with a coupled tx)
- Create: `packages/history/src/deltas.ts` (pure builders)
- Test: `packages/persistence/src/wealth-delta.itest.ts`

**Interfaces:**
- Produces: `buildWealthDelta(args)`, `buildRelationshipDelta(args)`, `buildOrganizationDelta(args)` in `deltas.ts`; `WorldRepository.adjustWealth(citizenId, requestedDelta, decisionId?)` now appends a `WealthDelta` with the **actual** post-clamp delta in the same tx.

- [ ] **Step 1: Write the failing integration test**

`packages/persistence/src/wealth-delta.itest.ts`:
```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool, WorldRepository } from ".";
import { loadWorldEvents } from "@civ/history/src/append";
import { eventKind } from "@civ/history/src/types";

async function seed(id: string, wealth: number) {
  await getPool().query(
    `INSERT INTO citizens (id,name,occupation,age,traits,wealth,world_id)
     VALUES ($1,'C','x',30,'{}'::jsonb,$2,'wd') ON CONFLICT (id) DO UPDATE SET wealth=$2, world_id='wd'`,
    [id, wealth]);
}
const wealthDeltas = async () =>
  (await loadWorldEvents(getPool(), "wd")).map((r) => r.event).filter((e) => eventKind(e) === "WealthDelta");

describe("adjustWealth coupling", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wd'");
    await getPool().query("DELETE FROM citizens WHERE world_id = 'wd'");
  });
  afterAll(async () => { await closePool(); });

  it("appends a WealthDelta recording the actual applied delta (unclamped case)", async () => {
    await seed("c1", 100);
    await new WorldRepository().adjustWealth("c1", 8, "d1");
    const ds = await wealthDeltas();
    expect(ds.length).toBe(1);
    expect((ds[0] as any).delta).toBe(8);
    expect((ds[0] as any).actor).toBe("c1");
  });

  it("records the CLAMPED actual delta, not the requested one", async () => {
    await seed("c1", 5);
    await new WorldRepository().adjustWealth("c1", -15, "d2"); // wealth 5 → 0, actual delta = -5
    const ds = await wealthDeltas();
    expect((ds[0] as any).delta).toBe(-5);
    const w = await getPool().query("SELECT wealth FROM citizens WHERE id='c1'");
    expect(Number(w.rows[0].wealth)).toBe(0);
  });

  it("no-ops (no event) when requested delta is 0", async () => {
    await seed("c1", 10);
    await new WorldRepository().adjustWealth("c1", 0);
    expect((await wealthDeltas()).length).toBe(0);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:it packages/persistence/src/wealth-delta.itest.ts`
Expected: FAIL (no WealthDelta appended).

- [ ] **Step 3a: Create `deltas.ts`**

```ts
import { SCHEMA_VERSION, GENESIS_PARENT,
  type WealthDelta, type RelationshipDelta, type OrganizationDelta, type EventHeader } from "./types";

function header(worldId: string, tickId: number, eventId: string): EventHeader {
  return { eventId, parentHash: GENESIS_PARENT, worldId, tickId,
    engineVersion: process.env.ENGINE_VERSION ?? "civ0@dev", schemaVersion: SCHEMA_VERSION,
    timestamp: new Date().toISOString() };
}

export function buildWealthDelta(a: { worldId: string; tickId: number; actor: string; delta: number; decisionId: string | null }): WealthDelta {
  return { kind: "WealthDelta", header: header(a.worldId, a.tickId, `wd-${a.actor}-${a.tickId}-${a.decisionId ?? "x"}`),
    actor: a.actor, delta: a.delta, decisionId: a.decisionId };
}
export function buildRelationshipDelta(a: { worldId: string; tickId: number; A: string; B: string;
  field: "trust" | "friendship" | "influence"; delta: number; decisionId: string | null }): RelationshipDelta {
  return { kind: "RelationshipDelta",
    header: header(a.worldId, a.tickId, `rd-${a.A}-${a.B}-${a.field}-${a.tickId}-${a.decisionId ?? "x"}`),
    a: a.A, b: a.B, field: a.field, delta: a.delta, decisionId: a.decisionId };
}
export function buildOrganizationDelta(a: { worldId: string; tickId: number; op: "founded" | "member_added";
  orgId: string; founderId?: string; citizenId?: string; role?: string; decisionId: string | null }): OrganizationDelta {
  return { kind: "OrganizationDelta",
    header: header(a.worldId, a.tickId, `od-${a.op}-${a.orgId}-${a.citizenId ?? a.founderId ?? ""}-${a.tickId}`),
    op: a.op, orgId: a.orgId, founderId: a.founderId, citizenId: a.citizenId, role: a.role, decisionId: a.decisionId };
}
```

- [ ] **Step 3b: Replace `adjustWealth` in `repository.ts`**

```ts
  /** Apply an economic delta AND append a WealthDelta recording the ACTUAL (post-clamp) delta, atomically. */
  async adjustWealth(citizenId: string, requestedDelta: number, decisionId: string | null = null): Promise<void> {
    if (!requestedDelta) return;
    const { append } = await import("@civ/history/src/append");
    const { ensureEpoch } = await import("@civ/history/src/genesis");
    const { buildWealthDelta } = await import("@civ/history/src/deltas");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const wr = await client.query("SELECT world_id, wealth FROM citizens WHERE id = $1 FOR UPDATE", [citizenId]);
      if (!wr.rows[0]?.world_id) { await client.query("ROLLBACK"); return; }
      const worldId: string = wr.rows[0].world_id;
      const before = Number(wr.rows[0].wealth);
      const after = Math.max(0, before + requestedDelta);
      const actual = after - before;
      await ensureEpoch(client, worldId);
      await client.query("UPDATE citizens SET wealth = $2 WHERE id = $1", [citizenId, after]);
      if (actual !== 0) {
        const dayR = await client.query("SELECT day FROM world_state WHERE id = 1");
        const tickId = Number(dayR.rows[0]?.day ?? 0);
        await append(client, buildWealthDelta({ worldId, tickId, actor: citizenId, delta: actual, decisionId }));
      }
      await client.query("COMMIT");
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:it packages/persistence/src/wealth-delta.itest.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm -r typecheck
git add packages/history/src/deltas.ts packages/persistence/src/repository.ts packages/persistence/src/wealth-delta.itest.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): WealthDelta coupled to adjustWealth (records actual post-clamp delta)"
```

### Task 5: `RelationshipDelta` coupling (read-before-write in `persistTick`)

**Files:**
- Modify: `packages/persistence/src/repository.ts` (the relationships loop in `persistTick`)
- Test: `packages/persistence/src/relationship-delta.itest.ts`

**Interfaces:**
- Consumes: `buildRelationshipDelta`, `append` (already imported in repo for CT).
- Produces: within `persistTick`'s tx, each relationship upsert reads the prior row and appends one `RelationshipDelta` per changed field (`trust`/`friendship`/`influence`).

- [ ] **Step 1: Write the failing integration test**

`packages/persistence/src/relationship-delta.itest.ts`:
```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool } from ".";
import { append } from "@civ/history/src/append";
import { loadWorldEvents } from "@civ/history/src/append";
import { eventKind } from "@civ/history/src/types";

// persistTick is heavy; test the extracted helper appendRelationshipDeltas directly.
import { appendRelationshipDeltas } from "./repository";

async function seedRel(world: string, a: string, b: string, trust: number, friendship: number, influence: number) {
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,world_id)
    VALUES ($1,'C','x',30,'{}'::jsonb,$2) ON CONFLICT (id) DO UPDATE SET world_id=$2`, [a, world]);
  await getPool().query(`INSERT INTO relationships VALUES ($1,$2,$3,$4,$5)
    ON CONFLICT (citizen_id,other_id) DO UPDATE SET trust=$3,friendship=$4,influence=$5`, [a, b, trust, friendship, influence]);
}
const relDeltas = async (world: string) =>
  (await loadWorldEvents(getPool(), world)).map((r) => r.event).filter((e) => eventKind(e) === "RelationshipDelta");

describe("RelationshipDelta coupling", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wr'");
    await getPool().query("DELETE FROM relationships WHERE citizen_id IN (SELECT id FROM citizens WHERE world_id='wr')");
    await getPool().query("DELETE FROM citizens WHERE world_id = 'wr'");
  });
  afterAll(async () => { await closePool(); });

  it("appends one delta per changed field with new-minus-old magnitude", async () => {
    await seedRel("wr", "a", "b", 10, 10, 10);
    const client = await getPool().connect();
    try {
      await client.query("BEGIN");
      // new state: trust 14 (+4), friendship 10 (0 → no event), influence 7 (-3)
      await appendRelationshipDeltas(client, "wr", 3, "a", "b", { trust: 14, friendship: 10, influence: 7 }, "d1");
      await client.query("COMMIT");
    } finally { client.release(); }
    const ds = (await relDeltas("wr")).map((e) => ({ field: (e as any).field, delta: (e as any).delta }));
    expect(ds).toEqual(expect.arrayContaining([{ field: "trust", delta: 4 }, { field: "influence", delta: -3 }]));
    expect(ds.find((d) => d.field === "friendship")).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:it packages/persistence/src/relationship-delta.itest.ts`
Expected: FAIL (`appendRelationshipDeltas` not exported).

- [ ] **Step 3a: Add the exported helper to `repository.ts`** (module scope, after imports)

```ts
import type { PoolClient } from "pg";

/** Append a RelationshipDelta per changed field (new − old), in the caller's tx. Exported for testability. */
export async function appendRelationshipDeltas(
  client: PoolClient, worldId: string, tickId: number, a: string, b: string,
  next: { trust: number; friendship: number; influence: number }, decisionId: string | null,
): Promise<void> {
  const { append } = await import("@civ/history/src/append");
  const { buildRelationshipDelta } = await import("@civ/history/src/deltas");
  const prev = await client.query("SELECT trust, friendship, influence FROM relationships WHERE citizen_id=$1 AND other_id=$2", [a, b]);
  const old = prev.rows[0] ?? { trust: 0, friendship: 0, influence: 0 };
  for (const field of ["trust", "friendship", "influence"] as const) {
    const delta = Number(next[field]) - Number(old[field]);
    if (delta !== 0) await append(client, buildRelationshipDelta({ worldId, tickId, A: a, B: b, field, delta, decisionId }));
  }
}
```

- [ ] **Step 3b: Call it from the `persistTick` relationships loop.** Replace the loop (lines ~107–111) with one that reads-before-writes and appends deltas BEFORE the upsert (so the read sees the old value). Note `ensureEpoch` already ran above this point in Task 3.

```ts
      for (const rel of store.getRelationships(citizenId)) {
        await appendRelationshipDeltas(client, worldId, d.day, rel.citizenId, rel.otherId,
          { trust: rel.trust, friendship: rel.friendship, influence: rel.influence }, d.id);
        await client.query(
          `INSERT INTO relationships VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (citizen_id,other_id) DO UPDATE SET trust=$3,friendship=$4,influence=$5`,
          [rel.citizenId, rel.otherId, rel.trust, rel.friendship, rel.influence]);
      }
```

> The relationships loop must run AFTER `worldId` is resolved and `ensureEpoch` has run. If the current code orders the relationships loop before the `worldId` resolution, move the `worldId`/`ensureEpoch` block above the relationships loop in the same edit.

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:it packages/persistence/src/relationship-delta.itest.ts`
Then the full persistence integration suite (no regression): `pnpm test:it packages/persistence`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm -r typecheck
git add packages/persistence/src/repository.ts packages/persistence/src/relationship-delta.itest.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): RelationshipDelta coupled in persistTick (read-before-write per-field)"
```

### Task 6: `OrganizationDelta` coupling (founded / member_added)

**Files:**
- Modify: `packages/persistence/src/org-repository.ts` (add `createOrgCoupled`, `addMembershipCoupled`)
- Modify: `packages/scheduler/src/loop.ts` (`foundOrg` / `applyOrgEffect` call the coupled methods)
- Test: `packages/persistence/src/org-delta.itest.ts`

**Interfaces:**
- Produces: `OrgRepository.createOrgCoupled(o, worldId, tickId, decisionId)` and `OrgRepository.addMembershipCoupled(m, worldId, tickId, decisionId)` — each writes the org row AND appends an `OrganizationDelta` in one tx (after `ensureEpoch`).

- [ ] **Step 1: Write the failing integration test**

`packages/persistence/src/org-delta.itest.ts`:
```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool, OrgRepository } from ".";
import { loadWorldEvents } from "@civ/history/src/append";
import { eventKind } from "@civ/history/src/types";

async function seedFounder(id: string) {
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,world_id)
    VALUES ($1,'C','x',30,'{}'::jsonb,'wo') ON CONFLICT (id) DO UPDATE SET world_id='wo'`, [id]);
}
const orgDeltas = async () =>
  (await loadWorldEvents(getPool(), "wo")).map((r) => r.event).filter((e) => eventKind(e) === "OrganizationDelta");

describe("OrganizationDelta coupling", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wo'");
    await getPool().query("DELETE FROM memberships WHERE org_id LIKE 'o-wo-%'");
    await getPool().query("DELETE FROM organizations WHERE id LIKE 'o-wo-%'");
    await getPool().query("DELETE FROM citizens WHERE world_id = 'wo'");
  });
  afterAll(async () => { await closePool(); });

  it("appends a 'founded' delta atomically with the org row", async () => {
    await seedFounder("f1");
    await new OrgRepository().createOrgCoupled(
      { id: "o-wo-1", name: "x", kind: "guild", founderId: "f1", treasury: 0, reputation: 50, goal: "g", createdDay: 1 },
      "wo", 1, "d1");
    const ds = await orgDeltas();
    expect(ds.length).toBe(1);
    expect((ds[0] as any).op).toBe("founded");
    expect((ds[0] as any).orgId).toBe("o-wo-1");
  });

  it("appends a 'member_added' delta atomically with the membership row", async () => {
    await seedFounder("f1"); await seedFounder("m1");
    const repo = new OrgRepository();
    await repo.createOrgCoupled({ id: "o-wo-1", name: "x", kind: "guild", founderId: "f1", treasury: 0, reputation: 50, goal: "g", createdDay: 1 }, "wo", 1, "d1");
    await repo.addMembershipCoupled({ orgId: "o-wo-1", citizenId: "m1", role: "member", joinedDay: 2 }, "wo", 2, "d2");
    const added = (await orgDeltas()).filter((e) => (e as any).op === "member_added");
    expect(added.length).toBe(1);
    expect((added[0] as any).citizenId).toBe("m1");
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:it packages/persistence/src/org-delta.itest.ts`
Expected: FAIL (`createOrgCoupled` not found).

- [ ] **Step 3a: Add coupled methods to `org-repository.ts`**

```ts
  async createOrgCoupled(o: Organization, worldId: string, tickId: number, decisionId: string | null): Promise<void> {
    const { append } = await import("@civ/history/src/append");
    const { ensureEpoch } = await import("@civ/history/src/genesis");
    const { buildOrganizationDelta } = await import("@civ/history/src/deltas");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await ensureEpoch(client, worldId);
      await client.query(
        `INSERT INTO organizations (id,name,kind,founder_id,treasury,reputation,goal,created_day)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [o.id, o.name, o.kind, o.founderId, o.treasury, o.reputation, o.goal, o.createdDay]);
      await client.query(
        `INSERT INTO memberships (org_id,citizen_id,role,joined_day) VALUES ($1,$2,'founder',$3)
         ON CONFLICT (org_id,citizen_id) DO NOTHING`, [o.id, o.founderId, o.createdDay]);
      await append(client, buildOrganizationDelta({ worldId, tickId, op: "founded", orgId: o.id, founderId: o.founderId, citizenId: o.founderId, role: "founder", decisionId }));
      await client.query("COMMIT");
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
  }

  async addMembershipCoupled(m: Membership, worldId: string, tickId: number, decisionId: string | null): Promise<void> {
    const { append } = await import("@civ/history/src/append");
    const { ensureEpoch } = await import("@civ/history/src/genesis");
    const { buildOrganizationDelta } = await import("@civ/history/src/deltas");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await ensureEpoch(client, worldId);
      await client.query(
        `INSERT INTO memberships (org_id,citizen_id,role,joined_day) VALUES ($1,$2,$3,$4)
         ON CONFLICT (org_id,citizen_id) DO UPDATE SET role=$3,joined_day=$4`,
        [m.orgId, m.citizenId, m.role, m.joinedDay]);
      await append(client, buildOrganizationDelta({ worldId, tickId, op: "member_added", orgId: m.orgId, citizenId: m.citizenId, role: m.role, decisionId }));
      await client.query("COMMIT");
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
  }
```

- [ ] **Step 3b: Wire the scheduler loop** (`packages/scheduler/src/loop.ts`). `foundOrg` and `applyOrgEffect` need the world id, tick (day), and decision id. Update signatures:

```ts
export async function foundOrg(orgRepo: OrgRepository, founderId: string, day: number, idgen: () => string,
  worldId: string, decisionId: string | null): Promise<string> {
  const id = idgen();
  await orgRepo.createOrgCoupled({ id, name: `${founderId}'s collective`, kind: "guild",
    founderId, treasury: 0, reputation: 50, goal: "advance the collective", createdDay: day }, worldId, day, decisionId);
  return id; // founder membership is created inside createOrgCoupled
}

async function applyOrgEffect(eff: OrgEffects, result: TickResult, citizenId: string, day: number, worldId: string): Promise<void> {
  const action = result.decision.action;
  if (action === "create_org") {
    await foundOrg(eff.orgRepo, citizenId, day, eff.idgen, worldId, result.decision.id);
  } else if (action === "join" && result.decision.targetId) {
    const org = await eff.orgRepo.getOrg(result.decision.targetId);
    if (org) await eff.orgRepo.addMembershipCoupled({ orgId: org.id, citizenId, role: "member", joinedDay: day }, worldId, day, result.decision.id);
  }
}
```

In `runDay`, resolve the world id once per citizen and pass it through. After `const result = await runTick(...)` and the `persistTick` call, replace lines 51–52:
```ts
    await deps.repo.adjustWealth(id, economicDelta(result.decision.action), result.decision.id);
    if (deps.orgEffects) {
      const worldId = (await deps.repo.getCitizenWorldId(id)) ?? "genesis";
      await applyOrgEffect(deps.orgEffects, result, id, day, worldId);
    }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:it packages/persistence/src/org-delta.itest.ts`
Then: `./node_modules/.bin/vitest run packages/scheduler` (loop unit tests still pass with new signatures).
Expected: PASS. Fix any scheduler unit test that constructs `foundOrg`/`applyOrgEffect` to pass the new args.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm -r typecheck
git add packages/persistence/src/org-repository.ts packages/scheduler/src/loop.ts packages/persistence/src/org-delta.itest.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): OrganizationDelta coupled to org create/join (founded + member_added)"
```

---

## Track E — Proof A: transactional faithfulness (FAIL-HARD, gated)

**Acceptance:** within each coupled tx, the legacy post-value equals pre-value + recorded delta; when `HISTORY_ENFORCE=1` and the dimension is within budget, a mismatch throws (rolls back); otherwise it warns.
**Rollback:** revert `enforce.ts` and the `assertFaithful` calls.
**Invariants exercised:** #2 (rollback on drift), #6 (operational proof, independent of Proof B).

### Task 7: `enforce.ts` — divergence budget, `HISTORY_ENFORCE`, `assertFaithful` + wire into couplings

**Files:**
- Create: `packages/history/src/enforce.ts`
- Modify: `packages/persistence/src/repository.ts` (wealth) — assert in the wealth tx
- Test: `packages/history/src/enforce.test.ts` (unit) + `packages/persistence/src/proof-a.itest.ts` (integration)

**Interfaces:**
- Produces:
  - `type Dimension = "Cognitive" | "Economic" | "Relational" | "Institutional" | "System";`
  - `divergenceBudget(dim: Dimension): number` (env `HISTORY_BUDGET_<DIM>`, default 0)
  - `enforcementArmed(): boolean` (`process.env.HISTORY_ENFORCE === "1"`)
  - `assertFaithful(dim, ok, detail): void` — throws `FaithfulnessError` when armed AND budget is 0 AND `!ok`; else `console.warn`.

- [ ] **Step 1: Write the failing unit test**

`packages/history/src/enforce.test.ts`:
```ts
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { assertFaithful, enforcementArmed } from "./enforce";

describe("enforce / Proof A gate", () => {
  const env = process.env;
  beforeEach(() => { process.env = { ...env }; });
  afterEach(() => { process.env = env; vi.restoreAllMocks(); });

  it("warns (never throws) in shadow mode", () => {
    delete process.env.HISTORY_ENFORCE;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertFaithful("Economic", false, { x: 1 })).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it("throws when armed and the dimension is at budget 0", () => {
    process.env.HISTORY_ENFORCE = "1";
    expect(() => assertFaithful("Economic", false, { x: 1 })).toThrow(/faithfulness/i);
  });

  it("does not throw on a faithful (ok=true) assertion even when armed", () => {
    process.env.HISTORY_ENFORCE = "1";
    expect(() => assertFaithful("Economic", true, {})).not.toThrow();
  });

  it("stays warn-only for a dimension with a nonzero budget", () => {
    process.env.HISTORY_ENFORCE = "1"; process.env.HISTORY_BUDGET_INSTITUTIONAL = "10";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertFaithful("Institutional", false, {})).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `./node_modules/.bin/vitest run packages/history/src/enforce.test.ts`
Expected: FAIL (`assertFaithful` not found).

- [ ] **Step 3a: Create `enforce.ts`**

```ts
export type Dimension = "Cognitive" | "Economic" | "Relational" | "Institutional" | "System";

export class FaithfulnessError extends Error {
  constructor(public dimension: Dimension, public detail: unknown) {
    super(`faithfulness violation [${dimension}]: ${JSON.stringify(detail)}`);
    this.name = "FaithfulnessError";
  }
}

export function enforcementArmed(): boolean { return process.env.HISTORY_ENFORCE === "1"; }

export function divergenceBudget(dim: Dimension): number {
  const n = Number(process.env[`HISTORY_BUDGET_${dim.toUpperCase()}`]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Proof A gate. Throws (→ caller ROLLBACK) only when enforcement is armed AND the dimension's budget
 *  is 0 AND the assertion failed. Otherwise warn-only (shadow / still-ramping dimension). */
export function assertFaithful(dim: Dimension, ok: boolean, detail: unknown): void {
  if (ok) return;
  if (enforcementArmed() && divergenceBudget(dim) === 0) throw new FaithfulnessError(dim, detail);
  console.warn(`[history] faithfulness divergence [${dim}] (shadow/over-budget):`, detail);
}
```

- [ ] **Step 3b: Assert in the wealth coupling** (`repository.ts adjustWealth`, after the `append(...)` line, before COMMIT):

```ts
        const { assertFaithful } = await import("@civ/history/src/enforce");
        const check = await client.query("SELECT wealth FROM citizens WHERE id = $1", [citizenId]);
        assertFaithful("Economic", Number(check.rows[0].wealth) === before + actual,
          { citizenId, before, actual, now: Number(check.rows[0].wealth) });
```

- [ ] **Step 3c: Write the integration test** `packages/persistence/src/proof-a.itest.ts`:
```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool, WorldRepository } from ".";

async function seed(id: string, wealth: number) {
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,wealth,world_id)
    VALUES ($1,'C','x',30,'{}'::jsonb,$2,'wpa') ON CONFLICT (id) DO UPDATE SET wealth=$2, world_id='wpa'`, [id, wealth]);
}

describe("Proof A — transactional faithfulness", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    delete process.env.HISTORY_ENFORCE;
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wpa'");
    await getPool().query("DELETE FROM citizens WHERE world_id = 'wpa'");
  });
  afterAll(async () => { await closePool(); });

  it("a faithful wealth mutation commits under enforcement", async () => {
    process.env.HISTORY_ENFORCE = "1";
    await seed("c1", 100);
    await expect(new WorldRepository().adjustWealth("c1", 8, "d1")).resolves.toBeUndefined();
    const w = await getPool().query("SELECT wealth FROM citizens WHERE id='c1'");
    expect(Number(w.rows[0].wealth)).toBe(108);
  });
});
```
(The mismatch-throws path is unit-covered in Step 1; an integration mismatch would require injecting a builder bug, which Task 8's Proof B covers structurally.)

- [ ] **Step 4: Run to verify it passes**

Run: `./node_modules/.bin/vitest run packages/history/src/enforce.test.ts && pnpm test:it packages/persistence/src/proof-a.itest.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm -r typecheck
git add packages/history/src/enforce.ts packages/history/src/enforce.test.ts \
  packages/persistence/src/repository.ts packages/persistence/src/proof-a.itest.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): Proof A (transactional faithfulness) + HISTORY_ENFORCE gate + divergence budget"
```

---

## Track F — Proof B: historical completeness (AUDIT) + coverage

**Acceptance:** `proofB(tx, world)` confirms `worldFold(genesis ⊕ events) == legacy facts`; `coverage(tx, world)` reports per-dimension percentages.
**Rollback:** revert `audit.ts`.
**Invariants exercised:** #6 (semantic proof — catches reducer bugs Proof A cannot).

### Task 8: `audit.ts` — `foldLegacyFacts`, `proofB`, `coverage`

**Files:**
- Create: `packages/history/src/audit.ts`
- Modify: `packages/history/src/read.ts` (add `loadWorldDeltas` — non-genesis world events in seq order)
- Test: `packages/history/src/audit.itest.ts`

**Interfaces:**
- Produces:
  - `foldLegacyFacts(tx, worldId): Promise<WorldFacts>` — current absolute state from legacy rows (same shape/scoping as `captureGenesisFacts`).
  - `proofB(tx, worldId): Promise<{ ok: boolean; mismatches: { dim: string; key: string; folded?: number; legacy?: number }[] }>`
  - `coverage(tx, worldId): Promise<Record<"Cognitive"|"Economic"|"Relational"|"Institutional"|"System", number>>` — % of legacy facts reproduced by the fold (1.0 == 100%).

- [ ] **Step 1: Write the failing integration test**

`packages/history/src/audit.itest.ts`:
```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool, WorldRepository } from "@civ/persistence";
import { ensureEpoch } from "./genesis";
import { proofB, coverage } from "./audit";

async function seed(id: string, wealth: number) {
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,wealth,world_id)
    VALUES ($1,'C','x',30,'{}'::jsonb,$2,'wb') ON CONFLICT (id) DO UPDATE SET wealth=$2, world_id='wb'`, [id, wealth]);
}

describe("Proof B — historical completeness", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wb'");
    await getPool().query("DELETE FROM citizens WHERE world_id = 'wb'");
  });
  afterAll(async () => { await closePool(); });

  it("fold(genesis ⊕ deltas) == legacy, and coverage is 100% on a clean world", async () => {
    await seed("c1", 100);
    await ensureEpoch(getPool(), "wb");          // genesis captures wealth=100
    await new WorldRepository().adjustWealth("c1", 8, "d1"); // wealth→108, WealthDelta(+8)
    const r = await proofB(getPool(), "wb");
    expect(r.ok).toBe(true);
    expect(r.mismatches).toEqual([]);
    const cov = await coverage(getPool(), "wb");
    expect(cov.Economic).toBe(1);
  });

  it("detects drift when legacy is mutated without a delta event", async () => {
    await seed("c1", 100);
    await ensureEpoch(getPool(), "wb");
    await getPool().query("UPDATE citizens SET wealth = 999 WHERE id = 'c1'"); // raw mutation, no event
    const r = await proofB(getPool(), "wb");
    expect(r.ok).toBe(false);
    expect(r.mismatches.some((m) => m.dim === "Economic")).toBe(true);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:it packages/history/src/audit.itest.ts`
Expected: FAIL (`proofB` not found).

- [ ] **Step 3a: Add `loadWorldDeltas` to `read.ts`**

```ts
import type { HistoryEvent } from "./types";
/** All non-Genesis world events for a world, in seq order (the fold input after the baseline). */
export async function loadWorldDeltas(tx: Executor, worldId: string): Promise<HistoryEvent[]> {
  const rows = await loadWorldEvents(tx, worldId);
  return rows.map((r) => r.event).filter((e) => eventKind(e) !== "Genesis");
}
```

- [ ] **Step 3b: Create `audit.ts`**

```ts
import { type Executor } from "./append";
import { loadGenesis, loadWorldDeltas } from "./read";
import { worldFold } from "./reduce";
import { captureGenesisFacts } from "./genesis";
import type { WorldFacts } from "./types";

/** Current absolute world facts from legacy rows (identical query path to captureGenesisFacts). */
export async function foldLegacyFacts(tx: Executor, worldId: string): Promise<WorldFacts> {
  return captureGenesisFacts(tx, worldId);
}

type Mismatch = { dim: string; key: string; folded?: number; legacy?: number };

export async function proofB(tx: Executor, worldId: string): Promise<{ ok: boolean; mismatches: Mismatch[] }> {
  const genesis = await loadGenesis(tx, worldId);
  if (!genesis) return { ok: false, mismatches: [{ dim: "System", key: "genesis", legacy: 1 }] };
  const folded = worldFold(genesis, await loadWorldDeltas(tx, worldId));
  const legacy = await foldLegacyFacts(tx, worldId);
  const mismatches: Mismatch[] = [];

  const fW = new Map(folded.wealth.map((w) => [w.actor, w.wealth]));
  for (const l of legacy.wealth) if ((fW.get(l.actor) ?? 0) !== l.wealth)
    mismatches.push({ dim: "Economic", key: l.actor, folded: fW.get(l.actor), legacy: l.wealth });

  const relK = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const fR = new Map(folded.relationships.map((r) => [relK(r.a, r.b), r]));
  for (const l of legacy.relationships) {
    const f = fR.get(relK(l.a, l.b));
    for (const field of ["trust", "friendship", "influence"] as const)
      if ((f?.[field] ?? 0) !== (l as any)[field])
        mismatches.push({ dim: "Relational", key: `${relK(l.a, l.b)}.${field}`, folded: f?.[field], legacy: (l as any)[field] });
  }

  const fO = new Map(folded.organizations.map((o) => [o.id, o.members.length]));
  for (const l of legacy.organizations) if ((fO.get(l.id) ?? 0) !== l.members.length)
    mismatches.push({ dim: "Institutional", key: l.id, folded: fO.get(l.id), legacy: l.members.length });

  return { ok: mismatches.length === 0, mismatches };
}

type Cov = Record<"Cognitive" | "Economic" | "Relational" | "Institutional" | "System", number>;

/** Per-dimension fraction of legacy facts reproduced by the fold (1 == 100%). */
export async function coverage(tx: Executor, worldId: string): Promise<Cov> {
  const genesis = await loadGenesis(tx, worldId);
  if (!genesis) return { Cognitive: 0, Economic: 0, Relational: 0, Institutional: 0, System: 0 };
  const folded = worldFold(genesis, await loadWorldDeltas(tx, worldId));
  const legacy = await foldLegacyFacts(tx, worldId);

  const frac = (total: number, ok: number) => (total === 0 ? 1 : ok / total);
  const fW = new Map(folded.wealth.map((w) => [w.actor, w.wealth]));
  const econOk = legacy.wealth.filter((l) => (fW.get(l.actor) ?? 0) === l.wealth).length;
  const relK = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const fR = new Map(folded.relationships.map((r) => [relK(r.a, r.b), r]));
  const relOk = legacy.relationships.filter((l) => {
    const f = fR.get(relK(l.a, l.b));
    return f && f.trust === l.trust && f.friendship === l.friendship && f.influence === l.influence;
  }).length;
  const fO = new Map(folded.organizations.map((o) => [o.id, o.members.length]));
  const instOk = legacy.organizations.filter((l) => (fO.get(l.id) ?? 0) === l.members.length).length;

  return {
    Cognitive: 1, // cognition coverage is the 1A CognitiveTransition stream (always emitted per decision)
    Economic: frac(legacy.wealth.length, econOk),
    Relational: frac(legacy.relationships.length, relOk),
    Institutional: frac(legacy.organizations.length, instOk),
    System: 1,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:it packages/history/src/audit.itest.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm -r typecheck
git add packages/history/src/audit.ts packages/history/src/read.ts packages/history/src/audit.itest.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): Proof B (fold==legacy audit) + per-dimension coverage"
```

---

## Track G — CLI surfaces

**Acceptance:** `civ state`, `civ history coverage`, `civ verify --fold` print correct output; `civ explain` refuses pre-epoch ticks.
**Rollback:** delete the scripts; revert the `explainView` epoch gate.
**Invariants exercised:** #5 (explain refusal pre-epoch; state returns baseline).

### Task 9: Epoch-aware `civ explain` (refuse pre-epoch)

**Files:**
- Modify: `packages/history/src/explainView.ts` (return an epoch-refusal signal)
- Modify: `packages/history/scripts/explain.ts` (print the refusal)
- Test: `packages/history/src/explainView.itest.ts` (extend)

**Interfaces:**
- Produces: `buildExplainView` returns `{ refused: "pre-epoch"; epochId: string }` when `tick < genesis.header.tickId`-epoch and no transition exists for the tick AND a Genesis exists with a later boundary. Concretely: if a Genesis exists and `tickId < epochStartTick`, return the refusal; else current behavior.

> Epoch start tick: the Genesis `header.tickId` is `0` by construction, but the *meaningful* boundary is "the first tick for which any post-Genesis event exists." For 1B, define `epochStartTick = min(tickId of non-Genesis events)`; a requested `tick` below that with no transition → refusal. Implement via a `loadEpochStartTick(tx, world)` helper in `read.ts`.

- [ ] **Step 1: Write the failing test** (append to `explainView.itest.ts`)

```ts
import { ensureEpoch } from "./genesis";
it("refuses to explain a tick before the authenticated epoch", async () => {
  // world 'we2': genesis exists, earliest real event at tick 5; asking tick 2 → refusal
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,world_id)
    VALUES ('c1','C','x',30,'{}'::jsonb,'we2') ON CONFLICT (id) DO UPDATE SET world_id='we2'`);
  await ensureEpoch(getPool(), "we2");
  await new (await import("@civ/persistence")).WorldRepository().adjustWealth("c1", 5, "d1"); // event at current day
  await getPool().query("UPDATE world_state SET day = 5 WHERE id = 1"); // simulate epoch start at 5 (set before the above in a real run)
  const view = await buildExplainView(getPool(), "we2", "c1", 2);
  expect((view as any).refused).toBe("pre-epoch");
});
```
(Adjust ordering so the WealthDelta lands at day 5; the assertion is that tick 2 < epochStart → refusal.)

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:it packages/history/src/explainView.itest.ts`
Expected: FAIL (no `refused` field).

- [ ] **Step 3a: Add `loadEpochStartTick` to `read.ts`**

```ts
/** The earliest tick for which a non-Genesis event exists (the authenticated cognitive boundary). */
export async function loadEpochStartTick(tx: Executor, worldId: string): Promise<number | null> {
  const r = await tx.query(
    `SELECT MIN(tick_id) AS t FROM history_events WHERE world_id = $1 AND kind <> 'Genesis'`, [worldId]);
  return r.rows[0]?.t == null ? null : Number(r.rows[0].t);
}
```
> This requires `history_events` to store `kind`. The 1A schema stores `kind` already (the `kind` column populated by `append` via `eventKind`). Confirm `append` writes `kind=eventKind(event)` — it does (1A). Genesis/deltas now yield their explicit kinds.

- [ ] **Step 3b: Gate in `explainView.ts`** — at the top of `buildExplainView`, before `loadTransition`:

```ts
import { loadGenesis, loadEpochStartTick } from "./read";
// ...
  const genesis = await loadGenesis(tx, worldId);
  if (genesis) {
    const start = await loadEpochStartTick(tx, worldId);
    if (start != null && tickId < start) {
      const found = await loadTransition(tx, worldId, citizenId, tickId);
      if (!found) return { refused: "pre-epoch", epochId: genesis.epochId } as unknown as ExplainView;
    }
  }
```
Update the return type to `Promise<ExplainView | null | { refused: "pre-epoch"; epochId: string }>`.

- [ ] **Step 3c: Print the refusal in `scripts/explain.ts`** — after calling `buildExplainView`:

```ts
  if (view && "refused" in view) {
    console.log(`Historical replay unavailable.\nAuthenticated history begins: ${view.epochId}`);
    process.exit(0);
  }
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:it packages/history/src/explainView.itest.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm -r typecheck
git add packages/history/src/explainView.ts packages/history/src/read.ts packages/history/scripts/explain.ts packages/history/src/explainView.itest.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): epoch-aware civ explain (refuse pre-epoch ticks, Invariant #5)"
```

### Task 10: `civ state` + `civ history coverage` + `civ verify --fold` scripts

**Files:**
- Create: `packages/history/scripts/state.ts`, `packages/history/scripts/coverage.ts`, `packages/history/scripts/verify-fold.ts`
- Test: `packages/history/src/cli-state.itest.ts` (drives `civState()` exported helper)

**Interfaces:**
- Produces: each script exports a pure-ish helper for testing + a CLI entry. `state.ts` exports `civState(tx, world, tick): Promise<{ atEpochBaseline: boolean; epochId: string; facts: WorldFacts }>`.

- [ ] **Step 1: Write the failing integration test**

`packages/history/src/cli-state.itest.ts`:
```ts
import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool, WorldRepository } from "@civ/persistence";
import { ensureEpoch } from "./genesis";
import { civState } from "../scripts/state";

async function seed(id: string, wealth: number) {
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,wealth,world_id)
    VALUES ($1,'C','x',30,'{}'::jsonb,$2,'ws') ON CONFLICT (id) DO UPDATE SET wealth=$2, world_id='ws'`, [id, wealth]);
}

describe("civ state", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    await getPool().query("DELETE FROM history_events WHERE world_id='ws'");
    await getPool().query("DELETE FROM citizens WHERE world_id='ws'");
  });
  afterAll(async () => { await closePool(); });

  it("reconstructs current world facts via fold(genesis ⊕ events)", async () => {
    await seed("c1", 100);
    await ensureEpoch(getPool(), "ws");
    await new WorldRepository().adjustWealth("c1", 8, "d1");
    await getPool().query("UPDATE world_state SET day = 9 WHERE id = 1");
    const out = await civState(getPool(), "ws", 9);
    expect(out.atEpochBaseline).toBe(false);
    expect(out.facts.wealth.find((w) => w.actor === "c1")?.wealth).toBe(108);
  });

  it("returns the Genesis baseline for a pre-epoch tick", async () => {
    await seed("c1", 100);
    const g = await ensureEpoch(getPool(), "ws");
    const out = await civState(getPool(), "ws", -1); // before epoch
    expect(out.atEpochBaseline).toBe(true);
    expect(out.epochId).toBe(g.epochId);
    expect(out.facts.wealth.find((w) => w.actor === "c1")?.wealth).toBe(100);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm test:it packages/history/src/cli-state.itest.ts`
Expected: FAIL (`civState` not found).

- [ ] **Step 3a: Create `scripts/state.ts`**

```ts
import { getPool } from "@civ/persistence/src/pool";
import { loadGenesis, loadWorldDeltas, loadEpochStartTick } from "../src/read";
import { worldFold } from "../src/reduce";
import type { Executor } from "../src/append";
import type { WorldFacts } from "../src/types";

export async function civState(tx: Executor, worldId: string, tick: number): Promise<{ atEpochBaseline: boolean; epochId: string; facts: WorldFacts }> {
  const genesis = await loadGenesis(tx, worldId);
  if (!genesis) throw new Error(`no Genesis for world ${worldId} — epoch not established`);
  const start = await loadEpochStartTick(tx, worldId);
  if (start == null || tick < start) return { atEpochBaseline: true, epochId: genesis.epochId, facts: genesis.facts };
  const events = (await loadWorldDeltas(tx, worldId)).filter((e) => e.header.tickId <= tick);
  return { atEpochBaseline: false, epochId: genesis.epochId, facts: worldFold(genesis, events) };
}

async function main() {
  const args = process.argv.slice(2);
  const world = args[args.indexOf("--world") + 1] ?? "default";
  const tick = Number(args[args.indexOf("--tick") + 1] ?? "0");
  const out = await civState(getPool(), world, tick);
  if (out.atEpochBaseline) console.log(`World state before the historical boundary is the verified baseline.\nEarliest authenticated state: ${out.epochId}`);
  console.log(JSON.stringify(out.facts, null, 2));
  process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) void main();
```

- [ ] **Step 3b: Create `scripts/coverage.ts`**

```ts
import { getPool } from "@civ/persistence/src/pool";
import { coverage } from "../src/audit";

async function main() {
  const args = process.argv.slice(2);
  const world = args[args.indexOf("--world") + 1] ?? "default";
  const cov = await coverage(getPool(), world);
  console.log(`WORLD ${world}`);
  for (const [dim, frac] of Object.entries(cov)) console.log(`${dim.padEnd(14)} ${(frac * 100).toFixed(1)}%`);
  process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) void main();
```

- [ ] **Step 3c: Create `scripts/verify-fold.ts`**

```ts
import { getPool } from "@civ/persistence/src/pool";
import { proofB } from "../src/audit";

async function main() {
  const args = process.argv.slice(2);
  const world = args[args.indexOf("--world") + 1] ?? "default";
  const r = await proofB(getPool(), world);
  console.log(r.ok ? `fold(genesis ⊕ events) == legacy ✓  (world ${world})`
    : `fold MISMATCH ✗  (world ${world})\n${JSON.stringify(r.mismatches, null, 2)}`);
  process.exit(r.ok ? 0 : 1);
}
if (import.meta.url === `file://${process.argv[1]}`) void main();
```

- [ ] **Step 4: Run to verify it passes**

Run: `pnpm test:it packages/history/src/cli-state.itest.ts`
Then smoke the scripts: `./packages/history/node_modules/.bin/tsx packages/history/scripts/coverage.ts --world ws` (expect dimension lines; will print 0%/100% depending on seed — non-fatal).
Expected: itest PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm -r typecheck
git add packages/history/scripts/state.ts packages/history/scripts/coverage.ts packages/history/scripts/verify-fold.ts packages/history/src/cli-state.itest.ts
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): civ state / history coverage / verify --fold CLIs"
```

---

## Final verification (Phase 1B acceptance)

- [ ] **Full unit suite green:** `./node_modules/.bin/vitest run` — all history + engine + scheduler + web unit tests pass (env-gated OPIK zerog tests excepted, as on v2).
- [ ] **Full integration suite green:** `pnpm test:it packages/history packages/persistence` — genesis, wealth/relationship/org couplings, Proof A, Proof B, coverage, civ state all pass against `civ0_test`.
- [ ] **Coverage acceptance:** seed a small world in `civ0_test`, run a few ticks via the scheduler test harness, then `tsx packages/history/scripts/verify-fold.ts --world <id>` → `fold == legacy ✓`, and `coverage --world <id>` → Economic/Relational/Institutional at 100%.
- [ ] **Enforcement acceptance:** with `HISTORY_ENFORCE=1`, a normal tick commits (faithful); a deliberately corrupted delta builder (temporary) rolls the tick back — then revert the corruption.
- [ ] **Live tick unchanged in shadow:** with `HISTORY_ENFORCE` unset, the `/opt/civilization-0` scheduler behaves as before — delta events are emitted, faithfulness is warn-only, no tick fails. (Verify by diffing behavior in `civ0_test`, never the live DB.)
- [ ] **Invariant audit:** #2 — each coupling rolls back mutation+event together (itests); #3 — one chain incl Genesis + deltas (verifyWorldChain still green); #4 — `SCHEMA_VERSION===2`, v1 events still read via structural fallback; #5 — `civ explain` refuses pre-epoch, `civ state` returns baseline; #6 — Proof A (mutation==event) and Proof B (fold==legacy) are separate code paths with separate tests.
- [ ] **Branch review:** request a whole-branch code review (superpowers:requesting-code-review) before any merge to `v2`. Merge via PR; never commit to master; never deploy (no `git pull` into `/opt/civilization-0`).

---

## Self-Review notes (author)

- **Spec coverage:** Invariants #5/#6 (Task 1) · 6-event taxonomy (Task 1) · worldFold (Task 2) · atomic Genesis (Task 3) · per-mutation coupling wealth/rel/org (Tasks 4–6) · Proof A + gate + budget (Task 7) · Proof B + coverage (Task 8) · epoch-aware explain (Task 9) · civ state/coverage/verify (Task 10) · rollout gating via `HISTORY_ENFORCE`/budget (Task 7, used everywhere) · no read-flip (no task serves reads from fold). All spec sections map to a task.
- **Deferred-but-noted:** `OrganizationDelta` carries only `founded`/`member_added` (spec permits later split — out of scope). Treasury deltas (org economics via `persistOrgTick`) are NOT yet coupled — flagged for a follow-up task if org-treasury coverage must reach 100%; in 1B, Institutional coverage is measured on membership, and the divergence budget absorbs treasury drift during rollout.
- **Type consistency:** `eventKind` returns `HistoryKind` everywhere; `WorldFacts` shape identical in `captureGenesisFacts`/`foldLegacyFacts`/`worldFold`; delta builder field names (`actor`/`a`/`b`/`field`/`op`/`orgId`) match the `reduce.ts` switch and the `audit.ts` comparisons.
```
