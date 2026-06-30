# GraphRAG neighbor retrieval — progress ledger
Branch: feat/graphrag-neighbor-retrieval | worktree: /opt/civilization-0-graphrag
Merge-base(master): 8517dfadb8348b665e0ba3a3e53377be5015ca55
Plan: /opt/civilization-0-graphrag/docs/superpowers/plans/2026-06-25-graphrag-neighbor-retrieval.md

Task 1: complete (commits bc65db3..e960208, review clean)
  Minors(final-review): clamp01 used for strength but relevance clamp inline; relevance-floor test relies on FakeEmbedder hash non-collision; report LOC misstatement (cosmetic)
Task 2: complete (commits e960208..498a038, review clean)
  Minor(final-review): WorldStore accessor methods placed before snapshot() not after (cosmetic, interfaces unordered)
Task 3: complete (commits 498a038..473a0f1, review clean)
  Minor(final-review): ctxWith test helper at module scope (style). NOTE: 2 pre-existing OPIK_API_KEY failures in zerog eval/judge-metric.test.ts — unrelated to this branch
Task 4: complete (commits 473a0f1..19806c8, review clean)
  Minor(final-review): degrade test doesn't assert orgDriver still populated (benign coverage gap)
Task 5: complete (commits 19806c8..1ab87ad, review clean + 1 spec-gap fix)
  Fixed: graceful-degradation try/catch (spec-mandated, plan omitted) + latestReasoning assertion. Verified try wraps only GraphRAG block, return store outside catch
Task 6: complete (commit 1ab87ad..f8497f7, diff verified: import + makeTickDeps graphRetriever line)
Task 7: complete (acceptance commit 91b5d35). LIVE on 0G: ada invest->Marcus verified=true, socialDrivers[marcus 0.31, lena 0.07]+orgDriver, reproducible MATCH, OG 0.008252/4 citizens


Final whole-branch review (opus): Ready-to-merge WITH FIXES. Fixed in 4d748df: archive raw inputs (trust/influence/neighborText/socialQuery) -> verifiable-retrieval claim now literally true (recomputed from scratch MATCH on real 0G); env-knob NaN guards; doc wording. No Critical/Important remaining.
============================================================
# Social Reasoning UI — progress ledger
Branch: feat/graphrag-neighbor-retrieval | worktree: /opt/civilization-0-graphrag
BASE for this plan: c72a94a (docs: spec+plan commit)
Plan: docs/superpowers/plans/2026-06-27-social-reasoning-ui.md
Spec: docs/superpowers/specs/2026-06-27-social-reasoning-ui.md
Task 1: complete (commits c72a94a..5371a8d, review clean)
  Minor(task-review): "degrades" test lacks negative assertion `decision.meta?.socialDrivers === undefined` (coverage gap, guard logic correct in diff)
Task 2: complete (commits 5371a8d..b4cf544, review clean)
  Minor(task-review): citizens/[id]/page.tsx redundant `socialDrivers: chainRaw.socialDrivers` no-op spread override (cosmetic); one new test was green-in-RED (benign)
Task 3: complete (commits b4cf544..75e8ecc, review clean; ⚠️ resolved: --slate IS defined :root line 5)
  Minor(task-review): .sd-bar track uses rgba(255,255,255,.06) decorative (allowed, not text/border); CausalChain social test doesn't re-exercise recompute toggle (covered in SocialDrivers unit test)

============================================================
# @civ/history Event Engine — Phase 1A — progress ledger
Branch: feat/history-event-engine | worktree: /opt/civilization-0-history
BASE for this plan: bfee34d (docs: Phase 1A plan commit)
Plan: docs/superpowers/plans/2026-06-27-history-event-engine.md
Spec: docs/superpowers/specs/2026-06-27-history-event-engine-design.md
Pre-flight: deep @civ/x/src/y imports OK (precedent @civ/zerog/src/download); .env -> civ0_test provisioned (isolated from live civ0); Task12 fix=deep import buildCognitiveTransition; Task1 fix=add @civ/history to tsconfig.base paths.

Task 1: complete (commit 90e6263, BASE bfee34d; review Approved). 2/2 unit tests pass, `pnpm -r typecheck` clean across 14 projects. Scaffold-only: @civ/history package + Phase 1A type surface + 4-invariants doc comment + SCHEMA_VERSION/CANON_VERSION/GENESIS_PARENT/eventKind/WorldState/ExplainView; tsconfig.base path registered.
  Minor(task-review, NOT fixed): (a) GENESIS_PARENT not `as const` — spec-faithful, 0 consumers, skip; (b) reviewer suggested schemaVersion:`typeof SCHEMA_VERSION` literal — REJECTED, fights Invariant #4 (readers must dispatch on versions ≠ 1, field stays `number`); (c) eventKind test uses `as` stubs — fine for smoke test. Implementer left stale report; controller reconstructed task-1-report.md from verified commit.

CURATION DECISION (Track B, Tasks 2-5): all are tiny verbatim-from-plan pure fns appended to one file (hash.ts/hash.test.ts). Controller verifies each diff byte-for-byte vs brief + green tests inline; ONE consolidated independent reviewer dispatch over the finished hash.ts runs at the Track B boundary (after Task 5) instead of per-task. Preserves independent-agent gate where it matters (cross-fn interactions in completed module), keeps velocity.

Task 2: complete (commit a24ed25, controller-verified verbatim vs brief). canonicalJSON (JCS-1) deterministic key-sorted serialization. 4/4 hash.test.ts pass, typecheck clean. No concerns. [independent review deferred to Track B boundary]
Task 3: complete (commit a926bbb, controller-verified). sha256Hex (0x+64hex) + eventHash (sha256 of canon(header)‖canon(payload)). Imports at top of hash.ts, fns appended. 8/8 pass, typecheck clean. No concerns. [review deferred to Track B boundary]
Task 4: complete (commit b95b5b2, controller-verified). merkleRoot binary tree (dup-last on odd, empty→sha256Hex(""), single→leaf). 11/11 pass, typecheck clean. No concerns. [review deferred to Track B boundary]
Task 5: complete (commit 2c6201d, controller-verified). verifyChain re-walk (recompute + parent-link, genesis anchor). 14/14 pass, typecheck clean.

TRACK B CONSOLIDATED REVIEW (commits 90e6263..2c6201d, hash.ts/hash.test.ts): Approved w/ 1 Important fix. All 5 fns spec-faithful, real-crypto tests, no mocks.
  IMPORTANT (FIXED, commit aebf316): verifyChain didn't cross-check row.event.header.parentHash vs envelope row.parentHash → a forged in-content ancestry could be recomputed to pass check1 + keep envelope correct to pass check2, embedding an undetected provenance lie (Invariant #3 content-level). Added 3rd check + RED-without-fix test "forged header ancestry". Also added empty-chain + empty-merkle tests, cleaned the plan's awkward "well-formed chain" test body, +V8/Node number-formatting note. 17/17 pass, typecheck clean.
  MINOR (noted, not blocking): merkle has no leaf/internal domain separation (RFC 6962 0x00/0x01) — fine for current contract (no inclusion proofs); if Merkle proofs added later, rebuild tree w/ domain separation. → record in architecture notes when Track H lands.
TRACK B COMPLETE (canon hash + chain, no DB). Tip: aebf316.

Task 6: complete (commit 09c28b4, controller-verified verbatim + pre-flighted @civ/shared types). buildCognitiveTransition: candidates/beliefDelta=null (Inv#1), schemaVersion stamped (Inv#4), socialDrivers from meta, eventsCreated recorded, wealth/relationship=[] (honest). 4/4 pass, typecheck clean. [independent review deferred to Track D boundary: review pure history layer build.ts+fold+project (Tasks 6,8,9) together]

Task 7: complete (commit 01fb587, LIVE ENGINE change). TickResult + return gain observation:{query,worldHeadline} + availableActions; engine imports nothing from @civ/history (inline structural types). Controller-verified the FULL diff directly = 4 provably-additive edits; only non-additive line passes identical `forced ?? ALL_ACTIONS` via named const (zero behavior change). Implementer used real setup() harness (citizen "ada"). Engine 13/13 pass (12 pre-existing UNCHANGED + 1 new), typecheck clean.
  GATE: behavior-neutrality verified by controller diff inspection + full pre-existing engine suite green. Live-engine change ALSO covered again in final whole-branch review (most capable model). No concerns.

Task 8: complete (commit 5b0c9cf, controller-verified verbatim). fold + worldStateKey: last-write-wins per (world,tick,actor). 2/2 pass, typecheck clean. [review at Track D boundary]
Task 9: complete (commit 5c1f535, controller-verified verbatim). project(...,'explain') -> ExplainView; null cognition -> 'unavailable' (Inv#1); mode!=='explain' throws /Phase 2/. 3/3 pass, typecheck clean. [review at Track D boundary]

TRACK D CONSOLIDATED REVIEW (sonnet, build.ts+reduce.ts+project.ts, Tasks 6/8/9): Approved. No Critical.
  IMPORTANT (FIXED, commit a7de6d1): reduce.ts worldStateKey joined on printable ":" → distinct triples collide if an id contains ":" (e.g. world "w:1"/actor "c1" vs world "w"/actor "1:c1" both → "w:1:1:c1"), silently dropping a transition in fold(). Fixed: switched to U+001F control separator (cannot occur in alphanumeric engine ids) + explicit runtime guard rejecting ids containing it + 2 tests (no-collision under ":", guard throws). 4/4 reduce tests pass, typecheck clean.
  MINORS (noted, not fixed): build.ts modelId/modelVersion always identical (cosmetic, add comment later); promptHash/worldHash empty until append() fills them (annotate at Task 11); no test for authenticated candidates:[] passthrough (Phase 2 concern, zero risk in 1A).
TRACK D COMPLETE (pure history layer: build + fold + project, no DB). Tip: a7de6d1.

TRACK E PRE-FLIGHT (DB tier, before dispatching Tasks 10-12):
  - @civ/persistence barrel exports migrate, getPool, closePool (./pool + ./migrate) ✓
  - test:it = `dotenv -e .env -- vitest run --config vitest.integration.config.ts`; .env→civ0_test so integration tests are PRODUCTION-SAFE (never touch live civ0) ✓
  - vitest.integration include = packages/**/*.itest.ts → history .itest.ts picked up ✓
  - schema.sql ends with RLS ALTER TABLE block (last: wallet_nonces); append history tables after it ✓
  - history_events/history_anchors do NOT already exist in schema.sql — new tables, no collision ✓
  - BLOCKER for Task 11: history package.json deps do NOT include @civ/persistence, but append.itest.ts imports {migrate,getPool,closePool} from "@civ/persistence". MUST add @civ/persistence: workspace:* to history devDependencies + pnpm install BEFORE Task 11 (controller setup step, not implementer guesswork).
  - Task11 Executor uses `any[]` (plan-verbatim); if strict typecheck rejects, implementer reports BLOCKED.

Task 10: complete (commit 88a1fb7, controller-verified diff = pure append +51/-0 after wallet_nonces RLS line, verbatim vs plan). history_events + history_anchors tables + 2 indexes + RLS on both. Integration test RED→GREEN 2/2 vs civ0_test. [review at Track E boundary]
TRACK E DEP SETUP (controller, commit 06e6e89): added @civ/persistence: workspace:* to @civ/history devDependencies + pnpm install; symlink packages/history/node_modules/@civ/persistence verified; reciprocal dev↔prod cycle resolved cleanly (ethers peer warning pre-existing/unrelated).
Task 11: complete (commit 4619c89). NOTE: first subagent (sonnet) died on a session limit before writing any file (tree clean, no commit) — controller executed inline instead (verbatim plan code, TDD RED→GREEN captured). append() + loadWorldEvents in append.ts; integration RED (module missing) → GREEN 1/1 vs civ0_test (chain links across appends, verifyChain ok from DB); typecheck clean (any[] Executor accepted). loadWorldEvents in append.ts, not read.ts.
Task 12: complete (commit e602a0a, controller inline). Wired buildCognitiveTransition+append into persistTick before COMMIT (Invariant #2, deep src imports @civ/history/src/{build,append,types}); added @civ/history dep to @civ/persistence + install (reciprocal cycle OK). Integration RED 2/2 → GREEN 2/2 (success: history row count == decision count; failure: duplicate event_id UNIQUE violation → whole tick ROLLBACK, no orphan decision).
  REGRESSION FOUND+FIXED (plan didn't foresee): repository.itest "persists a tick" broke — shadow append writes deterministic event_id ct-<decisionId>, but resetWorld did NOT truncate history_events, so rows accumulated across runs and the id collided (UNIQUE). Fix: added history_events+history_anchors to resetWorld's WORLD_TABLES (history is world state now). NOT in plan's commit file list — controller judgment; included in Task 12 commit. Full persistence integration suite GREEN 46/46 across 23 files after fix. typecheck clean (14 projects).
TRACK E IMPLEMENTATION COMPLETE (schema + append + persistTick wiring). Tip: e602a0a. → Track E consolidated review next.
