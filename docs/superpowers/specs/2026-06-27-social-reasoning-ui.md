# Social Reasoning UI — Design Spec

**Date:** 2026-06-27
**Branch:** `feat/graphrag-neighbor-retrieval` (worktree `/opt/civilization-0-graphrag`)
**Status:** approved (brainstorming complete)

## Problem

GraphRAG neighbor retrieval is live: every citizen decision is now driven in part by
the *social graph* — the specific neighbors whose `trust × relevance` (blended) pulled
the decision one way or another. Those `socialDrivers` are archived to 0G inside each
trace, but they are **invisible in the UI**. The causal chain shows Memory → Belief →
Compute → Decision → Event → Storage with no social layer; the map (`/map`) is a static
force graph; the verify page proves *that* a decision is verified but not *why* it was made.

The backend moat (verifiable, graph-reasoned retrieval you can recompute from scratch)
is real but unseen. This spec makes it the centerpiece.

## Goals (scoping answer: "1 and 3")

1. **Make the graph reasoning visible** — a "Social context" node in the causal chain
   showing the neighbors who drove the decision (trust × relevance → blended), with a
   "recompute yourself" reveal of the raw archived inputs. Same on `/verify`. Same data
   lights up the relevant edges on `/map`.
2. **Make the depicted world (`/map`) the showpiece** — *Interactive + decision replay*
   (chosen scope): the map breathes when idle; clicking a node opens a side panel with
   that citizen's latest decision and its causal chain; a "Replay last decision" control
   lights up the exact edges GraphRAG retrieved (signal-blue, weighted by blendedScore)
   pulsing toward the decider. Graceful when a world/decision has no GraphRAG data.

Explicit non-scope: full auto-play cinematic / timeline scrubber (deferred); whole-site
visual restyle (out of scope — option 2 was not chosen).

## Constraints

- **Additive only.** No destructive schema migration. `socialDrivers` ride in the existing
  `decisions.meta` jsonb column and in the existing 0G trace `drivers` object (unchanged).
  Pre-GraphRAG decisions (no socialDrivers) degrade to today's exact behavior.
- **Branch isolation.** All work stays on `feat/graphrag-neighbor-retrieval` in the worktree;
  `/opt/civilization-0` master keeps ticking. Merge via PR.
- **Design system.** Observatory tokens only (`--bg #0a0b0d`, signal-blue `--accent #4f7ef8`,
  org-violet `--org #c792ea`, `--down #c46a6a`, mono-as-data). No new color identities.
- **One driver component.** A single `SocialDrivers.tsx` is reused by the causal chain,
  the verify page, and the map side panel — not three copies.
- **No new heavy deps.** Idle "aliveness" is CSS-driven (no physics loop on the client that
  would break the deterministic SSR layout / cause hydration drift).
- **Verification unchanged.** The 0G archival path and `parseArchivedTrace` are untouched;
  `/api/verify` already surfaces socialDrivers (done in commit 7777aa0).

## Data model

`socialDrivers` is computed once per tick from `neighbors` and written to **two** places:

- **0G trace** `drivers.socialDrivers` (already done) — the canonical, verifiable copy.
- **`decisions.meta.socialDrivers`** (new) — a fast, queryable mirror so the causal chain
  and map side panel render without a 0G round-trip. Same shape, same numbers.

```ts
// packages/shared/src/index.ts
export interface SocialDriver {
  id: string; name: string;
  relationshipStrength: number;  // clamp((trust+influence)/200), 0..1
  relevance: number;             // clamp(cosine(embed(neighborText), embed(socialQuery))), 0.1..1
  blendedScore: number;          // relationshipStrength * relevance
  trust: number;                 // raw, 0..100  (archived so anyone can recompute)
  influence: number;             // raw, 0..100
  neighborText: string;          // raw text embedded for relevance
}
export interface OrgDriver { id: string; name: string; action?: string; reasoning?: string; }
// ExecutionMeta gains: socialDrivers?: SocialDriver[]; socialQuery?: string; orgDriver?: OrgDriver;
```

The map "Replay last decision" button additionally does a live `/api/verify?root=…` fetch
(authentic 0G round-trip) — it is both the replay trigger and a proof beat.

## Surfaces

| Surface | Change |
|---|---|
| Causal chain (`CausalChain.tsx`) | New `kind: "social"` node between Belief and Compute, body rendered by `SocialDrivers`. |
| Chain builders (`lib/world.ts`, `lib/citizen-db.ts`, `read.ts`) | Emit the social node from `decisions.meta`. |
| Verify page (`VerifyOnZeroG.tsx`) | Render socialDrivers from the API excerpt via `SocialDrivers`. |
| Map (`Constellation.tsx`) | Idle breathing; click → side panel with chain; replay lights driver edges. |
| Map data (`/api/citizen-chain`) | New route: citizenId → causal chain JSON for the side panel. |

## Verification

- Unit: engine writes `decision.meta.socialDrivers`; builders emit the social node; the
  replay edge-selection helper maps drivers → lit edges; `SocialDrivers` renders rows +
  recompute reveal; `CausalChain` renders the social node; verify view renders drivers.
- Integration/manual: `pnpm -r typecheck` + web build clean; run `next dev`, trigger one
  citizen tick so genesis has fresh socialDrivers, then eyeball: `/citizens/<id>` chain shows
  the social node; `/verify/<root>` shows it; `/map` breathes, click→panel→replay lights edges.
- Degradation: a world/decision with no socialDrivers renders exactly as today (no social
  node, no replay edges, panel still shows the chain).
