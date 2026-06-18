# Civilization-0 — Design Spec

**Date:** 2026-06-18
**Status:** Approved (pending written-spec review)
**Location:** `/opt/civilization-0`

---

## 1. Pitch & Moat

**Pitch:** A persistent AI society whose citizens *reason on 0G Compute* and whose history *lives permanently on 0G Storage* — and where every action traces back to the exact memories and beliefs that caused it.

**The moat (one sentence):** not "we store memories on 0G," but a queryable
`Memory → Belief → Decision → Event → DecisionTrace → 0G Archive`
chain that a judge can click through in five seconds.

This makes 0G **irreplaceable** rather than swappable: the citizens *think* on 0G Compute and the *reasoning behind every action* is permanently, verifiably archived on 0G Storage.

### Win condition (the demo)
1. Create Ada — goal: become financially independent.
2. Fast-forward 30 days. Timeline: lost job → met Marcus → received investment → started company.
3. Judge clicks **"Why did Ada start a company?"**
4. Explainability Graph renders: **Memory → Belief → Decision → Event → 0G Archive**.
5. Badges: *Reasoned by 0G Compute* · *Archived on 0G Storage*.
6. Open the newspaper (Narrative): "New Startup Created By Ada After Local Recession."
7. Click the article → it links back to the underlying event chain.

Demonstrates agent reasoning, memory, beliefs, explainability, persistence, 0G Compute, 0G Storage, and emergent history — in ~90 seconds.

---

## 2. Architecture — Monorepo (pure TypeScript, pnpm workspaces)

```
/opt/civilization-0
  apps/web                 Next.js — UI + API routes (the only HTTP surface)
  packages/shared          types (Citizen, Memory, Belief, Decision, Event, Narrative, Trait...) + prompt templates
  packages/brain           BrainProvider interface; ZeroGComputeBrain (primary) + AnthropicBrain (dev fallback) + FakeBrain (tests)
  packages/memory          retrieve / store / rank — Postgres + pgvector
  packages/beliefs         belief revision: form/update beliefs from new memories
  packages/storage         StorageProvider interface; ZeroGStorage (primary) + FakeStorage (tests); returns {rootHash, txHash, ts}
  packages/engine          runWorldTick() — the heart; the agent loop
  packages/explainability  builds + archives DecisionTrace from the causality tables
  packages/narrative       daily newspaper generation over the event graph
  infra/                   docker-compose (postgres+pgvector), migrations, seed
```

Design rules:
- Every package has **one job**, a **typed interface**, and is **independently testable**.
- The two network dependencies (`brain`, `storage`) sit behind interfaces with **Fake** implementations, so the entire causality engine is testable with **zero network** and **deterministic** output.
- Simulation code never knows which brain/storage provider is active.

---

## 3. Data Model — the causality tables (this *is* the product)

```sql
citizens(id, name, occupation, age, traits jsonb, wealth, reputation, tier, created_day)
goals(id, citizen_id, kind, description, progress, active)
relationships(citizen_id, other_id, trust, friendship, influence)        -- directed

memories(id, citizen_id, day, type, importance, summary,
         embedding vector, zg_root_hash, zg_tx_hash)

beliefs(id, citizen_id, statement, confidence, source_memory_ids jsonb,
        updated_day)                                                     -- ★ worldview layer

decisions(id, citizen_id, goal_id, day, reasoning, action, target_id,
          brain_provider, brain_model)

decision_memories(decision_id, memory_id, weight)                        -- ★ moat join (raw evidence)
decision_beliefs(decision_id, belief_id, weight)                         -- ★ moat join (worldview)

events(id, day, type, actor_id, target_id, decision_id, payload jsonb,
       zg_root_hash, zg_tx_hash)

decision_traces(id, decision_id, trace_json, zg_root_hash, zg_tx_hash)   -- ★ the archived "why"

narratives(id, day, headline, summary, referenced_event_ids jsonb,
           zg_root_hash, zg_tx_hash)                                     -- ★ history, not logs

world_state(day, economy jsonb, headline, updated_at)
```

### Why these tables matter
- **`decision_memories` + `decision_beliefs`** are populated **at decision time** from the exact memories/beliefs retrieved into the prompt — never inferred later. The chain exists by construction.
- **`beliefs`** insert the worldview layer: `Memory → Belief → Decision`. Agents accumulate convictions (e.g. *"Marcus is trustworthy", confidence 0.92, from memories [11,44]*) instead of re-evaluating raw memories every tick → coherent long-run behavior.
- **`brain_provider/model`** on every decision powers the *"Reasoned by 0G Compute"* badge.
- **`decision_traces`** archives the *reasoning itself* to 0G — the thing judges actually care about ("why?"), not just the event.
- **`zg_*`** columns everywhere are the *"Archived on 0G"* proof.

### DecisionTrace JSON (archived to 0G Storage)
```json
{
  "decision": "start_company",
  "goal": "financial_independence",
  "retrieved_memories": [11, 44, 89],
  "beliefs": ["Marcus is trustworthy", "Recession threatens my income"],
  "reasoning": "Marcus offered funding and I need income",
  "event_id": "evt_72"
}
```

### Narrative JSON (archived to 0G Storage)
```json
{
  "day": 72,
  "headline": "Economic Slowdown Hits Workers",
  "summary": "Three businesses closed as the recession deepened...",
  "referenced_events": ["evt_70", "evt_72", "evt_73"]
}
```

---

## 4. The Agent Loop — `runWorldTick()`

Per active citizen, per tick (= one in-world day):

1. **Observe** — world_state + own state.
2. **Retrieve** — top-K memories (pgvector similarity over goal + situation) + relevant beliefs + relationships.
3. **Build context** — structured cognitive stack: identity → goals → beliefs → memories → relationships → world → action menu.
4. **Decide** — `BrainProvider.decide()` → `{action, target, reasoning}` (JSON).
5. **Execute** — mutate state, create an `Event`.
6. **Record causality** — write `decision` + `decision_memories(weight)` + `decision_beliefs(weight)`.
7. **Build + archive trace** — construct `DecisionTrace`, archive to 0G Storage, save `zg_*` on `decision_traces`.
8. **Form memory** — importance-rate the outcome; store if ≥ threshold.
9. **Belief revision** — update/create beliefs from the new memory (confidence + source_memory_ids).
10. **Archive event** — if "major" (start_company, partner, betray, hire…), push event to 0G Storage; save hashes.

**Determinism note:** LLM output isn't reproducible, so every brain **input + output** is recorded. A run is fully **auditable and replayable** (we can show exactly what context produced a decision) even though it isn't regenerable. World mechanics (economy, wealth) are deterministic from the event log.

---

## 5. 0G Integration — what goes where

| Layer | Tech | Why |
|---|---|---|
| Reasoning ("the brain") | **0G Compute** (serving broker, Llama-70B / DeepSeek-class) | citizens *think* on 0G |
| Hot memory / retrieval | Postgres + pgvector | fast per-tick similarity; never hit 0G per tick |
| Permanent archive | **0G Storage** | events, decision-traces, beliefs snapshots, life-stories, narratives — the inspectable history |

We **never read from 0G in the hot path**. 0G Storage is the durable, verifiable archive; pgvector is the operational index.

---

## 6. Agent Tiers (cost control)

- **Tier 1 — background citizens:** rule-based (no LLM).
- **Tier 2 — active citizens:** 0G Compute only on decisions that matter.
- **Tier 3 — influencers** (founders/leaders): full reasoning every relevant tick.
- **Narrative:** one LLM call per in-world day, not per citizen.

Keeps token/compute spend bounded as population grows.

---

## 7. MVP Scope (YAGNI enforced)

- **Entities:** Citizen, Memory, Belief, Decision, Event, Relationship, Narrative. Nothing else.
- **Verbs:** `meet, friend, argue, hire, quit_job, start_company, partner, betray, invest, work`.
- **Explicitly NOT in MVP:** elections, politics, factions, religion, war, districts, maps, multiple cities, multiplayer. (Roadmap only.)
- **UI:** landing (live ticker) → world view (timeline-first, not charts) → **citizen profile with the Explainability Graph (hero screen)** → AI newspaper. Newspaper articles link back into the event chain.

---

## 8. Build Order (vertical slice first)

1. **Slice 0 — the causality loop for ONE citizen**, with FakeBrain + FakeStorage, fully tested:
   `Ada loses job → memory → belief → retrieve → decide → start_company → event → decision_memories/decision_beliefs chain → DecisionTrace → archive`.
   Validates the entire concept before any UI or network.
2. Swap FakeStorage → **0G Storage** (real root/tx hashes).
3. Swap FakeBrain → **0G Compute** (real inference).
4. Scale to N citizens + relationships + tiers + tick scheduler.
5. UI: profile + Explainability Graph first, then world view, then newspaper.

---

## 9. Testing

TDD on the engine using **FakeBrain** (scripted deterministic decisions) + **FakeStorage** (in-memory hashes). Core assertions:
- A decision always produces `decision_memories` **and** `decision_beliefs` rows referencing the retrieved inputs.
- A decision always produces an archived `DecisionTrace` with a hash.
- A major event always gets archived with a hash.
- Importance thresholding stores/drops memories correctly.
- Belief revision updates confidence and source_memory_ids correctly.

Network adapters (`ZeroGStorage`, `ZeroGComputeBrain`) get thin integration tests separately.

---

## 10. Assumptions / Procurement (build proceeds against interfaces; none of this blocks core work)

- A **0G testnet wallet private key** + testnet OG tokens (faucet) — funds both Storage fees and the Compute ledger.
- 0G **Storage indexer RPC** endpoint + 0G **Compute** broker access (SDK provisions a ledger; we prepay it).
- **Postgres 16 + pgvector**, run locally via docker-compose.
- Inference is on open models (Llama-70B / DeepSeek-class) via 0G Compute — raises the value of strict prompt discipline / the structured cognitive stack.

---

## 11. Roadmap (post-MVP, explicitly deferred)

Governments, elections, districts; multiple civilizations, diplomacy, trade; inter-civilization conflict, cultural evolution. None are built until the core causality engine is proven and demoed.
