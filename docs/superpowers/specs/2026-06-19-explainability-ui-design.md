# Slice 4A — Explainability UI (Design Spec)

**Date:** 2026-06-19
**Status:** Approved (brainstorming complete)
**Branch:** `feat/explainability-ui`
**Depends on:** Slice 0 (causality engine) + Slice 1 (0G adapters), both merged to `master`.

---

## 1. Why this slice, and why now

The project has crossed a threshold. The risk is no longer **technical feasibility** —
real 0G Compute and real 0G Storage are validated live (`meta.verified === true`, real
upload tx hashes on testnet chainId 16602). The risk is now **judge comprehension**: a
hackathon judge spends a few minutes per project, and the winner is usually the project
that explains itself fastest.

Slice 4A builds the screen that makes the moat — the
`Memory → Belief → Decision → Event → DecisionTrace → 0G archive` causality chain —
understandable in under 20 seconds. We deliberately build the comprehension win **before**
scaling (Slice 2 Postgres/pgvector, Slice 3 multi-citizen) because those become valuable
only once there is a screen that explains *why* the civilization behaves the way it does.

**Target demo flow:** Landing → *Enter Civilization* → Ada's page (story summary + timeline)
→ click *Invested in Marcus* → Explainability Graph expands → click nodes to drill in →
*0G Compute · Verified: true* → click *Verify on 0G* → the archived DecisionTrace is
retrieved live from 0G Storage and displayed. Thesis proven.

---

## 2. Scope

### In scope (4A)
- New `apps/web` Next.js 14 (App Router) package in the monorepo.
- **Seeded snapshot** strategy: a seed script runs Ada's life through the **real** engine on
  0G once, capturing genuine `rootHash`/`txHash`/`verified`, then serializes the world to a
  static JSON the UI reads. Default UI path touches **no network, no wallet, no compute**.
- Landing page + Citizen Profile + Story Summary + Life Timeline + the hero Explainability
  Graph (`<CausalChain>`).
- **One** live capability: **"Verify on 0G"** — downloads the archived DecisionTrace by
  `rootHash` from 0G Storage and displays the retrieved object (not just the stored hash).

### Out of scope (→ 4B and later)
- **"Run Live Tick"** (live write path: real 0G Compute+Storage tick that appends a new
  event and refreshes the timeline). Deferred to 4B.
- Multi-citizen world, relationships web, scheduler, newspaper (Slice 3).
- Postgres + pgvector persistence (Slice 2).

---

## 3. Architecture & data flow

```
seed-ada.ts  ──runs Ada's life on REAL 0G──▶  InMemoryWorldStore.snapshot()
   (real 0G Compute decide + real 0G Storage archive; captures verified + hashes)
        │  strips 64-float embeddings, writes JSON
        ▼
apps/web/data/world.json   (committed — the canonical demo world)
        │
        ▼
Next.js server components read JSON  ──▶  instant, zero-network UI
        │
        └─ [Verify on 0G] ──▶ /api/verify?root=0x…  ──▶ RealDownloader  ──▶ real archived bytes
```

The default render path is a pure read of committed JSON. The **only** network call in the
entire UI is the isolated `/api/verify` route, exercised on explicit user click. The demo
cannot flake on stage; the 0G proofs in it are nonetheless genuine.

### Two small additive seams in existing packages (both follow the repo's
*pure-logic + thin-real-client* pattern; pure logic unit-tested with fakes, real client
smoke-tested, never imported by `*.test.ts`):

1. **`@civ/shared`** — add `WorldSnapshot` type (see §7).
2. **`@civ/store`** — add `snapshot(): WorldSnapshot` to `WorldStore` and
   `InMemoryWorldStore`. Needed because the per-citizen getters cannot enumerate join rows
   (`getDecisionMemories`/`getDecisionBeliefs` require a `decisionId`) or traces
   (`getTrace` requires a `decisionId`). `snapshot()` dumps every collection directly.
3. **`@civ/zerog`** — add a **download seam** mirroring the existing upload seam:
   - `Downloader` interface: `download(rootHash: string): Promise<Uint8Array>`.
   - `RealDownloader implements Downloader` — uses the 0G Storage SDK Indexer download-by-root.
   - `createZeroGDownloader(config)` factory.
   - A pure helper `parseArchivedTrace(bytes): { key: string; data: unknown }` that reverses
     the `JSON.stringify({key, data})` archive envelope (unit-tested with a fake).

> **Risk to validate during implementation:** confirm whether Indexer download-by-rootHash
> requires a signer or is a public read. The smoke script
> (`packages/zerog/scripts/smoke-0g-download.ts`) resolves this against a real rootHash
> produced by the seed run. If a gateway HTTP GET by root is simpler/more reliable than the
> SDK download, the `RealDownloader` internals may use that instead — the `Downloader`
> interface is unaffected.

---

## 4. The seed narrative (`seed-ada.ts`)

Hand-authored, deterministic backstory, with the hero decision run through the **real** engine
on 0G so the snapshot carries genuine proofs.

- **Citizens:** Ada (protagonist), Marcus (target/counterparty).
- **Memories (Ada):** `m1` "Marcus helped me when I lost my job" (high importance) + a small
  number of supporting memories that ground the other timeline beats.
- **Belief:** `b1` "Marcus is trustworthy" (confidence 0.8, `sourceMemoryIds: [m1]`).
- **Timeline of events:**
  - Day 1 — **Lost job** (authored stimulus)
  - Day 3 — **Met Marcus** (authored stimulus)
  - Day 7 — **Received funding** (authored stimulus)
  - Day 12 — **Invested in Marcus** — a **real 0G Compute decision**, re-run live during
    seeding, archived on **real 0G Storage**. This is the hero.
- **Event → graph rule:** an event **with a linked `decisionId`** → full `<CausalChain>` on
  click. A stimulus event **without** a decision → a simple card (what happened + any memory
  it created). The invest event is the only one with a full chain in 4A.

The Compute ledger is already open (one-time 3 OG locked), so re-running the seed costs only
gas + a small inference fee. Seed scripts that import the compute SDK run with
`pnpm -C /opt/civilization-0/packages/zerog exec tsx --conditions require scripts/seed-ada.ts`
(the 0.8.4 ESM build is broken — documented in `docs/zerog-runbook.md`).

---

## 5. Screens (landing + 3)

### `/` — Landing
Tagline + a single **"Enter Civilization"** CTA linking to `/citizens/ada`.
> *Civilization-0 — A society whose citizens think on 0G, and whose history lives on 0G.*

### `/citizens/ada` — Citizen Profile + Story Summary + Life Timeline
Civilization-shaped URL chosen deliberately: the moment Marcus/Sophia/James exist, no routing
migration is needed, and the URL communicates "one citizen in a civilization," not a one-off
character demo.

- **Profile:** occupation, goals, traits, wealth, reputation, relationships.
- **Story Summary card (above the timeline):** a short prose paragraph *generated from
  snapshot data* (not hardcoded) by `buildStorySummary(snapshot, citizenId)`. Judges don't
  read timelines; this gives them the whole citizen before they scroll. Example output:
  > Ada lost her job. Marcus helped her during a difficult period. Over time she formed the
  > belief that Marcus was trustworthy. That belief influenced a decision generated on 0G
  > Compute. Ada ultimately invested in Marcus, and the decision trace was archived on 0G
  > Storage.
- **Life Timeline:** vertical list Day 1 → Day 12, each event clickable.

### Explainability Graph (hero) — `<CausalChain>`
Clicking the *Invested in Marcus* event reveals the causal chain inline (expand / side panel —
no route change required). See §6.

---

## 6. The hero — `<CausalChain>` component

Custom CSS/SVG ("forensic evidence chain," not a node editor). Optional Framer Motion for the
expand. Fixed vertical stack, **six** node types, each click-to-expand inline. **Causal order
(corrected):**

```
[ Memory m1 ]      click → summary · weight 0.6 · archived 0x…
      ▼
[ Belief b1 ]      click → statement · confidence 0.8 · weight 0.8
      ▼
[ 0G Compute ✓ ]   click → provider · model · Verified: true   ← Compute PRODUCES the decision
      ▼
[ Decision ]       click → action "Invest in Marcus" · reasoning
      ▼
[ Event ]          click → what happened · day 12
      ▼
[ 0G Storage ✓ ]   click → rootHash · txHash · [Verify on 0G]
```

> The Compute node sits **before** the Decision node. Compute is the engine that emits the
> decision (`decision.meta` is the execution record), so `Memory/Belief → 0G Compute →
> Decision` reads correctly; placing Compute after Decision would imply the decision came
> first, which is backwards. Judges read diagrams literally.

Node components: `MemoryNode`, `BeliefNode`, `ComputeNode`, `DecisionNode`, `EventNode`,
`StorageNode`.

### "Verify on 0G" (the live moment)
On click, the `StorageNode` calls `/api/verify?root=<rootHash>`. The route uses
`RealDownloader` to fetch the archived bytes from 0G Storage, parses the envelope, and returns
the retrieved object. The panel then shows:

```
✓ Verified on 0G Testnet
Retrieved archived DecisionTrace

Root Hash:    0x5683f71d…
Transaction:  0x2a4dd6ef…

{ "decision": "invest", "verified": true, … }   ← excerpt from the DOWNLOADED artifact
```

The JSON excerpt is taken from the **actually downloaded** object — proving retrieval of the
archived record, not mere display of a stored hash. The route handles failure gracefully
(network error → a clear "could not reach 0G Storage" state; the rest of the UI is
unaffected because it never depended on the network).

### Optional stretch (skippable, < 1 hour budget)
A **Decision Confidence** badge near the graph, e.g. `Decision Confidence 87%`, derived from
the memory/belief weights via a pure `decisionConfidence(chain)` helper (e.g. rounded mean of
all join-row weights). Judges instinctively look for a confidence metric. **If it takes more
than ~1 hour, skip it** — it is not required for the slice to be complete.

---

## 7. Data model — `WorldSnapshot` (in `@civ/shared`)

```ts
export interface WorldSnapshot {
  capturedAt: string;            // ISO timestamp of the seed run
  citizens: Citizen[];
  goals: Goal[];
  relationships: Relationship[];
  memories: Memory[];            // embeddings stripped when written to world.json
  beliefs: Belief[];
  decisions: Decision[];
  decisionMemories: DecisionMemory[];
  decisionBeliefs: DecisionBelief[];
  events: WorldEvent[];
  traces: DecisionTrace[];
  worldState: WorldState;
}
```

`InMemoryWorldStore.snapshot()` returns this with embeddings intact; `seed-ada.ts` strips
`memory.embedding` (64-float arrays are render-noise) before writing `apps/web/data/world.json`.

---

## 8. The brain of the UI — pure selectors (`apps/web/lib/world.ts`)

These are the moat made visible and are the most heavily **unit-tested** part of the slice:

- `loadSnapshot(): WorldSnapshot` — reads the committed JSON.
- `getCitizen(snapshot, id)` / `getRelationships(snapshot, id)`.
- `getTimeline(snapshot, citizenId): TimelineEntry[]` — events sorted by day, each flagged
  with whether it has a linked decision (→ chain) or is a stimulus (→ simple card).
- `getCausalChain(snapshot, decisionId): CausalChain` — **load-bearing.** Joins
  `decision → decisionMemories → memories`, `decisionBeliefs → beliefs`, `event`, and `trace`
  into the render model in the corrected order (Memory → Belief → Compute → Decision → Event →
  Storage). Carries `meta` (provider/model/verified) and `zgRootHash`/`zgTxHash`.
- `buildStorySummary(snapshot, citizenId): string` — deterministic templated prose from real
  data.
- `decisionConfidence(chain): number` — optional badge helper.

Subset/causality invariants are already enforced upstream by the engine and `@civ/zerog`
brain; these selectors only join and present.

---

## 9. App structure

```
apps/web/
  app/
    page.tsx                         # landing
    citizens/ada/page.tsx            # profile + story summary + timeline + graph host
    api/verify/route.ts              # download-by-rootHash (the only network call)
    layout.tsx, globals.css
  components/
    CausalChain.tsx
    nodes/{MemoryNode,BeliefNode,ComputeNode,DecisionNode,EventNode,StorageNode}.tsx
    Timeline.tsx
    CitizenProfile.tsx
    StorySummary.tsx
    VerifyOnZeroG.tsx                # client component; calls /api/verify
  lib/
    world.ts                         # pure selectors (heavily unit-tested)
    types.ts                         # CausalChain / TimelineEntry render models
  data/world.json                    # the seeded snapshot (committed)
  package.json, next.config.js, tsconfig.json
```

`pnpm-workspace.yaml` gains `- "apps/*"`. `seed-ada.ts` lives at
`packages/zerog/scripts/seed-ada.ts` (it needs the real adapters + the `--conditions require`
runner already established there) and writes to `apps/web/data/world.json`.

---

## 10. Testing strategy

Matches the repo's existing discipline — **test the logic hard, smoke the thin edges**:

- **Unit (Vitest), TDD:**
  - `apps/web/lib/world.ts` selectors — especially `getCausalChain` (correct join + order) and
    `buildStorySummary` (deterministic prose from fixture snapshot).
  - `@civ/store` `snapshot()` — round-trips all collections.
  - `@civ/zerog` `parseArchivedTrace` + the `Downloader` seam logic with a fake downloader.
  - `decisionConfidence` (if built).
- **Component render smoke (light):** `<CausalChain>` and node components render expected
  labels/values from a fixture chain; expand toggles reveal detail. No deep interaction
  testing.
- **Smoke scripts (real network, never imported by tests):**
  `packages/zerog/scripts/smoke-0g-download.ts` validates `RealDownloader` against a real
  rootHash; `seed-ada.ts` itself is the integration proof for the snapshot pipeline.
- **Manual demo pass:** `pnpm -C apps/web dev`, walk the judge flow end-to-end, click
  *Verify on 0G* and confirm the downloaded JSON excerpt renders.

The unit suite stays **network-free and deterministic** (no real 0G calls in `*.test.ts`).

---

## 11. Aesthetic direction

The product is **evidence**; the UI must feel **trustworthy**. Reference points:
**Bloomberg Terminal, Stripe Dashboard, Linear, Vercel** — not "AI metaverse."

- Palette: black / charcoal / slate / off-white + **one** accent color.
- Monospace for hashes and ids; restrained, generous spacing; the causal chain reads like a
  forensic report.
- **Explicitly avoid:** glowing cyberpunk, neon overload, particle backgrounds, animated
  network graphs, sci-fi cityscapes — every hackathon AI project does this.
- Lean on the `design-taste-frontend` skill during the implementation polish pass.

---

## 12. Risks & mitigations

| Risk | Mitigation |
|------|------------|
| Indexer download-by-rootHash may need a signer / differ from expectation | Isolated behind `Downloader` interface; resolved by `smoke-0g-download.ts` against a real root before wiring the route. Gateway HTTP GET is a fallback that keeps the interface intact. |
| Next.js 14 on Node 20 | Next 14 App Router supports Node 18.18+/20; pnpm pinned at 9.15.4. Add `apps/*` to workspace. |
| Seed run cost / flakiness | One-time, run by us (not the demo). Ledger already open; only gas + small inference. Output committed as static JSON. |
| Confidence badge scope creep | Explicitly optional, < 1 hour budget, skip if over. |

---

## 13. Acceptance criteria

1. `apps/web` builds and runs; `/` and `/citizens/ada` render from `data/world.json` with zero
   network dependency.
2. Story Summary renders deterministic prose generated from snapshot data.
3. Timeline shows Day 1→12; the *Invested in Marcus* event opens the `<CausalChain>` in the
   corrected order **Memory → Belief → 0G Compute → Decision → Event → 0G Storage**, each node
   expandable.
4. The Compute node shows `Verified: true` with provider + model from the snapshot.
5. *Verify on 0G* downloads the archived DecisionTrace by rootHash and displays root/tx hashes
   **plus a JSON excerpt from the downloaded artifact**.
6. Unit suite (selectors, `snapshot()`, download seam) passes and is network-free; whole repo
   typecheck clean.
7. Aesthetic adheres to §11 (no neon/particles/cityscapes).
```