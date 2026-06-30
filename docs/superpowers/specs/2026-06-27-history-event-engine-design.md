# `@civ/history` — Event Engine Phase 1A (Walking Skeleton) — Design Spec

**Date:** 2026-06-27
**Branch:** `feat/history-event-engine` (worktree `/opt/civilization-0-history`)
**Status:** approved (brainstorming complete; user-ratified with 5 amendments + Invariant #3)
**Substrate phase:** Phase 1 (Events) — built as a vertical *walking skeleton* that touches a thin slice of Phases 1→3 to validate the thesis, not just the log.

---

## Thesis this serves

> **History becomes a programmable, verifiable, replayable primitive.**

> **Civ-0 does not regenerate the past. It reconstructs and verifies the recorded history of autonomous cognition and world-state transitions.**

The civilization is the stress test. The product is the substrate: an append-only, hash-chained, 0G-anchored log of authenticated cognition + world-state transitions, from which any moment can be folded back and explained. This spec is the *flight recorder* — built before the operating system, which is the correct order.

## Governing invariants (binding — copy verbatim into code docs)

- **Invariant #1 — Authenticated cognition only.** Civ-0 records only authenticated cognition. If a cognitive artifact was not explicitly produced by the executing runtime, it MUST NOT be reconstructed, inferred, estimated, or presented as historical fact. Unknown cognition remains unknown (`null`), and surfaces in the UI as "unavailable" — never a fabricated value.
- **Invariant #2 — Mutation ⇔ history (bidirectional).** Every committed world mutation MUST have a corresponding authenticated *world-mutating* history event (a `CognitiveTransition`), and every world-mutating history event MUST correspond to a committed world mutation. Both are written in the same DB transaction; neither may exist without the other. No orphan mutations, no orphan cognition. (System events such as `Anchor` are not world mutations: they are exempt from the ⇔ but still bound by Invariant #3.)
- **Invariant #3 — Append-only.** History is append-only. No historical event may be modified, deleted, reordered, or recomputed. Corrections are represented only as new events.
- **Invariant #4 — Schema permanence.** Historical events are interpreted according to the `schemaVersion` recorded at the time of emission. Schema evolution MUST preserve the ability to reconstruct historical meaning without reinterpretation — a 2026 `CognitiveTransition v1` is always read with v1 semantics, never silently re-read under a later schema. This is why `schemaVersion` lives in the header and why readers dispatch on it.

These four invariants are the spec. Everything below serves them.

## Phase 1A acceptance test (the only definition of "done")

> A historical cognitive trace can be reconstructed, verified, and explained from the append-only history log **without altering live civilization behavior.**

Concretely:
```
civ explain --citizen <id> --tick <day>
```
returns an authenticated, replayable cognitive trace — folded from the history log, hash-chain verified, 0G-anchored — while the live scheduler tick behaves byte-for-byte as before.

### Phase 1A failure conditions (scope guard — any one means 1A is not done)
Phase 1A **fails** if:
- `fold(history)` diverges from legacy state (Faithfulness Proof broken),
- a committed world mutation exists without a corresponding history event,
- a world-mutating history event exists without a committed mutation,
- replay requires *recomputation* of cognition (rather than reconstruction of recorded cognition),
- any cognitive field is *inferred* rather than recorded (Invariant #1 breach),
- live civilization behavior changes in any observable way.

## Scope

Walking skeleton: the **full spine for ONE fat event type, end-to-end** — emit → hash-chain → merkle → 0G anchor → `fold(history)` → `project()` → `civ explain` — dual-written transactionally alongside the untouched live tick. Proves emit→anchor→replay works on a narrow slice before widening.

### Non-goals (explicit — deferred to later phases)
- **No truth-flip.** Legacy rows (`decisions`/`events`/`citizens`/…) remain the source of truth; history is a *shadow*. Flipping `db = cache` is Phase 1B/Phase 2 (after the Faithfulness Proof holds at 100% for weeks).
- **No candidate scoring, no belief-deltas** (Invariant #1). `candidates` and `beliefDelta` are `null` in 1A. They fill in via the *fidelity ladder* (below), not now — and never by inference.
- **No brain-interface change.** `brain.decide()` is untouched; 1A records only what the runtime already produces.
- **No replacement of the existing per-decision 0G trace archival.** Old provenance + new history coexist in 1A (additive).
- No institutions / economy / governance / markets / zk. Only `CognitiveTransition` + `Anchor` events are emitted (the wider `WorldEvent` / `SystemEvent` taxonomy waits).

### Two ladders (kept separate, never reordered)
- **Substrate ladder:** Events → State → Replay → Authenticity → Verification. This spec = a vertical slice of Events→State→Replay.
- **Fidelity ladder** (how the `null` cognition fields fill over time, *inside* the substrate): recorded cognition (1A) → candidate generation → utility scoring → belief transitions. Each step requires the runtime to genuinely produce the artifact first (Invariant #1).

### Migration ladder (where 1A sits)
- **1A — rows = truth, history = shadow** ← this spec.
- 1B — rows = cache, history = shadow truth, continuous faithfulness verification.
- Phase 2 — history = truth, rows = read-model.
- Phase 3 — `world_state = fold(events)`.

## Data model

```ts
// ── chain identity ───────────────────────────────────────────────
type EventId = string;
type Hash = string;          // hex, sha-256

interface EventHeader {
  eventId: EventId;
  parentHash: Hash;          // prior event in this world's chain (chronology)
  causalParents?: EventId[]; // events that caused this one (causality) — present, unused in 1A
  worldId: string;
  tickId: number;            // = day in current engine
  engineVersion: string;     // attributability: which engine produced this
  schemaVersion: number;
  timestamp: string;         // ISO
}

// ── what the agent perceived (NOT the prompt) ────────────────────
interface Observation {
  query: string;             // goal + world headline (real, today)
  worldHeadline?: string;
  observedEntities?: string[];
  observationHash?: string;
}

// ── provenance identity of the run (for future auditors) ─────────
interface ExecutionContext {
  provider: string;          // e.g. "0g-compute"
  modelId: string;
  modelVersion: string;
  promptHash: string;
  worldHash: string;
  runtimeHash?: string;
  temperature?: number;
  seed?: number;
  verified: boolean;         // 0G Compute TEE attestation (real, today)
}

// ── the world mutation this cognition produced ───────────────────
interface WorldDelta {
  relationshipsChanged: { a: string; b: string; field: string; from: number; to: number }[];
  wealthTransferred: { actor: string; delta: number }[];
  eventsCreated: { id: string; type: string; targetId: string | null }[];
}

interface WeightedMemory { id: string; weight: number; summary?: string }
interface WeightedBelief { id: string; weight: number; statement?: string }
// SocialDriver reuses @civ/shared's SocialDriver (GraphRAG, already shipped)

// 1A: these are always null (Invariant #1). Shapes defined now so the schema is stable.
interface CandidateEvaluation { action: string; utility?: number; confidence?: number; rationale?: string }
interface BeliefDelta { beliefId: string; before: number; after: number; justification?: string }

// ── the one fat event ────────────────────────────────────────────
interface CognitiveTransition {
  header: EventHeader;
  actor: string;
  observation: Observation;
  retrievedMemories: WeightedMemory[];   // real
  retrievedBeliefs: WeightedBelief[];    // real
  socialDrivers: SocialDriver[];         // real (GraphRAG)
  availableActions: string[];            // the candidate SET (real)
  selectedAction: string;
  reasoning: string;                     // real
  worldDelta: WorldDelta | null;         // real
  execution: ExecutionContext;           // real
  candidates: CandidateEvaluation[] | null; // null in 1A (Invariant #1)
  beliefDelta: BeliefDelta | null;          // null in 1A (Invariant #1)
}

// System event recording an anchor (also append-only)
interface AnchorEvent {
  header: EventHeader;       // schemaVersion/engineVersion as above
  merkleRoot: Hash;
  coveredEventIds: EventId[];
  zgRootHash: string | null;
  zgTxHash: string | null;
}
```

### Storage
Two new append-only tables (additive; existing tables untouched):
```sql
CREATE TABLE IF NOT EXISTS history_events (
  seq         BIGSERIAL PRIMARY KEY,         -- monotonic global insert order
  event_id    TEXT NOT NULL UNIQUE,
  world_id    TEXT NOT NULL,
  tick_id     INT  NOT NULL,
  parent_hash TEXT NOT NULL,                 -- prior event in this world's chain
  event_hash  TEXT NOT NULL,                 -- H(header ‖ canonical(payload))
  kind        TEXT NOT NULL,                 -- 'CognitiveTransition' | 'Anchor'
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
  zg_root_hash TEXT, zg_tx_hash TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
```
RLS: enable on both (deny-all, owner-bypass) to match the existing Supabase posture (see [[civilization_0]] RLS lesson). Append in `schema.sql` so `migrate()` keeps them.

## Architecture

### The engine stays history-agnostic (the most important property)
`runCitizenTick` is extended only to *return richer pure values* — it imports nothing from `@civ/history`. `TickResult` gains `observation: Observation` and `availableActions: string[]` (both already computed inside the tick as `query` and `forced ?? ALL_ACTIONS`). The engine does not know history exists.

### Transactional shadow append (Invariant #2)
`@civ/history.buildCognitiveTransition(tickResult, persisted)` assembles the event from the engine's `TickResult` + the persisted memory/belief weights + `decision.meta.socialDrivers`. `@civ/persistence`'s `persistTick` appends it **inside the existing transaction**:
```
persistTick TX {
  INSERT decisions / events / decision_memories / decision_beliefs / traces   // unchanged = truth
  history.append(tx, transition)                                              // seq, parent_hash, event_hash
}  // atomic — both commit or both roll back
```
If the append fails, the whole tick rolls back (no decision without its transition; no transition without its decision). This reuses the engine's existing "event only after its causal decision" discipline.

### Hash chain (Invariant #3 enforcement)
Per-world chain. `eventHash = sha256(canon(header) ‖ canon(payload))`; `parentHash` = the previous event's `event_hash` for that `world_id` (genesis parent = `0x0…`). `append` reads the world's current tip inside the transaction and links to it. Any modification/deletion/reordering breaks the chain and is detectable by re-walking it.

**Canonicalization (normative).** `canon()` MUST be deterministic, language-independent, and versioned — so a hash computed by today's TypeScript runtime is byte-identical to one computed by any future runtime (Rust, a zkVM guest, an external auditor). Phase 1A uses **JSON Canonicalization Scheme (JCS, RFC 8785)**; the canonicalization version is pinned alongside `schemaVersion` (and may be carried explicitly as `canonVersion` if it ever diverges from the schema). Never hash a language-default `JSON.stringify` — key ordering and number formatting are not stable across runtimes, and a non-canonical hash silently breaks replay years later.

### Anchor to 0G
Per tick: collect the tick's `CognitiveTransition` hashes → merkle root → archive a `civ.history/v0` record to **0G Storage** (reuses `createZeroGStorage` / the existing archival seam) → append an `AnchorEvent` + a `history_anchors` row with `{merkleRoot, zgRootHash, zgTxHash}`. Anchoring runs *after* the transactional append (best-effort; a missed anchor leaves the chain intact and re-anchorable — the chain is the integrity spine, the anchor is the external timestamp). Legacy per-decision trace archival is untouched.

**Build-order note (for the implementation plan):** anchoring is an *optimization / external-timestamp* layer, **not** a correctness layer. The correctness spine — types → canonical hash → append → chain verification → reduce → projection → shadow verification → `civ explain` — MUST be built and passing *before* 0G anchoring is added. The web explorer view comes after `civ explain`. Do not let anchoring (or any 0G dependency) gate the correctness tracks.

### Fold + projections (split, per Amendment #5)
```
fold(history: CognitiveTransition[]) → WorldState        // pure reducer: derived world state
project(WorldState | transition, "explain") → ExplainView // for `civ explain`
project(...,                       "replay")  → world reconstruction // later (`civ replay`)
```
1A implements `fold` to a minimal `WorldState` (per-citizen latest authenticated transition, indexed by `(world, tick)`) and `project(...,"explain") → ExplainView`. `civ replay`'s full world reconstruction is a later projection over the same fold — the split exists now so the two never get conflated.

### The two proofs
- **Historical Faithfulness Proof** (the real migration test): `assert(fold(history) == legacy_state)` for each tick — proves the shadow log is a true reflection of reality. **Warn-only in 1A** (logs a divergence; never fails the tick). Becomes fail-hard in 1B.
- **Chain integrity:** re-walk a world's chain, recompute each `event_hash`, assert `parentHash` continuity — proves append-only tamper-evidence.

### Surfaces
- **`civ explain --citizen <id> --tick <day>` [--world <id>]** — CLI (`packages/history/scripts/explain.ts`, run via `tsx`). Loads the transition, verifies its chain link + anchor, prints the authenticated trace; renders `candidates`/`beliefDelta` as **"unavailable"** when `null` (Invariant #1).
- **`/explain/[citizen]/[tick]`** — thin keyless web view reusing the shipped `CausalChain` + `SocialDrivers` components (the "explorer view" for free). Optional in 1A if the CLI acceptance test passes; included if time permits.

## Package / file structure

```
packages/history/                 = @civ/history
  src/
    types.ts        EventHeader, Observation, ExecutionContext, WorldDelta,
                    CognitiveTransition, AnchorEvent, WorldState, ExplainView
    hash.ts         canonicalJSON, sha256, eventHash, merkleRoot, chain re-walk/verify
    append.ts       append(tx, event): links parentHash, writes history_events (transactional)
    reduce.ts       fold(transitions) -> WorldState
    project.ts      project(state|transition, mode) -> ExplainView (+ replay stub)
    anchor.ts       anchorTick(worldId, tickId): merkle -> 0G archive -> history_anchors
    verify.ts       faithfulnessProof(fold, legacy), verifyChain(worldId)
    build.ts        buildCognitiveTransition(tickResult, persisted) -> CognitiveTransition
  scripts/
    explain.ts      the `civ explain` CLI
    anchor-smoke.ts live 0G anchor smoke (spends ~0.002 OG)
```
Touched outside the package: `packages/engine` (TickResult gains `observation` + `availableActions` — pure values only), `packages/persistence` (`persistTick` calls `history.append` in-tx; `schema.sql` gains the two tables + RLS), `apps/web` (the optional explain view).

## Testing

**Unit (network-free, vitest):**
- `hash.ts`: `eventHash` determinism; chain link continuity; tamper (mutate a payload) ⇒ `verifyChain` fails; merkle root determinism.
- `build.ts`: `buildCognitiveTransition` — real fields populated from a fake TickResult; `candidates`/`beliefDelta` are `null`; `worldDelta` reflects the event/wealth/relationship changes.
- `reduce.ts`/`project.ts`: `fold` over a sequence yields expected `WorldState`; `project(...,"explain")` yields the `ExplainView` the CLI prints; null cognition projects to "unavailable".
- `verify.ts`: `faithfulnessProof` passes when shadow matches legacy, warns (returns a divergence) when it doesn't.

**Integration (`*.itest.ts`, separate vitest project, `civ0_test` DB):**
- Transactional append: a forced row-write failure rolls back the history append (no orphan event); success lands both (Invariant #2 both directions).
- End-to-end: seed a world, run one tick through the real persist path, `fold(history) == legacy rows` (Faithfulness Proof), and `civ explain` reconstructs the trace.

**Live smoke (manual, gated):** `anchor-smoke.ts` archives one tick's merkle root to real 0G and recovers it keyless (~0.002 OG).

## Verification of acceptance
Run a seeded tick (test DB), then `tsx packages/history/scripts/explain.ts --citizen <id> --tick <day>` returns the authenticated trace; `verifyChain` + `faithfulnessProof` pass; the live `/opt/civilization-0` scheduler tick is byte-for-byte unchanged (engine diff is additive-return-only). That satisfies the Phase 1A acceptance test.
