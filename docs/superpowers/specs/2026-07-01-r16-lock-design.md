# R16 Lock Design (Jul 5) — "The world that explains itself"

**Date:** 2026-07-01
**Status:** Approved
**Context:** Zero Cup Round of 16. R32 results land Jul 3; the R16 repo snapshot
locks **Jul 5** (judged round — judges score the rubric through R16; community
voting starts at QF). The FINAL lock is **Jul 8** — that build rides through
QF/SF/Final to Jul 19.

## Goal & framing

R16 is judged on the same rubric as R32, with **visible iteration since the last
round** as the swing factor. The centerpiece: Civilization-0 goes from *"a world
you can steer and verify"* (R32) to *"a world whose entire history is an
event-sourced, foldable, provably-complete record — and every agent can explain
any decision it ever made."*

Stretch: agents become on-chain **ERC-8004 identities on 0G itself**, adding a
third 0G surface — Chain ✓ — alongside Compute ✓ and Storage ✓.

Decision rationale on identity scope: an off-chain-only identity document does
no 0G work and dilutes the "0G is load-bearing" story; for the tournament it is
**on-chain-on-0G or not at all**. Off-chain-compatible identity remains a
post-tournament stepping stone.

## Timeline

| When | What |
|---|---|
| **Jul 1–2** | Workstream A merge work (master→v2 reconciliation, then PR v2→master). Workstream B (copy reframe) in parallel. Workstream D (ERC-8004) starts, branch-isolated. |
| **Jul 3** | R32 results. Immediately after: prod deploy (scheduler `git pull` + manual Vercel deploy), first-tick verification, genesis-epoch capture confirmed. |
| **Jul 3–4** | Demo video recorded against real prod data. ERC-8004 **go/no-go gate: Jul 4 EOD**. |
| **Jul 5** | Lock. Everything already on master days earlier — no lock-morning pushes. |

Deploy-timing rationale: the R32 snapshot froze Jul 1 10:00 UTC, so **merging to
master is safe anytime**; but judges actively score R32 (and click the live app)
Jul 1–3, so the **prod deploy waits for Jul 3 results**. That still yields ~2
days / ~24 ticks of epoch-covered, explainable history before R16 scoring
(Jul 5–7), plus 2 days of fix runway before the lock.

## Workstream A — Land the history engine on master

The engine (Phase 1A event engine + `civ explain` + `/explain` web route, plus
Phase 1B typed deltas + Genesis epoch + Proof A/B) is merged on `v2`
(tip `5eb0e6d`) but not on `master`. Master gained PRs #10–#14 after `v2`
branched; the two lines overlap in exactly one file,
`packages/scheduler/src/loop.ts` (PR #13's whisper-target force-ticking vs 1B's
per-mutation history coupling).

1. **Merge `origin/master` into `v2`** in the `/opt/civilization-0-v2` worktree.
   Resolve the `loop.ts` conflict so BOTH features survive: `drainInterventions`
   still returns whisper/dilemma `targets` that union into the day's tickers,
   AND every legacy mutation still appends its history delta in the same
   transaction. Post-merge gate: full unit suites green + the 72
   history/persistence itests (against `civ0_test`) green + whole-repo
   `./node_modules/.bin/tsc --noEmit` no worse than the 2 pre-existing
   `packages/engine` errors.
2. **PR `v2` → `master`** (branch-isolation rule: never direct-commit master).
   Review, then merge.
3. **Deploy Jul 3, after R32 results:** `git pull` in `/opt/civilization-0`
   (live tick runs `tsx` from source — applies next tick, no restart), then
   manual `vercel --prod --yes` (web does NOT auto-deploy). `HISTORY_ENFORCE`
   stays **unset** in prod — behavior-preserving; Proof A warn-only. The first
   post-deploy tick runs `ensureEpoch` → genesis epoch captured → every tick
   from then on is explainable. Pre-epoch ticks correctly refuse (Invariant #5).
4. **Verify live:** watch 2–3 scheduled ticks, then run `civ state`,
   `history coverage`, and `civ explain` against prod, and load
   `/explain/[citizen]/[tick]` for a post-epoch tick on the live app.
5. **Rollback plan:** `git checkout` the previous master commit in the live
   checkout + redeploy Vercel. Epoch/event rows are additive — no data risk.

## Workstream B — Reasoning-provenance reframe

Copy-only branch → PR → master. README top section and the `/verify` page get
the sharp one-line contrast: *the field does reputation of outcomes (ERC-8004
Validation registry, Assay); Civilization-0 does provenance of reasoning —
reconstruct **why**, keyless, from the network.* Ships with the Jul 3 Vercel
deploy.

## Workstream C — Demo video re-cut (~2 min)

New spine: hook → whisper a citizen → tick lands → causal chain with Social
node → **new beat:** `/explain` (or `civ explain`) shows the full event-sourced
history behind that exact decision, folded from genesis → keyless `/verify`
badge pull → product line. Recorded Jul 3–4 against live prod.

R32 honesty rules carry over: never fake the loop; interventions apply on the
next tick (intervene before recording or run one manual tick against the prod
DB — never while the 2h timer could fire, never alongside the web server).

If ERC-8004 makes the gate, add one ~10s beat: citizen page → on-chain identity
tx on 0G.

## Workstream D — ERC-8004 on 0G (stretch, hard-gated)

Branch-isolated. Minimal IdentityRegistry (ERC-8004 reference implementation)
deployed to 0G Galileo (chainId 16602); all citizens + orgs registered via
on-chain txs; identity surfaced on citizen pages with tx links.

**Gate: merges only if deployed + registered + demo-able by Jul 4, 23:59 UTC.**
(The R32 lock was 10:00 UTC; assume R16 locks Jul 5 10:00 UTC — the gate leaves
a ~10h buffer, no lock-morning pushes.) If it misses, nothing else is blocked —
it becomes the Jul 8 final-lock centerpiece with 3 extra days.

## Explicitly out of scope

- SUBMISSION.md "since R32" iteration table + a UI link to `/explain`
  (deliberate: the demo video + reframed copy carry discovery).
- Off-chain-only ERC-8004 identity (on-chain-on-0G or not at all this round).
- Org treasury delta (Phase 1B deferred item) — unchanged.
- Arming `HISTORY_ENFORCE` in prod.

## Success criteria

1. R16 snapshot (master at Jul 5 lock) contains the history engine, merged and
   deployed, with live prod showing epoch-covered explainable ticks.
2. Demo video linked, matching the code, showing the explain beat end-to-end.
3. `/verify` + README carry the reasoning-provenance framing.
4. Live app healthy through the R32 scoring window (Jul 1–3) — no prod changes
   before results.
5. (Stretch) Citizens resolvable as ERC-8004 identities on 0G with tx links.
