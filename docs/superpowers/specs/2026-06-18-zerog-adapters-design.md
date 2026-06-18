# Civilization-0 — Slice 1: 0G Adapters Design Spec

**Date:** 2026-06-18
**Status:** Approved (pending written-spec review)
**Depends on:** Slice 0 (core causality engine, merged to `master`)

---

## 1. Goal

Implement the real `ZeroGStorage` (0G Storage) and `ZeroGComputeBrain` (0G Compute) behind the existing `StorageProvider` / `BrainProvider` interfaces, so a citizen literally **thinks on 0G Compute** and **archives on 0G Storage** — while the Vitest suite stays **deterministic and network-free**. Capture **TEE verification metadata** so every decision can prove it ran on 0G.

**Live proof (the deliverable that matters):** `scripts/demo-live-tick.ts` runs ONE real `runCitizenTick` where the decision is produced by 0G Compute and the trace+event are archived to 0G Storage, printing the model's decision, its `decision_memories`/`decision_beliefs`, the on-chain provider + verification, and the real `rootHash`/`txHash`.

---

## 2. Package: `@civ/zerog` (infrastructure layer)

A **dedicated package**. `brain`/`storage` remain pure domain packages (interfaces + Fakes, zero heavy deps). `@civ/zerog` is the infrastructure layer that imports those interfaces and implements them against real networks.

```
packages/
  brain/      BrainProvider, FakeBrain            (pure domain — unchanged deps)
  storage/    StorageProvider, FakeStorage        (pure domain — unchanged deps)
  zerog/      ZeroGStorage, ZeroGComputeBrain,
              ZeroGConfig, SDK wrappers, scripts   (infrastructure)
```

This keeps the dependency direction clean (`engine → interfaces → impls`) and lets future `AnthropicBrain` / `S3Storage` land the same way without contaminating domain packages.

**Dependencies added to `@civ/zerog`:** `ethers@6`, `@0gfoundation/0g-storage-ts-sdk`, `@0gfoundation/0g-compute-ts-sdk` (exact published names/versions verified against npm in the plan's first task — there is a live `@0glabs` vs `@0gfoundation` naming split), plus dev: `tsx`, `dotenv`.

---

## 3. The testability seam (keeps Vitest green)

Each adapter = **(a) a thin real network client** (wraps the SDK; NOT run by the unit suite; validated by smoke scripts) + **(b) pure logic** (unit-tested with fakes).

- `ZeroGStorage` is constructed with an injected `Uploader`:
  ```ts
  interface Uploader { upload(bytes: Uint8Array): Promise<{ rootHash: string; txHash: string }>; }
  ```
  Pure logic (unit-tested with a fake uploader): serialize `archive(key, data)` → bytes, map result → `ArchiveResult`, error wrapping.

- `ZeroGComputeBrain` is constructed with an injected `Chat`:
  ```ts
  interface Chat { complete(messages: ChatMessage[]): Promise<ChatResult>; }
  interface ChatResult { content: string; provider: string; model: string; requestId?: string; verified?: boolean; verification?: unknown; }
  ```
  Pure logic (unit-tested with a fake chat): **prompt construction** + **3-phase JSON → DecisionResult** parse/repair/coerce.

Real clients (`RealUploader`, `RealChat`) wrap the SDKs and are exercised only by the smoke/demo scripts.

---

## 4. `ZeroGComputeBrain` — 3-phase JSON handling (the engineering core)

`decide(ctx)`:

1. **`buildMessages(ctx)`** — system prompt (role discipline + the action menu + the strict output schema) + user prompt = the structured cognitive stack: identity, traits, goals, retrieved **memories with ids**, **beliefs with ids**, relationships, world state. The schema instructs: return ONLY JSON `{action, targetId, reasoning, memoryWeights, beliefWeights}`, weighting only ids that appear in the provided lists.

2. **`chat.complete(messages)`** → `ChatResult` (raw content + execution metadata).

3. **`parseDecision(content, ctx)` — three phases:**
   - **Phase 1 — extract & parse:** strip ``` fences, extract the first balanced `{...}`, `JSON.parse`. If unparseable → trigger a single **repair** retry (phase order below).
   - **Phase 2 — repair (one retry only):** re-call `chat` with a repair instruction ("Your previous output was not valid JSON matching the schema. Return ONLY the JSON object."). Then re-attempt phase 1 once.
   - **Phase 3 — normalize/coerce (always, on whatever parsed):**
     - `targetId ??= null`, `reasoning ??= ""`, `memoryWeights ??= {}`, `beliefWeights ??= {}`.
     - **Hard subset invariant (by construction):** filter weight keys so
       `Object.keys(memoryWeights) ⊆ retrievedMemoryIds` and `Object.keys(beliefWeights) ⊆ retrievedBeliefIds`. A hallucinated `memory_999` is **dropped**, never recorded.
     - Coerce weight values to finite numbers in `[0,1]`; drop non-numeric.

   **Throw `ZeroGBrainError` only when:** no JSON could be recovered after the repair retry, OR `action` is missing / not in `ctx.availableActions`. Everything else is recoverable via coercion.

4. **Attach `ExecutionMeta`** (provider, model, requestId, verified, verification) from `ChatResult` onto the returned `DecisionResult.meta`.

The real `RealChat` performs: `getRequestHeaders(provider)` (single-use) → POST `${endpoint}/chat/completions` → read `chatID` → `broker.inference.processResponse(provider, chatID)` to populate `verified`/`verification`.

---

## 5. `ZeroGStorage` — thin

`archive(key, data)` → `JSON.stringify({key, data})` → `TextEncoder` bytes → `uploader.upload(bytes)` → `{ rootHash, txHash, ts: Date.now() }`. (Wall-clock `ts` is fine here — the determinism constraint is on the engine; `FakeStorage` remains deterministic for tests.) `RealUploader` wraps `new MemData(bytes)` + `indexer.upload(memData, RPC, signer)`, mapping the `[tx, err]` tuple and surfacing `err` as a `ZeroGStorageError`.

---

## 6. Verification capture (cross-package, additive & optional)

Define in `@civ/shared` (base package, so no inverted dependency):
```ts
export interface ExecutionMeta {
  provider: string;        // 0G Compute on-chain provider address
  model: string;
  requestId?: string;
  verified?: boolean;      // result of processResponse (TEE)
  verification?: unknown;  // raw verification payload
}
```
- `@civ/brain`: `DecisionResult.meta?: ExecutionMeta` (imports `ExecutionMeta` from `@civ/shared`; `FakeBrain` omits it).
- `@civ/shared`: `Decision.meta?: ExecutionMeta`; `DecisionTrace.trace.meta?: ExecutionMeta` (so the proof is archived to 0G alongside the "why").
- `@civ/engine`: `runCitizenTick` copies `result.meta` onto the `Decision`.
- `@civ/explainability`: `buildAndArchive` copies `args.decision.meta` into `trace.trace.meta`.
- All fields optional → existing Slice 0 tests unaffected (FakeBrain returns no meta).

This makes the chain answer the judge's question by construction:
`Decision → 0G provider → verification payload → archived on 0G Storage`.

---

## 7. Config (dependency-injected, never global)

```ts
export interface ZeroGConfig {
  privateKey: string;
  evmRpc: string; storageIndexer: string;
  computeProvider?: string; computeModel?: string;
  fund: { deposit: number; transfer: bigint };
}
export function loadZeroGConfig(env: Record<string,string|undefined>): ZeroGConfig;
```
Factories `createZeroGStorage(config)` / `createZeroGComputeBrain(config)` wire the real clients. Adapters never read `process.env` internally. `.env` (gitignored) holds `ZG_PRIVATE_KEY`, `ZG_EVM_RPC`, `ZG_STORAGE_INDEXER`, `ZG_COMPUTE_PROVIDER`, `ZG_COMPUTE_MODEL`. (Wallet already generated: `0xB44c6D45c352B8313067945c30479E26a21c78bc`.)

---

## 8. Build order (product before infra)

1. `ZeroGStorage` + pure-logic unit tests (fake uploader).
2. `scripts/smoke-0g-storage.ts` — archive a sample object → print real `rootHash`/`txHash`.
3. `ZeroGComputeBrain` + pure-logic unit tests (fake chat: valid/fenced/garbage/missing-fields/hallucinated-id/invalid-action).
4. `scripts/smoke-0g-compute.ts` — `listService()` → print catalog; **self-bootstrap ledger** (idempotent `depositFund`+`transferFund` if unfunded); run one `decide()`; print decision + `verified`.
5. `scripts/demo-live-tick.ts` — **the proof**: seed Ada, real `ZeroGComputeBrain` + `ZeroGStorage`, one `runCitizenTick`; print decision, `decision_memories`/`decision_beliefs`, provider+verification, and the archived trace `rootHash`/`txHash`.
6. `scripts/setup-0g-compute.ts` — polished, reusable funding/ledger management (extraction of the self-bootstrap logic), built last.

Smoke/demo scripts run via `pnpm tsx scripts/... ` with `.env` loaded by `dotenv`; they are NOT part of the Vitest suite.

---

## 9. Error handling

Typed `ZeroGStorageError` / `ZeroGBrainError` wrap SDK/network failures with actionable messages (e.g. insufficient balance → "fund 0x… at faucet.0g.ai"). Smoke scripts surface them clearly and exit non-zero.

---

## 10. Testing & scope

- **Vitest stays deterministic & network-free**: pure logic only (prompt build, 3-phase parse/coerce, subset-filter, serialization, result mapping, error wrapping). Real network clients are never run in units.
- **Live validation** = the smoke/demo scripts, run manually with `.env`.
- **Hard-invariant tests**: hallucinated memory/belief ids are dropped; weights coerced to `[0,1]`; missing optional fields defaulted; invalid `action` throws; unparseable-after-repair throws.
- **Not in scope:** Postgres/pgvector, multi-citizen scaling, UI, mainnet, Narrative/newspaper.

---

## 11. Files

```
packages/zerog/
  package.json, tsconfig.json
  src/
    config.ts          ZeroGConfig + loadZeroGConfig
    errors.ts          ZeroGStorageError, ZeroGBrainError
    storage.ts         ZeroGStorage (+ Uploader interface) + createZeroGStorage
    real-uploader.ts   RealUploader (Indexer + MemData + ethers)
    brain.ts           ZeroGComputeBrain (+ Chat interface, buildMessages, parseDecision) + createZeroGComputeBrain
    real-chat.ts       RealChat (broker: headers + fetch + processResponse)
    index.ts           public exports
    *.test.ts          pure-logic unit tests (storage, brain parsing)
  scripts/
    smoke-0g-storage.ts, smoke-0g-compute.ts, demo-live-tick.ts, setup-0g-compute.ts
# additive edits: packages/shared (ExecutionMeta, Decision.meta, DecisionTrace.trace.meta),
#                 packages/brain (DecisionResult.meta), packages/engine (persist meta onto Decision),
#                 packages/explainability (copy decision.meta into trace.trace.meta)
```
