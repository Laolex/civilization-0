# Changelog

All notable changes to Civilization-0 are documented here.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- **Offline experiment harness** (`@civ/zerog/eval`). Run a curated set of
  decision scenarios through a brain variant, grade each with the 0G judge, and
  log an Opik **experiment** with aggregated `in_character`/`goal_alignment`
  scores — so two runs render as a side-by-side comparison. `ZeroGComputeBrain`
  now accepts an injectable `PromptBuilder`, enabling in-run prompt A/B
  (`promptV1` vs `promptV2`). `InCharacterMetric` wraps the judge as an Opik
  scoring metric (two dimensions per item; ungradeable items omitted, not zeroed).
  `runDecisionExperiment` has injectable `evaluate`/client seams for tests.
  Eval modules are intentionally not re-exported from the package index, keeping
  the SDK out of the core lazy-Opik path. Scripts: `run-experiment.ts` (real 0G
  A/B) and `smoke-experiment.ts` (verifies the harness with zero 0G spend).
- **Opik LLM tracing** (`@civ/zerog`). Every `BrainProvider.decide()` becomes one
  Opik trace; every underlying `Chat.complete()` (including the JSON-repair retry)
  becomes a nested `llm` span carrying messages, output, model, token usage, and
  the 0G `verified`/`requestId` flags. Wired once in `createZeroGComputeBrain()`,
  so the engine tick, provenance wrapper, and scripts are all covered. Decorators
  are exact pass-throughs unless `OPIK_API_KEY` is set, and any Opik SDK error is
  swallowed — tracing can never break a tick. `ChatResult` gained an optional
  `usage` field. New `scripts/smoke-opik.ts` verifies tracing without spending 0G.

## [1.0.0] - 2026-06-22

First complete release. An autonomous AI civilization that ticks forward on a
schedule, reasons live on the 0G network, narrates and verifies its own history,
and exposes a provenance/audit layer — packaged with monetization (auth, private
worlds, Free/Pro/Research tiers). All five V1 slices merged to `master`.

### Added

#### Core causality engine (Slice 0)
- Domain types, action verbs, and a cosine-similarity helper (`@civ/shared`).
- `WorldStore` interface + `InMemoryWorldStore`; snapshot dumping all collections.
- `BrainProvider` interface + scripted `FakeBrain`; `StorageProvider` + deterministic `FakeStorage`.
- Memory retrieval/ranking via `FakeEmbedder` + `MemoryIndex`.
- `BeliefReviser` interface + `RuleBasedBeliefReviser` (polarity + source-memory dedup).
- `runCitizenTick` composing the full causality loop; seeded Ada multi-day scenario as a causality proof.
- Explainability: build + archive `DecisionTrace`; `ExecutionMeta` propagated to decision and archived trace.

#### 0G integration (Slice 1)
- `@civ/zerog` package: config loader, typed errors, package barrel.
- `ZeroGStorage` adapter + `RealUploader` (0G Storage) with smoke scripts.
- `ZeroGComputeBrain` / `RealChat` (0G Compute broker) with 3-phase JSON parse → repair → coerce and subset invariant; self-bootstrapping compute smoke script.
- `RealDownloader` (`downloadToBlob`) + keyless `createZeroGDownloader` (indexer URL only); `parseArchivedTrace`.
- Reusable ledger-setup script + operator runbook; live one-tick demo (think on 0G, archive on 0G).
- Canonical `world.json` committed with real 0G proofs (`seed-ada`).

#### Explainability UI (Slice 4A)
- Next.js app scaffold + landing; workspace + vitest wired.
- `/citizens/ada` with story, timeline, and graph reveal; custom expandable `CausalChain` component.
- Live `VerifyOnZeroG` component + `/api/verify` route.

#### Persistence + autonomous scheduler + World Dashboard (Slice 1, productionized)
- `@civ/persistence` package: connection pool, world schema + migration runner.
- `WorldRepository.loadContext` hydrating a sync store; transactional `persistTick`; FK-safe `resetWorld` fixture.
- Scheduler: `runDay` load→tick→persist loop, tier-based tick selection, seeded starting population.
- Live 0G runnable + systemd unit + cost gate; World Dashboard reads the persistent world.

#### Organizations / org-as-agent (Slice 2)
- `Organization` + `Membership` types and org actions; organizations + memberships schema.
- `OrgRepository` load/persist; `runOrgTick` org-as-agent persona adapter; `runOrgDay` on the 0G path.
- Emergent org founding + org seed; `/orgs` list + org detail with 0G verify links.

#### World History Explorer (Slice 3)
- Narratives table + read/write repo; `searchEvents` history projection.
- Deterministic life-story generator; `/history` explorer with search + life story.
- `ZeroGBadges` provenance component on world + org surfaces; live 0G life-story narration with cost gate.

#### User-created citizens (Slice 4)
- Keyless `POST /api/citizens` + pg-only `createCitizen` write path.
- Citizen creation form + world CTA; generalized DB-backed `/citizens/[id]` profile.
- pg-light citizen profile + decision causal-chain reads; `toCausalChain` shaping helper.

#### Monetization (Slice 5)
- Auth + worlds schema + genesis seed; auth write path (scrypt + sessions + API keys).
- Signup / login / account pages; auth API routes + `getCurrentUser`.
- World creation API + citizen world-scoping + `/worlds`; world write path + plan limits.
- Research provenance API + key minting + account actions; pricing page + nav.
- Wallet login (SIWE) side-by-side with email — nonce + verify routes, `upsertWalletUser`, two-panel `/login`.

#### Economics
- `economicDelta` per-action ledger; citizen wealth and org treasury move per tick.

#### Hackathon / brand surfaces
- Submission README + live proof-of-liveness landing strip; 2-minute demo script.
- Living world map (citizens drift as glowing dots → relationship constellation); cinematic causal-chain reveal + 0G glow + live pulse.
- "Observatory" design system across the whole app; global nav + footer.
- Project logo + cover thumbnail (Observatory constellation mark); `/brand` preview page.

### Changed
- Repositioned the project as a **provenance / audit layer**, with the civilization as Exhibit A; shipped `@civ/provenance` SDK + keyless verify host.
- Landing nav opened to the live product + account logout.
- Scheduler cadence moved to a cost-gated autonomous 2h tick (`OnCalendar`), with `TimeoutStartSec=600` so a wedged 0G upload can't freeze autonomy, and tick-success logging via `ExecStopPost`.
- `createZeroGDownloader` made keyless (indexer URL only).

### Fixed
- **Created citizens can tick**: embed backstory memory so every persisted citizen has its required embedding (a missing 64-dim embedding crashed the tick).
- Provenance badge links to the verifiable trace root, not the raw event archive; `civ.provenance/v0` record archived so world traces verify keyless.
- Self-host correctness: session-cookie `secure` flag gated on `COOKIE_SECURE`; tick-log psql handles `sslmode=no-verify`.
- Engine: write event after its causal decision; guard `cosineSimilarity` against length mismatch.
- 0G: preserve upload/storage error cause; small env-overridable fund amounts so live compute/storage run on a lightly-funded wallet; ledger floor default 3 OG.

[1.0.0]: https://github.com/Laolex/civilization-0/releases/tag/v1.0.0
