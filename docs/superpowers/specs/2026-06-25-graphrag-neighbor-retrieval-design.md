# GraphRAG Neighbor Retrieval — Design

**Date:** 2026-06-25
**Status:** Approved (brainstorming) — pending implementation plan
**Scope:** Civilization-0 brain retrieval (hackathon "Option A"). The enterprise/agent-memory product is "Option B", explicitly deferred.

## Problem

Today the per-tick retrieval is **basic, ego-centric RAG**. `loadContext(citizenId)` hydrates only the acting citizen's own rows, and the brain ranks memories with flat cosine similarity (`MemoryIndex.retrieve` → `cosineSimilarity(q, m.embedding) * importance`, top-K). The citizen's `relationships` edges are loaded as scalar trust/friendship/influence numbers but **never traversed** — the engine never pulls a related citizen's state, the shared history between them, or the citizen's org. Decisions are reasoned in social isolation, and the provenance trace can only say "retrieved: cosine 0.82".

To be best-in-class, retrieval must understand how the world is connected: **GraphRAG** — entities, relationships, history, and (for Option B) permissions.

## Goal

Add a bounded, **query-aware 1-hop neighborhood** to each citizen's reasoning context — the allies/org most relevant to the current decision — and thread it into both the brain prompt and the verifiable provenance trace. Memory retrieval (the citizen's own memories) is unchanged; we *add* a parallel neighbor-retrieval step.

## Key decisions (locked during brainstorming)

1. **Win condition:** richer reasoning via real 1-hop neighborhood (not just re-ranking the citizen's own memories).
2. **Neighbor payload:** per neighbor — relationship strength, latest move (action + reasoning), top goal or strongest belief, and key state (wealth/reputation); plus the citizen's org context if a member.
3. **Selection:** query-aware blend — `relationshipStrength × relevance(to the current decision)` — top 2–3, kept bounded for cost.
4. **Integration:** **Approach 1 (engine-native)** — the retrieval upgrade lives where retrieval lives. This **breaks the long-standing `packages/engine` + `packages/store` byte-for-byte-frozen invariant** (approved), because keeping graph-retrieval reasons inside the engine that emits the trace keeps the provenance coherent — which is the whole moat.

## Architecture & components

New unit **`GraphRetriever`** (`@civ/memory`, beside `MemoryIndex`) — pure, sync, deterministic:

```
selectNeighbors(candidates: NeighborSummary[], query: string, k: number): ScoredNeighbor[]
```

Scores each candidate `= relationshipStrength × relevance`, returns top-`k` with the score breakdown attached (the breakdown becomes provenance). Reuses the **same `Embedder` already injected into the engine** (the 64-dim FNV `FakeEmbedder`), so scoring is in-process, costs **zero extra 0G**, and is deterministic under test.

New data shapes (`@civ/shared`):
- `NeighborSummary { id, name, relationship: {trust, friendship, influence}, latestAction?, latestReasoning?, topGoal?, strongestBelief?, wealth, reputation }`
- `OrgContext { id, name, kind, latestAction?, latestReasoning? }`
- `ScoredNeighbor { summary: NeighborSummary, relationshipStrength, relevance, blendedScore }`

### Blast radius (6 packages, focused diffs)

| Package | Change |
|---|---|
| `@civ/shared` | + `NeighborSummary`, `OrgContext`, `ScoredNeighbor` |
| `@civ/memory` | + `GraphRetriever` (new file) |
| `@civ/store` | + neighbor-candidate / org-context accessors *(invariant break — additive)* |
| `@civ/brain` | `DecisionContext` += `neighbors?`, `orgContext?`; `ZeroGComputeBrain` prompt += social block; `FakeBrain` behavior unchanged |
| `@civ/engine` | tick calls `graphRetriever`, passes neighbors/org to `brain.decide`, extends `drivers` *(invariant break)* |
| `@civ/persistence` | `loadContext` += bounded neighbor/org hydration; `persistTick` **unchanged** |

The engine's tick loop and memory retrieval are untouched in spirit — we insert one step and widen the context object.

## Data flow

**Split principle:** bounded *async DB work* (fetch candidate neighbors) happens in `loadContext`; *query-aware selection* happens in the tick (only the tick has the decision query). Everything in the tick stays pure/sync/deterministic.

**Phase 0 — `loadContext(citizenId)` (persistence, async, bounded):**
- Loads citizen/goals/memories/beliefs/relationships *(as today)*.
- **NEW:** prefilter relationships to top `NEIGHBOR_CANDIDATE_LIMIT` (default 5) by `trust+influence`; for each, build a `NeighborSummary` — latest move (`decisions` max-day → action+reasoning), top goal (`goals` highest progress), strongest belief (`beliefs` max confidence), state (wealth/reputation). **Filtered to the same world**; missing/deleted neighbors skipped. → `store.setNeighborCandidates(...)`.
- **NEW:** if the citizen is in an org (`memberships`), load `OrgContext` — org + its latest mandate (`events` where `actor_id = orgId` → payload action/reasoning). → `store.setOrgContext(...)`.
- Cost: ≤5 neighbor lookups + 1 org lookup per tick (may be collapsed into a LATERAL join later; correctness first).

**Phase 1–2 — observe + memory retrieve (engine, UNCHANGED):** build `query`; `memoryIndex.retrieve(citizenId, query, K)`; dedupe with pinned.

**Phase 2.5 — NEW graph retrieve (engine, pure/sync):**
```
scored = graphRetriever.selectNeighbors(store.getNeighborCandidates(id), query, NEIGHBOR_K)
org    = store.getOrgContext(id)
```
Per candidate (`trust`/`friendship`/`influence` are stored on a **0..100** scale — verified against live data):
- `relationshipStrength = (trust + influence) / 200`  → normalized to `[0,1]`  *(values are clamped to `[0,1]` in case any row falls outside 0..100)*
- `relevance = cosine(embed(neighborText), embed(query))`, clamped to `[ε, 1]`  *(neighborText = name + latest move + goal + belief)*
- `blendedScore = relationshipStrength × relevance`  *(ε floor so a strong tie isn't zeroed by low text overlap; ε tunable)*
- tie-break: `relationshipStrength` desc, then `id` — fully deterministic. Take top `NEIGHBOR_K` (default 3).

**Phase 3 — `brain.decide` (UNCHANGED call, WIDER context):** `{…, neighbors: scored, orgContext: org}`. `ZeroGComputeBrain` prompt gains a compact **"People around you"** block (each selected neighbor's relationship + latest move + goal/belief + state) and a **"Your organization"** block. `FakeBrain` ignores them → unit tests stay deterministic.

**Phase 4 — record drivers (engine, EXTENDED):** existing `drivers` (memory/belief weights) gains `socialDrivers` + `orgDriver` (see Provenance).

**Phase 5 — `persistTick` (UNCHANGED):** writes decision/event/memory/trace; the archived 0G trace now carries `socialDrivers` inside `drivers`.

**Edge cases:** no relationships → empty neighbors, tick proceeds (a hermit reasons alone); no org → org block omitted; candidate-fetch failure is **non-fatal** (degrade to memory-only, log) so GraphRAG can never freeze the autonomous tick.

## Provenance extension (the moat payoff)

Today `drivers` records the *brain-weighted* memory/belief ids the brain leaned on (subset invariant: weight keys ⊆ retrieved ids), archived as the `civ.provenance/v0` trace on 0G Storage, keyless-verifiable.

We add **`socialDrivers`** (retrieval-side, deterministic) and **`socialQuery`**:

```
drivers: {
  memories: [...], beliefs: [...],                 // unchanged
  socialDrivers: [                                  // NEW
    // Raw inputs archived so scores are independently recomputable:
    // relationshipStrength = clamp((trust+influence)/200)
    // relevance = clamp(cosine(embed(neighborText), embed(socialQuery)))
    { id:"marcus", name:"Marcus",
      trust:70, influence:60,                       // raw — recompute strength
      neighborText:"Marcus invest backed Ada ...",  // raw — recompute relevance
      relationshipStrength:0.65, relevance:0.61, blendedScore:0.40 }, ...
    // Note: relationshipStrength/relevance/blendedScore are r2-rounded display
    // values; the recomputation matches within rounding.
  ],
  socialQuery: "capital Boom",                      // NEW — decision query used for all relevance scores
  orgDriver?: { id, name, action?, reasoning? }     // NEW, if member
}
```

**The key win — verifiable retrieval, not just verifiable storage.** The trace archives the RAW retrieval inputs (`trust`, `influence`, `neighborText`, and `socialQuery`) alongside the rounded display scores. A third party holding only the trace and the fixed 64-dim embedder can recompute `relationshipStrength = clamp((trust+influence)/200)` and `relevance = clamp(cosine(embed(neighborText), embed(socialQuery)))` end-to-end, and confirm the stored `blendedScore` within rounding — without trusting the operator. "Verify, don't trust the operator" now extends from *storage* and *compute* to **retrieval itself**.

**Schema safety:** `socialDrivers`/`orgDriver` are *additive*; the keyless verifier checks only `data.schema`, so the string stays `civ.provenance/v0` and old traces still verify. No verifier change.

## Cost controls

| Knob | Default | Bounds |
|---|---|---|
| `NEIGHBOR_CANDIDATE_LIMIT` | 5 | DB lookups per tick |
| `NEIGHBOR_K` | 3 | prompt/token size |
| `NEIGHBOR_TEXT_MAX` | ~200 chars | tokens per neighbor |
| `RELEVANCE_FLOOR` (ε) | 0.1 | scoring tuning |

Selection is in-process → **zero extra 0G** for scoring; the only 0G cost bump is the bounded neighbor block in the prompt. We measure OG/tick before vs. after on a real tick and document the delta. Failure of neighbor hydration degrades gracefully to memory-only.

## Testing strategy

Follows existing conventions (network-free `*.test.ts` with `FakeBrain`/`FakeEmbedder`; Postgres `*.itest.ts` via `pnpm test:it` against `civ0_test`; one live 0G acceptance run). **TDD — RED first.**

**Unit (network-free, deterministic):**
1. `GraphRetriever.selectNeighbors` — scoring order (`strength × relevance`), deterministic tie-break (equal score → strength desc → id), `k`-bound, ε-floor behavior (strong tie with zero text overlap still beats a weak tie), empty candidates → `[]`.
2. Engine tick (`FakeBrain`) — assembles `neighbors`/`orgContext` into `DecisionContext`; `drivers.socialDrivers` reflects the selection with score breakdown; hermit (no relationships) → empty `socialDrivers`, tick still succeeds; org present → `orgDriver` recorded.
3. Brain prompt — "People around you"/org block appears when present, omitted when absent (pure string assembly).

**Integration (`*.itest.ts`, `civ0_test`):**
4. `loadContext` hydration — seed citizen + relationships (incl. a cross-world edge + a deleted-neighbor edge) + neighbors with decisions/goals/beliefs/state + org membership → assert candidates are top-5 by `trust+influence`, **same-world only**, correct latest-move/goal/belief/state; org context correct.
5. load→tick→persist — `FakeBrain` round-trip asserts the persisted trace's `drivers.socialDrivers` threaded through (`persistTick` unchanged).

**Live acceptance (one real 0G tick):** tick a well-connected citizen (e.g., `ada`) → decision succeeds, `verified=true`, archived trace's `socialDrivers` populated and keyless-verifiable via `/api/verify` (excerpt shows it); re-derive the scores from the trace to prove reproducibility; measure OG/tick delta vs ~0.0045 baseline and document.

## Out of scope (YAGNI)

- Multi-hop (2+), community/cluster summaries, external graph DB → **Option B**.
- Re-ranking the citizen's *own* memories by graph signal → keep memory retrieval as-is.
- Brain-salience *over* neighbors (the brain weighting neighbors like memories) → **Phase 2** (touches the brittle 3-phase brain-output parse/repair/coerce).
- Permission-filtered retrieval → single-world sim; neighbors are intra-world by construction → **Option B (enterprise)**.
- A new UI panel for `socialDrivers` → the data is recorded and present in the `/api/verify` excerpt; the visual surface is an optional small follow-on, not core.

## Acceptance criteria (definition of done)

- All new unit + integration tests green; full suite + typecheck + web build clean.
- One real 0G tick → a decision whose trace carries **reproducible** `socialDrivers`, `verified=true`, keyless-verifiable.
- OG/tick delta measured, documented, within ~2× baseline.
- Engine determinism preserved (network-free unit suite still green).
