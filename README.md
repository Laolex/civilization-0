# Civilization-0

### Prove *why* an AI decided — trustlessly, on 0G.

Autonomous agents make decisions no one can audit. Civilization-0 is a **verifiable provenance layer for agentic AI** built on [0G](https://0g.ai): every decision is **reasoned on 0G Compute**, and its full causal chain — *the memory that shaped the belief that drove the decision* — is **archived on 0G Storage**, where **anyone can independently verify it with no trust in the operator.**

We prove it with the hardest possible demo: **a persistent AI society that runs itself.** Citizens think on 0G Compute, their entire history lives on 0G Storage, and the world keeps evolving on its own — verifiably.

---

## The 30-second version

1. AI **citizens** (and **organizations**) reason about what to do — on **0G Compute** (real testnet inference, TEE-verified).
2. The decision's causal chain is recorded: **Memory → Belief → Decision → Event → Trace** — capturing the brain-weighted inputs that *actually drove* the choice, not just what was retrieved.
3. That trace is **archived to 0G Storage**, addressable by root hash.
4. **Anyone** can recover it from 0G by root hash alone — **no private key, no trust in us** — and confirm the decision was real and verified. That's the moat: rip out 0G and the product doesn't exist.

> **Why 0G is load-bearing:** the reasoning runs on 0G Compute (with cryptographic `verified: true`), the permanent record lives on 0G Storage, and verification is keyless against the network. A normal app would just ask you to trust its database. This one doesn't.

---

## See it live

The world is **running autonomously right now** — a systemd timer advances it on real 0G every 2 hours.

- **`/world`** — the live dashboard: current day, population, recent events, each tagged **0G Compute ✓ / 0G Storage ✓**.
- **`/citizens/[id]`** — any citizen's profile: life story, relationships, wealth, and the **causal chain** behind their latest decision (Memory → Belief → 0G Compute → Decision → Event → 0G Storage).
- **`/orgs`** — organizations that reason as agents in their own right (treasury, members, strategy decisions).
- **`/history`** — searchable world history; every event links to its on-chain proof.
- **`/verify/<rootHash>`** — **the money shot**: paste any decision's root hash (or click a "0G Storage ✓" badge anywhere in the app) and the page recovers the record straight from 0G Storage, keyless, and shows you the verified reasoning. Try it yourself.

### Verify a real decision yourself
Every "0G Storage ✓" badge in the app is a live link to `/verify/<root>`. Pick any decision on `/world` or `/history`, click its badge, and watch the record get pulled back from 0G Storage by its hash alone.

---

## What's built

A complete, working product — not a mockup:

| Layer | What it does |
|---|---|
| **Causality engine** | Pure TypeScript: citizens have memories (pgvector), beliefs, goals; the brain weights inputs to make a decision. Deterministic, fully tested. |
| **0G adapters** | `ZeroGComputeBrain` (reasoning on 0G Compute, TEE-verified) + `ZeroGStorage` (trace archival) + a **keyless verifier** that recovers records from 0G Storage with no signer. |
| **Persistence + scheduler** | Postgres/pgvector world state; a cost-gated scheduler that ticks the world on 0G and **survives restarts**. |
| **Organizations** | Orgs reason *as agents* on 0G via a persona adapter — strategy, hiring, treasury. |
| **History + provenance** | Searchable event history; deterministic + 0G-narrated citizen life stories; provenance everywhere. |
| **Multi-tenant product** | Auth, public/private worlds, user-created citizens, Free/Pro/Research plan tiers. |
| **Economics** | Wealth + treasury move with every decision; stakes compound over the autonomous days. |
| **Research API** | `GET /api/provenance/records` — export the verifiable, 0G-reasoned decision dataset (API-key gated). The moat as a product. |

**Proven live on 0G testnet (chainId 16602):** citizens *and* organizations *and* user-created agents have all reasoned on 0G Compute with `verified: true`, archived to 0G Storage, and been recovered keyless — e.g. an org decided `invest` (verified, root `0x3315311c…`); a user-created citizen reasoned `start_company` (verified); a citizen's life was narrated on 0G (verified, root `0x39f76cb7…`).

---

## Architecture

TypeScript ESM monorepo (pnpm). 0G SDKs are TS-first, so the whole stack is one language.

```
packages/
  shared          types + the causality model
  engine          the decision engine (pure, deterministic)   ← never touched by features
  store           in-memory world store
  memory          pgvector-backed memory retrieval
  beliefs         worldview revision
  brain           BrainProvider interface (FakeBrain for tests)
  storage         StorageProvider interface (FakeStorage for tests)
  explainability  builds the DecisionTrace + archives it
  zerog           REAL 0G: ZeroGComputeBrain, ZeroGStorage, keyless downloader/verifier
  provenance      the SDK facade: civ.trace(...) → reason on 0G, record drivers, archive, return verifyUrl
  persistence     Postgres/pgvector; pg-light read path for the keyless web
  scheduler       ticks the world on 0G (cost-gated), org ticks, economics, live narration
apps/
  web             Next.js 14 — the dashboard, profiles, history, verifier, auth, tiers, Research API
```

**Design rule held across the whole build:** the engine (`packages/engine`) and world store (`packages/store`) are **byte-for-byte unchanged** by every feature — orgs, history, user citizens, monetization, economics all sit *around* the core, never inside it. The web read path is **keyless** (no private key ever touches the browser-facing server) and **pg-light** (never bundles the heavy engine graph).

**Stack:** Node 20, pnpm 9.15.4, TypeScript, Next.js 14 (App Router), Postgres 16 + pgvector, `@0gfoundation/0g-{storage,compute}-ts-sdk`. ~95 unit tests + ~37 integration tests, all green.

---

## Run it

```bash
# 1. Install
pnpm install

# 2. Postgres (local) — DATABASE_URL in .env
#    DATABASE_URL=postgres://civ:<pw>@127.0.0.1:5432/civ0

# 3. Migrate + seed a world
pnpm -C packages/persistence exec tsx --env-file=../../.env -e "import('./src/migrate.ts').then(m=>m.migrate())"
pnpm -C packages/scheduler exec tsx --env-file=../../.env scripts/seed-world.ts

# 4. Tick the world on real 0G (needs ZG_PRIVATE_KEY funded on 0G testnet; spends ~0.0024 OG/tick)
cd packages/scheduler && set -a && . ../../.env && set +a && \
  pnpm exec tsx --conditions require scripts/run-scheduler.ts --days 1

# 5. Web dashboard (keyless — DATABASE_URL only, never the 0G key)
DATABASE_URL=... pnpm -C apps/web dev    # → http://localhost:3000
```

Tests: `pnpm test` (unit, network-free) · `pnpm test:it` (integration, needs Postgres).

> **Note:** never commit `.env`. The web server runs **keyless** — it reads Postgres and verifies *against* 0G, but never holds the signing key.

---

## The thesis

As agents get more autonomous, "trust our logs" stops being good enough — especially where decisions are adversarial, on-chain, multi-party, or regulated. Civilization-0 makes an AI's reasoning **independently verifiable by anyone, forever**, using 0G as the compute-and-storage substrate. The civilization is the proof; the **verifiable provenance layer is the product.**

*Built for the 0G hackathon.*
