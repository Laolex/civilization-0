# `@civ/history` Phase 1B — Coverage Hardening & Fail-Hard Faithfulness (Design)

> Status: **APPROVED / FROZEN** (2026-06-30). Builds on Phase 1A (`docs/superpowers/specs/2026-06-27-history-event-engine-design.md`, implemented + reviewed, landed on `v2`). Part of the Civ-0 substrate pivot: *history becomes a programmable, verifiable, replayable primitive.*

## One-line thesis

**Phase 1B raises `coverage(history)` while holding `authority(history)` fixed.** History becomes *verification truth* (it can faithfully reconstruct and verify world state); it does **not** become *serving truth* (reads stay on legacy rows). The phase ends when `fold(genesis ⊕ history)` reproduces the live world state exactly, under fail-hard enforcement, for every world.

## Where 1B sits on the ladder

```
1A   history = shadow,            faithfulness = warn,       coverage = cognition only      [DONE → v2]
1B   history = verification truth, faithfulness = FAIL-HARD,  coverage = world mutations      [THIS SPEC]
2    history = serving truth,      rows = read model
3    world_state = fold(events)
```

**Do not compress phases.** Serving any production read from `fold(history)` is Phase 2 and is explicitly **out of scope** here.

---

## The two histories (keystone distinction)

| | Pre-epoch | Post-epoch |
|---|---|---|
| **World history** — foldable, verifiable | ✅ via the Genesis baseline (verified aggregate *at* the boundary) | ✅ via delta events |
| **Cognitive history** — foldable, verifiable, **replayable** | ❌ refused (Invariant #5) | ✅ via `CognitiveTransition` |

```
World history     = programmable + verifiable
Cognitive history = programmable + verifiable + replayable
```

Not all history is cognition. Pre-epoch we can reconstruct/verify world *state* from a verified baseline; we cannot and will not replay *cognition* that occurred before provenance existed.

---

## Provenance Invariants

Invariants **#1–#4** are inherited verbatim from Phase 1A (authenticated-cognition-only; mutation⇔history same-tx; append-only/tamper-evident chain; schema permanence). 1B adds two.

### Provenance Invariant #5 — Historical Boundary

```
Authenticated cognitive history begins at an explicit per-world historical
boundary (the Genesis event).

Events preceding that boundary are represented only as verified world-state
facts and are not replayable cognitive history.

No pre-boundary cognition may be reconstructed, inferred, synthesized, or
presented as historical fact.
```

The third sentence permanently closes the synthetic-backfill loophole.

### Provenance Invariant #6 — Independent Verification

```
The operational correctness of history and the semantic correctness of
history are verified independently.

Transaction-level faithfulness (Proof A) proves that events accurately
record mutations.

Historical completeness (Proof B) proves that reductions accurately
reconstruct world state.
```

---

## Definition of Done (frozen)

> **Phase 1B is complete when, for every world, an explicit historical boundary and a verified Genesis state are recorded; all post-boundary world mutations (wealth, relationship, organization) emit authenticated history events atomically with the mutation; and `fold(genesis ⊕ history)` reproduces the live world state exactly under fail-hard enforcement — while all production reads continue to be served from legacy rows.**

---

## §2 Event model

A shared envelope; the taxonomy grows from 2 kinds to 6 (deliberately small).

```ts
type HistoryKind =
  | "Genesis" | "CognitiveTransition"
  | "WealthDelta" | "RelationshipDelta" | "OrganizationDelta"
  | "Anchor";

interface HistoryEnvelope {
  kind: HistoryKind;
  header: EventHeader;   // 1A header: eventId, parentHash, worldId, tickId, engineVersion, schemaVersion, timestamp
}

// World-history boundary. The chain ROOT of every world (parent = GENESIS_PARENT zero hash).
interface Genesis extends HistoryEnvelope {            // kind: "Genesis"
  epochId: string;            // e.g. epoch-<worldId>-2026-07-01
  historyVersion: string;     // e.g. "1b-v1" — replay tooling dispatches on epoch semantics
  worldHash: Hash;            // JCS hash of the captured facts (tamper-evident baseline)
  wealthState: { actor: string; wealth: number }[];
  relationshipState: { a: string; b: string; trust: number; friendship: number }[];
  organizationState: { id: string; members: { citizenId: string; role: string }[] }[];
  capturedAt: string;         // ISO
}

interface CognitiveTransition extends HistoryEnvelope { /* unchanged from 1A */ }

// Delta events: reducer algebra is explicit — state(t+1) = state(t) + delta.
interface WealthDelta extends HistoryEnvelope {        // kind: "WealthDelta"
  actor: string; delta: number; decisionId: string;
}
interface RelationshipDelta extends HistoryEnvelope {  // kind: "RelationshipDelta"
  a: string; b: string; field: "trust" | "friendship"; delta: number; decisionId: string;
}
interface OrganizationDelta extends HistoryEnvelope {  // kind: "OrganizationDelta"
  op: "founded" | "member_added"; orgId: string; citizenId?: string; role?: string; decisionId: string;
}

interface Anchor extends HistoryEnvelope { /* unchanged from 1A */ }
```

All six share the **one per-world hash chain** and JCS hashing from 1A (Invariant #3 unchanged). Delta events carry **deltas, not cognition** — they are built in the persistence/scheduler layer, so the **engine still imports nothing from `@civ/history`**. `reduce` dispatches per kind → this *is* the Phase-3 `world_state = fold(events)` shape, now being born:

```
world_state = genesis ⊕ Σ WealthDelta ⊕ Σ RelationshipDelta ⊕ Σ OrganizationDelta
```

---

## §3 Atomic coupling & live-path changes

Each mutation becomes self-coupling — mutation **+** its delta event in **one transaction** (Invariant #2, per mutation):

```
persistTick(tx)    →  CognitiveTransition  +  RelationshipDelta×N   (already one tx — add the deltas)
adjustWealth(tx)   →  wealth write          +  WealthDelta          (was a bare post-commit query → becomes a tx)
applyOrgEffect(tx) →  org write             +  OrganizationDelta    (was post-commit → becomes a tx)
```

The scheduler loop's current post-commit calls (`runDay` lines 51–52) stop being bare repo calls; each wraps its write + append.

**Partial-tick is not a violation.** A tick may be "decision committed, wealth tx rolled back" — but the wealth mutation *and* its event roll back **together**, so `fold(wealth) == legacy(wealth)` still holds. History faithfully records whatever actually happened. The crucial invariant is `applied mutation ⇔ history event`, **not** "all mutations in a tick succeed together" — because Phase 3 wants `world_state = fold(independent world events)`, not `fold(monolithic tick commits)`.

---

## §4 Genesis / epoch mechanics

Epoch is established **per world, lazily**: before appending the first post-epoch event for a world, check for a Genesis event; if absent, **atomically** `capture → hash → append` the Genesis (one transaction, so we never capture state A and hash state B under a race):

1. In a transaction, read the world's current legacy facts (all wealth, relationships, orgs/memberships).
2. Compute `worldHash = JCS-hash(facts)`.
3. Append `Genesis{…}` as the **chain root** (parent = `GENESIS_PARENT`).
4. Commit.

Genesis is always event #1 of a world. A world with non-Genesis events predating 1B is **out of scope** (the live world has zero history events today; every world 1B touches starts clean — and integration tests reset the world, so Genesis is always first). Note the existing 1A anti-fork index `UNIQUE(world_id, parent_hash)` already **enforces** this: exactly one event per world may have `parent = GENESIS_PARENT`, and in 1B that event must be the Genesis — so a second root (or a stray pre-Genesis event) is structurally rejected, not merely discouraged.

```
WorldHistory(world) = Genesis ⊕ EventStream(world)
```

---

## §5 Two independent proofs (the fail-hard split)

`fold(genesis ⊕ events) == state` is an **audit** proof, not the operational safety proof. 1B therefore defines two proofs that catch two independent failure modes.

### Proof A — Transactional Faithfulness  (FAIL-HARD, every write)

```
applied_delta == recorded_delta
```

Runs inside every mutation's transaction. The delta written to the legacy row must equal the delta recorded in the event; mismatch → ROLLBACK (the whole mutation tx unwinds, Invariant #2). O(1), on the hot path. Catches **failure mode 1: `mutation ≠ recorded event`** (dual-write drift).

### Proof B — Historical Completeness  (AUDIT, periodic / on-demand)

```
fold(genesis ⊕ events) == legacy_state
```

Recomputes absolute world state from the event log and compares to legacy rows. O(n), **never on the hot path** — run by `civ verify --fold` and behind `civ history coverage`. Catches **failure mode 2: `event-stream ≠ reducer-semantics`** (a reducer bug Proof A cannot see, because Proof A never exercises the reducers).

> The inductive claim "every delta == applied mutation ⇒ fold == state" holds **only if the reducers are correct.** Proof A guarantees the antecedent; Proof B guarantees the reducers. Both are required; neither subsumes the other (Invariant #6).

---

## §6 CLI surfaces

- **`civ explain --citizen C --tick T`** — `T ≥ epoch` → authenticated cognitive trace (1A behavior). `T < epoch` → **refuses**:
  ```
  Historical replay unavailable.
  Authenticated history begins: <epochId>
  ```
- **`civ state --world W --tick T`** *(new)* — `T ≥ epoch` → world state via `fold(genesis ⊕ events≤T)`. `T < epoch` → returns the **Genesis baseline** with a note: *"earliest authenticated state is `<epoch>`; per-tick reconstruction begins there."* (World history pre-epoch = the verified aggregate at the boundary, not a fabricated per-tick past.)
- **`civ history coverage --world W`** *(new)* — per dimension, the fraction of post-epoch legacy mutations that have a matching delta event:
  ```
  WORLD alpha
  Cognitive      100%
  Economic       100%
  Relational      99.8%
  Institutional   93.1%
  System         100%
  ```
  Answers the operational question *"can I trust history yet?"*.
- **`civ verify --fold --world W`** *(new)* — runs Proof B explicitly (the O(n) audit backstop).

---

## §7 Rollout, gating & testing

**Migration control plane** — emit before enforce, per dimension:

```
shadow  →  coverage  →  enforcement        (never: build → flip → pray)
```

- **`HISTORY_ENFORCE`** — unset/`0` = shadow (emit events + warn on drift, like 1A's warn-only); `1` = enforcement *enabled* (Proof A may roll back on drift). **Default off**, so even if `v2` were deployed, live behavior is unchanged until a deliberate flip.
- **History divergence budget** — per-dimension `MAX_DIVERGENCE` (e.g. Cognitive 0, Economic 0, Relational 0, Institutional 10 during rollout). The global flag and per-dimension staging reconcile as follows: **a dimension hard-fails (Proof A rolls back) only when `HISTORY_ENFORCE=1` AND that dimension is within budget (coverage at/above its threshold).** A dimension still ramping (coverage below threshold / over budget) stays **warn-only even under `HISTORY_ENFORCE=1`**. So one global switch arms enforcement; each dimension's budget decides whether it's actually live. An explicit migration knob per dimension.
- **Staged per dimension** — emit + shadow-verify each dimension to 100% coverage *before* flipping its enforcement on. Autonomy-freeze risk is controlled by: not-deployed during dev + shadow-first + per-dimension staging.
- **Branch isolation** — all work on `feat/history-1b-coverage` (worktree `/opt/civilization-0-1b`) off `v2`; never master; never the live `/opt/civilization-0` checkout. Not deployed during development.
- **Tests** — unit (envelope, the four reducers + fold, delta builders, genesis capture/hash, Proof A, Proof B) are network-free; DB tests are `*.itest.ts` against **`civ0_test` only** (atomic coupling, fail-hard rollback, genesis-is-chain-root, `fold==legacy`, coverage math). Live 0G anchor stays gated/manual.

---

## Build order (do NOT reorder)

```
envelope + 6 event types + Invariants #5/#6
        ↓
delta reducers + fold(genesis ⊕ events)           (pure, no DB)
        ↓
Genesis capture→hash→append (atomic)              (DB)
        ↓
per-mutation atomic coupling: WealthDelta, RelationshipDelta, OrganizationDelta   (DB, live-path)
        ↓
Proof A (transactional faithfulness, fail-hard, gated by HISTORY_ENFORCE)
        ↓
Proof B (historical completeness, audit) + coverage math
        ↓
CLI: civ state, civ history coverage, civ verify --fold, epoch-aware civ explain
        ↓
rollout staging (shadow → coverage → enforce, divergence budget)
```

Enforcement is a **safety/operational** layer; reducers + fold are the **correctness** layer. Enforcement must never gate correctness, and no dimension is enforced before its coverage proves out.

---

## Out of scope (explicit)

- **No read-path flip.** Zero production reads served from `fold(history)` — that is Phase 2.
- **No new event kinds** beyond the six. `OrganizationDelta` may later split (`MembershipRemoved`, `RoleChanged`, …) — not in 1B.
- **No synthetic/backfilled pre-epoch history** (Invariant #5).
- **No brain/engine interface change.** The engine stays history-agnostic.
- **No live 0G anchor on the hot path** (unchanged from 1A; gated/manual).
