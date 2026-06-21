# Product

## What It Does
Civilization-0 makes an autonomous AI agent's reasoning independently verifiable by anyone, forever. Every decision is reasoned on 0G Compute (TEE-verified) and its full causal chain is archived to 0G Storage, addressable by root hash and recoverable keyless. The flagship demo is a persistent AI society — citizens and organizations that think, act, and evolve on real 0G — but the sellable product is the provenance layer underneath it.

## Key Features
1. **`civ.trace(...)` SDK (`@civ/provenance`)** — wrap any agent decision; reason on 0G Compute, record the drivers, archive to 0G Storage, return a public `verifyUrl`. The whole idea in one API call.
2. **Keyless verifier (`createVerifier`)** — recover any decision record from a public 0G Storage endpoint by root hash alone. No signer, no trust in the operator.
3. **`drivers` provenance** — captures the brain-weighted memories/beliefs that actually drove the decision, not just what was retrieved.
4. **Research API (`GET /api/provenance/records`)** — export the verifiable, 0G-reasoned decision dataset, API-key gated. "The moat as a product."
5. **Live demo product** — `/world`, `/citizens/[id]`, `/orgs`, `/history`, `/verify/<rootHash>` — a running, self-advancing AI society with provenance badges everywhere.

## Tech Stack
TypeScript ESM monorepo (pnpm). Node 20, Next.js 14 (App Router), Postgres 16 + pgvector, `@0gfoundation/0g-{storage,compute}-ts-sdk`. ~95 unit + ~37 integration tests, all green. Web read path is keyless and pg-light (never holds the signing key, never bundles the engine).

## Moat / Defensibility
0G is load-bearing — reasoning runs on 0G Compute, the permanent record lives on 0G Storage, verification is keyless against the network. A normal app just asks you to trust its database; this one doesn't. The `drivers` record (what actually drove a decision) plus keyless verification is the differentiated core. Switching cost: once provenance is wired into an agent stack and external parties rely on the verify links, it's load-bearing.

## Product Milestones
- Jun 2026: V1 complete — all 5 slices merged (persistence/scheduler/world; orgs-as-agent; history explorer; user-created citizens; monetization).
- Jun 2026: Proven live on 0G testnet (chainId 16602) — citizens, orgs, and user-created agents all reasoned on 0G Compute with `verified: true`, archived to 0G Storage, recovered keyless.
- World runs autonomously now — a systemd timer advances it every 2 hours (~0.0024 OG/tick).

## Plan Tiers (built, pricing TBD)
- **Free** — public worlds, population/analytics limits.
- **Pro** — private worlds, higher population cap.
- **Research** — `@civ/provenance` API access; pull provenance records / export the verifiable decision dataset. This is the commercial core.

> Dollar pricing for each tier is not yet set — handled later via `pricing-strategy`.

## Roadmap (Next 12 Months)
[NEEDS YOUR INPUT — testnet → mainnet? SDK GA? first design partners? what's the next 3 priorities now that V1 is proven?]
