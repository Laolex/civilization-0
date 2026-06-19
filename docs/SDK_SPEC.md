# `@civ/provenance` — Verifiable Provenance for Agentic AI

> Product spec (draft). The SDK is the fundable product; Civilization-0 is its
> reference implementation and live demo. This document sketches the developer
> surface that turns the demo's `Memory → Belief → 0G Compute → Decision →
> Event → 0G Storage` chain into a drop-in primitive any AI agent can adopt.

## The problem we sell against

Autonomous agents increasingly make calls that move money or carry real
consequence (trading bots, prediction-market resolvers, DeFi agents, moderation
agents). When one of those calls is wrong, disputed, or audited, the builder
cannot answer the only question that matters: **"why did the agent decide that,
and can you prove it?"** Logs are mutable, off-chain, and self-attested.

`@civ/provenance` makes every agent decision **explainable, verifiable, and
permanent** by reasoning on 0G Compute and archiving the causal trace on 0G
Storage. The output is a public verify link anyone can independently check —
no trust in the operator required.

## Who it's for

- **Primary:** developers building agents on 0G that touch capital or
  high-stakes decisions.
- **Buyer's job-to-be-done:** debugging agent behavior, settling disputes,
  passing a compliance/audit check, earning user trust.

## Design principles

1. **One call.** Wrapping an existing agent must be a single function, not a
   migration.
2. **Verifiable by default.** Reasoning runs on 0G Compute with cryptographic
   verification (`verified: true`); the trace lands on 0G Storage.
3. **Keyless reads.** Anyone can verify a decision with only the public root
   hash — the verifier never needs a private key. (Mirrors the demo's keyless
   `/api/verify` route.)
4. **Drivers, not retrieval.** The trace records what *actually weighted* the
   decision (memories + beliefs with weights), not merely what was retrieved.
   This is the moat.

## Core surface

```ts
import { createProvenance } from "@civ/provenance";

// Reads 0G config from env (ZG_PRIVATE_KEY, ZG_COMPUTE_PROVIDER, …) and wires
// a real 0G Compute brain + 0G Storage. The write path needs the signer.
const civ = await createProvenance();

// Wrap a single agent decision. Inputs are the agent's *candidate* context;
// the brain decides which ones actually drove the call (the moat).
const result = await civ.trace({
  agent: "trading-agent-01",
  question: "ETH broke resistance — long, short, or hold?",
  memories: [{ id: "m1", summary: "ETH broke $3.2k on volume", importance: 8 }],
  beliefs:  [{ id: "b1", statement: "breakouts on volume follow through", confidence: 0.7 }],
  actions: ["open_long", "open_short", "hold"],   // constrain the action space
});

result.decision;   // { action: "open_long", targetId, reasoning }
result.drivers;    // { memories: [{ id: "m1", weight: 0.8 }], beliefs: [...] }
result.verified;   // true  — reasoning cryptographically verified on 0G Compute
result.rootHash;   // 0x… — record archived on 0G Storage
result.verifyUrl;  // https://verify.civ0.xyz/0x…  — public, keyless
```

> **Drivers, not retrieval.** `memories`/`beliefs` are what the agent *retrieved*;
> `result.drivers` is the brain-weighted subset that *actually drove* the
> decision. In the live run, `m2`/`m3`/`b2` were passed in but never recorded —
> only `m1@0.8` and `b1@0.7` were. That distinction is the product.

### What `trace()` does, in order

1. Sends the question + weighted inputs to **0G Compute** for inference.
2. Enforces the subset invariant (decision weights ⊆ provided input ids) and
   coerces the model output into a typed `Decision`.
3. Assembles the causal chain `Memory → Belief → 0G Compute → Decision`.
4. Archives the full `DecisionTrace` JSON envelope to **0G Storage**.
5. Returns the decision, the `verified` flag, the root hash, and a shareable
   keyless verify URL.

### Keyless verification (the public half)

```ts
import { createVerifier } from "@civ/provenance";

// No signer. Anyone, anywhere — needs only the public storage indexer.
const verify = createVerifier();
const record = await verify("0x44c3cc04…");

record.decision;       // { action: "open_long", targetId, reasoning }
record.drivers;        // the weighted drivers, recovered from 0G Storage
record.meta?.verified; // true — 0G Compute verification flag, as archived
```

This is exactly the path already proven live in the demo's `/api/verify` route
(`createZeroGDownloader` + `parseArchivedTrace`).

## What already exists vs. what's new

| Capability | Status |
|---|---|
| Reason on 0G Compute, verify, coerce to typed Decision | **Built** (`@civ/zerog` `ZeroGComputeBrain`) |
| Causal chain assembly + subset invariant | **Built** (`@civ/engine`, `@civ/explainability`) |
| Archive trace to 0G Storage | **Built** (`ZeroGStorage` / `RealUploader`) |
| Keyless download + parse archived trace | **Built** (`createZeroGDownloader`, `parseArchivedTrace`) |
| `createProvenance()` / `civ.trace()` / `createVerifier()` facade | **Built** (`@civ/provenance`) — proven live end-to-end |
| Public verify page (`/verify/<root>`) | **Built** — server-renders the keyless-recovered record; point `verify.civ0.xyz` DNS at it to make generated links resolve |

The SDK is a **facade over code that already runs live end-to-end** — and the
facade itself now runs live too: `packages/provenance/scripts/smoke-trace.ts`
reasoned on 0G Compute (`verified: true`), archived to 0G Storage
(`0x44c3cc04…`), and recovered the record keyless. The hard part (verifiable
inference + permanent provenance on 0G) is done; the remaining product work is
packaging, the hosted verify link service, and distribution.

## Distribution & funding path

1. **Win/place the 0G hackathon → 0G grant / ecosystem fund** (most direct).
2. **Become 0G's canonical audit/provenance primitive** — recommended in 0G
   agent docs; every agent project on 0G is a prospect.
3. **Viral loop:** every `verifyUrl` is shareable cryptographic proof.
4. **Later (Series A thesis):** "AI agents are about to control capital and
   decisions; nobody can audit them; we're the verifiable provenance layer."

## Open questions

- Pricing: per-trace fee vs. usage-based on 0G Compute/Storage cost + margin?
- Hosted verify service vs. pure client-side verification only?
- Framework adapters (LangChain / Vercel AI SDK / Eliza) as the wedge?
