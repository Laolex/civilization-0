# Civilization-0 — Slice 1: 0G Adapters Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement real `ZeroGStorage` (0G Storage) and `ZeroGComputeBrain` (0G Compute) behind the existing `StorageProvider`/`BrainProvider` interfaces, with TEE verification metadata captured end-to-end, while the Vitest suite stays deterministic and network-free.

**Architecture:** A dedicated `@civ/zerog` infrastructure package implements the domain interfaces against real networks. Each adapter splits into pure logic (unit-tested with fakes) and a thin real network client (validated by smoke scripts, never in the unit suite). Verification metadata (`ExecutionMeta`) flows from the 0G Compute call onto the `Decision` and into the archived `DecisionTrace` via small additive edits to `@civ/shared`/`brain`/`engine`/`explainability`.

**Tech Stack:** TypeScript (ESM, strict), pnpm 9.15.4, Vitest, ethers@6, `@0gfoundation/0g-storage-ts-sdk@1.2.10`, `@0gfoundation/0g-compute-ts-sdk@0.8.4`, tsx + dotenv (scripts).

## Global Constraints

- Node `>=20`; pnpm **9.15.4** only (do NOT upgrade pnpm — 10+ needs Node 22).
- ESM everywhere (`"type": "module"`); TypeScript `strict: true`; no `any` in committed code.
- Internal packages are `@civ/<name>`; cross-package imports use the `@civ/*` alias, never relative.
- Run shell commands WITHOUT `cd` — use `pnpm -C /opt/civilization-0 …` and `git -C /opt/civilization-0 …` (a `cd && cmd` compound is denied by the environment's permission rules).
- Pinned 0G deps: `@0gfoundation/0g-storage-ts-sdk@1.2.10`, `@0gfoundation/0g-compute-ts-sdk@0.8.4`, `ethers@^6`.
- 0G testnet endpoints: EVM RPC `https://evmrpc-testnet.0g.ai`, Storage indexer `https://indexer-storage-testnet-turbo.0g.ai`.
- The Vitest suite stays deterministic & network-free: real network clients (`RealUploader`, `RealChat`) and all `scripts/*` are NEVER imported by `*.test.ts`.
- **Hard subset invariant:** `Object.keys(memoryWeights) ⊆ retrievedMemoryIds` and `Object.keys(beliefWeights) ⊆ retrievedBeliefIds` — enforced by construction (filter), unit-tested against hallucinated ids.
- Secrets live only in the gitignored `.env`; never commit a private key.
- Commits: Conventional Commits, no `Co-Authored-By` trailer.

---

## File Structure

```
packages/shared/src/index.ts        + ExecutionMeta; Decision.meta?; DecisionTrace.trace.meta?   (additive)
packages/brain/src/index.ts         + DecisionResult.meta?                                        (additive)
packages/engine/src/index.ts        copy result.meta onto Decision                                (additive)
packages/explainability/src/index.ts copy decision.meta into trace.trace.meta                     (additive)
packages/zerog/
  package.json, tsconfig.json
  src/
    config.ts        ZeroGConfig + loadZeroGConfig
    errors.ts        ZeroGStorageError, ZeroGBrainError
    storage.ts       Uploader interface + ZeroGStorage         (pure, unit-tested)
    storage.test.ts
    brain.ts         Chat interface + buildMessages + tryParseDecision + ZeroGComputeBrain (pure, unit-tested)
    brain.test.ts
    real-uploader.ts RealUploader + createZeroGStorage         (integration, smoke-validated)
    real-chat.ts     RealChat + createZeroGComputeBrain        (integration, smoke-validated)
    index.ts         public exports
  scripts/
    smoke-0g-storage.ts, smoke-0g-compute.ts, demo-live-tick.ts, setup-0g-compute.ts
tsconfig.base.json                  + "@civ/zerog" path alias
```

---

### Task 1: `@civ/shared` — `ExecutionMeta` + optional `meta` fields (additive)

**Files:**
- Modify: `packages/shared/src/index.ts`
- Test: `packages/shared/src/index.test.ts`

**Interfaces:**
- Consumes: existing `Decision`, `DecisionTrace`.
- Produces: `interface ExecutionMeta { provider: string; model: string; requestId?: string; verified?: boolean; verification?: unknown; }`; `Decision.meta?: ExecutionMeta`; `DecisionTrace.trace.meta?: ExecutionMeta`.

- [ ] **Step 1: Write the failing test** — append to `packages/shared/src/index.test.ts`:

```ts
import type { ExecutionMeta } from "./index";

describe("ExecutionMeta", () => {
  it("can be attached to a Decision and a DecisionTrace", () => {
    const meta: ExecutionMeta = { provider: "0xprov", model: "llama-3.3-70b-instruct", verified: true };
    const decision: import("./index").Decision = {
      id: "d1", citizenId: "ada", goalId: null, day: 1, reasoning: "x",
      action: "work", targetId: null, brainProvider: "0g-compute", brainModel: "llama", meta,
    };
    const trace: import("./index").DecisionTrace = {
      id: "t1", decisionId: "d1",
      trace: { decision: "work", goal: null, retrievedMemories: [], beliefs: [], reasoning: "x", meta },
    };
    expect(decision.meta?.verified).toBe(true);
    expect(trace.trace.meta?.provider).toBe("0xprov");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C /opt/civilization-0 test packages/shared`
Expected: FAIL — `ExecutionMeta` not exported / `meta` not assignable.

- [ ] **Step 3: Implement** — in `packages/shared/src/index.ts`, add the interface and the two optional fields:

```ts
export interface ExecutionMeta {
  provider: string;
  model: string;
  requestId?: string;
  verified?: boolean;
  verification?: unknown;
}
```
Add `meta?: ExecutionMeta;` as the last field of `interface Decision { … }`. In `interface DecisionTrace`, add `meta?: ExecutionMeta;` as the last field of the inline `trace: { … }` object.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C /opt/civilization-0 test packages/shared`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /opt/civilization-0 add packages/shared/src/index.ts packages/shared/src/index.test.ts
git -C /opt/civilization-0 commit -m "feat(shared): ExecutionMeta + optional meta on Decision and DecisionTrace"
```

---

### Task 2: `@civ/brain` — `DecisionResult.meta` (additive)

**Files:**
- Modify: `packages/brain/src/index.ts`
- Test: `packages/brain/src/index.test.ts`

**Interfaces:**
- Consumes: `ExecutionMeta` from `@civ/shared`.
- Produces: `DecisionResult.meta?: ExecutionMeta`.

- [ ] **Step 1: Write the failing test** — append to `packages/brain/src/index.test.ts`:

```ts
it("a DecisionResult can carry execution meta", async () => {
  const brain = new FakeBrain((c) => ({
    action: "work", targetId: null, reasoning: "r",
    memoryWeights: {}, beliefWeights: {},
    meta: { provider: "0xp", model: "m", verified: true },
  }));
  const d = await brain.decide(ctx);
  expect(d.meta?.verified).toBe(true);
});
```
(Reuses the `ctx` already defined at the top of this test file.)

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C /opt/civilization-0 test packages/brain`
Expected: FAIL — `meta` not assignable to `DecisionResult`.

- [ ] **Step 3: Implement** — in `packages/brain/src/index.ts`:
Add to the imports: `import type { ActionType, Belief, Citizen, ExecutionMeta, Goal, Memory, Relationship, WorldState } from "@civ/shared";`
Add `meta?: ExecutionMeta;` as the last field of `interface DecisionResult { … }`.

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C /opt/civilization-0 test packages/brain`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /opt/civilization-0 add packages/brain/src/index.ts packages/brain/src/index.test.ts
git -C /opt/civilization-0 commit -m "feat(brain): optional ExecutionMeta on DecisionResult"
```

---

### Task 3: `@civ/engine` + `@civ/explainability` — propagate meta

**Files:**
- Modify: `packages/engine/src/index.ts`, `packages/explainability/src/index.ts`
- Test: `packages/engine/src/index.test.ts`

**Interfaces:**
- Consumes: `DecisionResult.meta` (Task 2), `Decision.meta` / `DecisionTrace.trace.meta` (Task 1).
- Produces: `Decision.meta` populated from the brain result; `trace.trace.meta` populated from `decision.meta`.

- [ ] **Step 1: Write the failing test** — append a test to `packages/engine/src/index.test.ts` (inside the `describe("runCitizenTick", …)` block), reusing `setup()`:

```ts
it("propagates brain execution meta onto the decision and the archived trace", async () => {
  const { store, deps } = setup();
  // wrap the brain to return meta
  const base = deps.brain;
  deps.brain = {
    name: base.name, model: base.model,
    decide: async (c) => ({ ...(await base.decide(c)), meta: { provider: "0xprov", model: "llama-x", verified: true } }),
  };
  const result = await runCitizenTick(deps, "ada");
  expect(result.decision.meta?.provider).toBe("0xprov");
  expect(store.getTrace(result.decision.id)?.trace.meta?.verified).toBe(true);
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C /opt/civilization-0 test packages/engine`
Expected: FAIL — `decision.meta` undefined / `trace.meta` undefined.

- [ ] **Step 3: Implement**

In `packages/engine/src/index.ts`, in the `decision` object literal (step "6. Record causality"), add `meta: result.meta,` as the last field:
```ts
  const decision: Decision = {
    id: decisionId, citizenId, goalId: goal?.id ?? null, day: clock.day,
    reasoning: result.reasoning, action: result.action, targetId: result.targetId,
    brainProvider: brain.name, brainModel: brain.model, meta: result.meta,
  };
```

In `packages/explainability/src/index.ts`, inside `buildAndArchive`, add `meta` to the `trace.trace` object built from `args`:
```ts
      trace: {
        decision: decision.action,
        goal: goal ? goal.description : null,
        retrievedMemories: memories.map((m) => m.id),
        beliefs: beliefs.map((b) => b.statement),
        reasoning: decision.reasoning,
        eventId: event.id,
        meta: decision.meta,
      },
```

- [ ] **Step 4: Run test to verify it passes (and full suite for no regressions)**

Run: `pnpm -C /opt/civilization-0 test packages/engine` then `pnpm -C /opt/civilization-0 test`
Expected: PASS; full suite still green (FakeBrain returns no meta → existing tests see `meta` undefined, unaffected).

- [ ] **Step 5: Commit**

```bash
git -C /opt/civilization-0 add packages/engine/src/index.ts packages/explainability/src/index.ts packages/engine/src/index.test.ts
git -C /opt/civilization-0 commit -m "feat(engine,explainability): propagate ExecutionMeta to decision + archived trace"
```

---

### Task 4: `@civ/zerog` scaffold + config + errors

**Files:**
- Create: `packages/zerog/package.json`, `packages/zerog/tsconfig.json`, `packages/zerog/src/config.ts`, `packages/zerog/src/errors.ts`, `packages/zerog/src/config.test.ts`
- Modify: `tsconfig.base.json` (add `@civ/zerog` path alias)

**Interfaces:**
- Produces: `ZeroGConfig`, `loadZeroGConfig(env)`, `ZeroGStorageError`, `ZeroGBrainError`.

- [ ] **Step 1: Write the failing test** — `packages/zerog/src/config.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { loadZeroGConfig } from "./config";
import { ZeroGStorageError, ZeroGBrainError } from "./errors";

describe("loadZeroGConfig", () => {
  it("reads env and applies testnet defaults", () => {
    const c = loadZeroGConfig({ ZG_PRIVATE_KEY: "0xabc" });
    expect(c.privateKey).toBe("0xabc");
    expect(c.evmRpc).toBe("https://evmrpc-testnet.0g.ai");
    expect(c.storageIndexer).toBe("https://indexer-storage-testnet-turbo.0g.ai");
    expect(c.fund.deposit).toBeGreaterThan(0);
  });
  it("throws when the private key is missing", () => {
    expect(() => loadZeroGConfig({})).toThrow(/ZG_PRIVATE_KEY/);
  });
});

describe("errors", () => {
  it("are named and carry a cause", () => {
    const e = new ZeroGStorageError("boom", { cause: new Error("inner") });
    expect(e.name).toBe("ZeroGStorageError");
    expect(new ZeroGBrainError("x").name).toBe("ZeroGBrainError");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C /opt/civilization-0 test packages/zerog`
Expected: FAIL — package/modules don't exist.

- [ ] **Step 3: Implement**

`packages/zerog/package.json`:
```json
{
  "name": "@civ/zerog",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "dependencies": {
    "@0gfoundation/0g-storage-ts-sdk": "1.2.10",
    "@0gfoundation/0g-compute-ts-sdk": "0.8.4",
    "ethers": "^6"
  },
  "devDependencies": {
    "dotenv": "^16",
    "tsx": "^4"
  }
}
```
`packages/zerog/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```
In `tsconfig.base.json`, add to `compilerOptions.paths`: `"@civ/zerog": ["packages/zerog/src"],`

`packages/zerog/src/errors.ts`:
```ts
export class ZeroGStorageError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ZeroGStorageError";
  }
}
export class ZeroGBrainError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = "ZeroGBrainError";
  }
}
```

`packages/zerog/src/config.ts`:
```ts
export interface ZeroGConfig {
  privateKey: string;
  evmRpc: string;
  storageIndexer: string;
  computeProvider?: string;
  computeModel?: string;
  fund: { deposit: number; transfer: bigint };
}

export function loadZeroGConfig(env: Record<string, string | undefined>): ZeroGConfig {
  const privateKey = env.ZG_PRIVATE_KEY;
  if (!privateKey) throw new Error("ZG_PRIVATE_KEY is required (set it in .env)");
  return {
    privateKey,
    evmRpc: env.ZG_EVM_RPC ?? "https://evmrpc-testnet.0g.ai",
    storageIndexer: env.ZG_STORAGE_INDEXER ?? "https://indexer-storage-testnet-turbo.0g.ai",
    computeProvider: env.ZG_COMPUTE_PROVIDER || undefined,
    computeModel: env.ZG_COMPUTE_MODEL || undefined,
    fund: { deposit: 10, transfer: 1n * 10n ** 18n },
  };
}
```

Then install deps: `pnpm -C /opt/civilization-0 install`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C /opt/civilization-0 test packages/zerog`
Expected: PASS (4 tests). If `pnpm install` fails to fetch a 0G package, STOP and report — do not improvise a different package.

- [ ] **Step 5: Commit**

```bash
git -C /opt/civilization-0 add packages/zerog/package.json packages/zerog/tsconfig.json packages/zerog/src/config.ts packages/zerog/src/errors.ts packages/zerog/src/config.test.ts tsconfig.base.json pnpm-lock.yaml
git -C /opt/civilization-0 commit -m "feat(zerog): scaffold package, config loader, typed errors"
```

---

### Task 5: `ZeroGStorage` + `Uploader` (pure logic)

**Files:**
- Create: `packages/zerog/src/storage.ts`, `packages/zerog/src/storage.test.ts`

**Interfaces:**
- Consumes: `StorageProvider`, `ArchiveResult` from `@civ/storage`; `ZeroGStorageError`.
- Produces: `interface Uploader { upload(bytes: Uint8Array): Promise<{ rootHash: string; txHash: string }>; }`; `class ZeroGStorage implements StorageProvider` (name `"0g-storage"`).

- [ ] **Step 1: Write the failing test** — `packages/zerog/src/storage.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { ZeroGStorage, type Uploader } from "./storage";
import { ZeroGStorageError } from "./errors";

class FakeUploader implements Uploader {
  calls: Uint8Array[] = [];
  constructor(private impl: () => Promise<{ rootHash: string; txHash: string }>) {}
  async upload(bytes: Uint8Array) { this.calls.push(bytes); return this.impl(); }
}

describe("ZeroGStorage", () => {
  it("serializes {key,data}, uploads, and maps to ArchiveResult", async () => {
    const up = new FakeUploader(async () => ({ rootHash: "0xroot", txHash: "0xtx" }));
    const s = new ZeroGStorage(up);
    expect(s.name).toBe("0g-storage");
    const r = await s.archive("event/e1", { type: "start_company" });
    expect(r).toMatchObject({ rootHash: "0xroot", txHash: "0xtx" });
    expect(typeof r.ts).toBe("number");
    const sent = JSON.parse(new TextDecoder().decode(up.calls[0]));
    expect(sent).toEqual({ key: "event/e1", data: { type: "start_company" } });
  });

  it("wraps uploader failures in ZeroGStorageError", async () => {
    const up = new FakeUploader(async () => { throw new Error("net down"); });
    const s = new ZeroGStorage(up);
    await expect(s.archive("k", {})).rejects.toBeInstanceOf(ZeroGStorageError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C /opt/civilization-0 test packages/zerog`
Expected: FAIL — `./storage` not found.

- [ ] **Step 3: Implement** — `packages/zerog/src/storage.ts`:

```ts
import type { ArchiveResult, StorageProvider } from "@civ/storage";
import { ZeroGStorageError } from "./errors";

export interface Uploader {
  upload(bytes: Uint8Array): Promise<{ rootHash: string; txHash: string }>;
}

export class ZeroGStorage implements StorageProvider {
  readonly name = "0g-storage";
  constructor(private readonly uploader: Uploader) {}

  async archive(key: string, data: unknown): Promise<ArchiveResult> {
    const bytes = new TextEncoder().encode(JSON.stringify({ key, data }));
    try {
      const { rootHash, txHash } = await this.uploader.upload(bytes);
      return { rootHash, txHash, ts: Date.now() };
    } catch (err) {
      throw new ZeroGStorageError(`0G Storage upload failed for key "${key}"`, { cause: err });
    }
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C /opt/civilization-0 test packages/zerog`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /opt/civilization-0 add packages/zerog/src/storage.ts packages/zerog/src/storage.test.ts
git -C /opt/civilization-0 commit -m "feat(zerog): ZeroGStorage adapter + Uploader seam"
```

---

### Task 6: `RealUploader` + `createZeroGStorage` + storage smoke script

**Files:**
- Create: `packages/zerog/src/real-uploader.ts`, `packages/zerog/scripts/smoke-0g-storage.ts`

**Interfaces:**
- Consumes: `Uploader`, `ZeroGStorage` (Task 5); `ZeroGConfig` (Task 4); SDK.
- Produces: `class RealUploader implements Uploader`; `createZeroGStorage(config): ZeroGStorage`.
- **No unit test** (integration code; validated by the smoke script). Verify via typecheck + a live run when the wallet is funded.

- [ ] **Step 1: Implement `real-uploader.ts`**

```ts
import { ethers } from "ethers";
import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { ZeroGStorage, type Uploader } from "./storage";
import type { ZeroGConfig } from "./config";
import { ZeroGStorageError } from "./errors";

export class RealUploader implements Uploader {
  private readonly signer: ethers.Wallet;
  private readonly indexer: Indexer;
  constructor(private readonly config: ZeroGConfig) {
    const provider = new ethers.JsonRpcProvider(config.evmRpc);
    this.signer = new ethers.Wallet(config.privateKey, provider);
    this.indexer = new Indexer(config.storageIndexer);
  }

  async upload(bytes: Uint8Array): Promise<{ rootHash: string; txHash: string }> {
    const memData = new MemData(bytes);
    const [tx, err] = await this.indexer.upload(memData, this.config.evmRpc, this.signer);
    if (err) throw new ZeroGStorageError(`indexer.upload error: ${String(err)}`);
    if (!tx || !("rootHash" in tx)) throw new ZeroGStorageError("indexer.upload returned no rootHash");
    return { rootHash: tx.rootHash, txHash: tx.txHash };
  }
}

export function createZeroGStorage(config: ZeroGConfig): ZeroGStorage {
  return new ZeroGStorage(new RealUploader(config));
}
```

- [ ] **Step 2: Implement `scripts/smoke-0g-storage.ts`**

```ts
import "dotenv/config";
import { loadZeroGConfig } from "../src/config";
import { createZeroGStorage } from "../src/real-uploader";

async function main() {
  const config = loadZeroGConfig(process.env);
  const storage = createZeroGStorage(config);
  console.log("Archiving sample object to 0G Storage…");
  const res = await storage.archive("smoke/hello", { msg: "hello 0G", at: Date.now() });
  console.log("rootHash:", res.rootHash);
  console.log("txHash:  ", res.txHash);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -C /opt/civilization-0 typecheck`
Expected: clean. (If the SDK's `Indexer`/`MemData` export names differ from the docs, the typecheck error will say so — adjust the import to the actual exported names and re-run; the wrapper logic is unchanged.)

- [ ] **Step 4: Live smoke (only if the wallet is funded)**

Run: `pnpm -C /opt/civilization-0 exec tsx packages/zerog/scripts/smoke-0g-storage.ts`
Expected (funded): prints a real `rootHash` and `txHash`.
Expected (unfunded): an insufficient-balance/error message — this is EXPECTED-PENDING-FUNDING, not a code failure. Report it as such; the controller re-runs once the wallet is funded.

- [ ] **Step 5: Commit**

```bash
git -C /opt/civilization-0 add packages/zerog/src/real-uploader.ts packages/zerog/scripts/smoke-0g-storage.ts
git -C /opt/civilization-0 commit -m "feat(zerog): RealUploader + 0G Storage smoke script"
```

---

### Task 7: `ZeroGComputeBrain` + `Chat` + `buildMessages` + `tryParseDecision` (pure logic)

**Files:**
- Create: `packages/zerog/src/brain.ts`, `packages/zerog/src/brain.test.ts`

**Interfaces:**
- Consumes: `ALL_ACTIONS`, `ActionType`, `ExecutionMeta` from `@civ/shared`; `BrainProvider`, `DecisionContext`, `DecisionResult` from `@civ/brain`; `ZeroGBrainError`.
- Produces:
  - `interface ChatMessage { role: "system" | "user"; content: string; }`
  - `interface ChatResult { content: string; provider: string; model: string; requestId?: string; verified?: boolean; verification?: unknown; }`
  - `interface Chat { complete(messages: ChatMessage[]): Promise<ChatResult>; }`
  - `function buildMessages(ctx: DecisionContext): ChatMessage[]`
  - `function tryParseDecision(content: string, ctx: DecisionContext): DecisionResult | null` (returns null for any recoverable failure: unparseable JSON, missing/invalid `action`; coerces optional fields; filters weight keys to retrieved ids; clamps weights to [0,1])
  - `class ZeroGComputeBrain implements BrainProvider` (name `"0g-compute"`): `decide` calls `chat.complete`, parses; on null does ONE repair retry; still null → throws `ZeroGBrainError`; attaches `ExecutionMeta` from the successful `ChatResult`.

- [ ] **Step 1: Write the failing test** — `packages/zerog/src/brain.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import type { DecisionContext } from "@civ/brain";
import { ZeroGComputeBrain, tryParseDecision, type Chat, type ChatMessage, type ChatResult } from "./brain";
import { ZeroGBrainError } from "./errors";

function ctxOf(): DecisionContext {
  return {
    citizen: { id: "ada", name: "Ada", occupation: "Engineer", age: 29,
      traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
      wealth: 0, reputation: 50, tier: 3, createdDay: 0 },
    goal: { id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true },
    memories: [{ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job", embedding: [] }],
    beliefs: [{ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.8, sourceMemoryIds: ["m0"], updatedDay: 2 }],
    relationships: [], worldState: { day: 3, economy: {}, headline: "Recession" },
    availableActions: ["work", "start_company"],
  };
}

class FakeChat implements Chat {
  calls = 0;
  constructor(private replies: string[], private meta: Partial<ChatResult> = {}) {}
  async complete(_messages: ChatMessage[]): Promise<ChatResult> {
    const content = this.replies[Math.min(this.calls, this.replies.length - 1)];
    this.calls++;
    return { content, provider: this.meta.provider ?? "0xprov", model: this.meta.model ?? "llama-x", verified: this.meta.verified ?? true, requestId: "req1" };
  }
}

describe("tryParseDecision", () => {
  it("parses valid JSON", () => {
    const d = tryParseDecision('{"action":"start_company","targetId":"marcus","reasoning":"r","memoryWeights":{"m1":1},"beliefWeights":{"b1":0.8}}', ctxOf());
    expect(d?.action).toBe("start_company");
    expect(d?.memoryWeights).toEqual({ m1: 1 });
    expect(d?.beliefWeights).toEqual({ b1: 0.8 });
  });
  it("strips markdown fences", () => {
    const d = tryParseDecision('```json\n{"action":"work"}\n```', ctxOf());
    expect(d?.action).toBe("work");
  });
  it("coerces missing optional fields to defaults", () => {
    const d = tryParseDecision('{"action":"work"}', ctxOf());
    expect(d).toMatchObject({ action: "work", targetId: null, reasoning: "", memoryWeights: {}, beliefWeights: {} });
  });
  it("drops hallucinated memory/belief ids (hard subset invariant)", () => {
    const d = tryParseDecision('{"action":"work","memoryWeights":{"m1":1,"m999":1},"beliefWeights":{"b1":0.5,"b999":0.9}}', ctxOf());
    expect(Object.keys(d!.memoryWeights)).toEqual(["m1"]);
    expect(Object.keys(d!.beliefWeights)).toEqual(["b1"]);
  });
  it("clamps weights to [0,1] and drops non-numeric", () => {
    const d = tryParseDecision('{"action":"work","memoryWeights":{"m1":5},"beliefWeights":{"b1":"high"}}', ctxOf());
    expect(d!.memoryWeights).toEqual({ m1: 1 });
    expect(d!.beliefWeights).toEqual({});
  });
  it("returns null for an action not in availableActions", () => {
    expect(tryParseDecision('{"action":"teleport"}', ctxOf())).toBeNull();
  });
  it("returns null for unparseable content", () => {
    expect(tryParseDecision("not json at all", ctxOf())).toBeNull();
  });
});

describe("ZeroGComputeBrain.decide", () => {
  it("returns the decision and attaches execution meta", async () => {
    const brain = new ZeroGComputeBrain(new FakeChat(['{"action":"start_company","targetId":"marcus","reasoning":"r","memoryWeights":{"m1":1},"beliefWeights":{}}']), "llama-x");
    const d = await brain.decide(ctxOf());
    expect(d.action).toBe("start_company");
    expect(d.meta).toMatchObject({ provider: "0xprov", model: "llama-x", verified: true });
  });
  it("retries once with a repair prompt, then succeeds", async () => {
    const chat = new FakeChat(["garbage", '{"action":"work"}']);
    const brain = new ZeroGComputeBrain(chat, "llama-x");
    const d = await brain.decide(ctxOf());
    expect(d.action).toBe("work");
    expect(chat.calls).toBe(2);
  });
  it("throws ZeroGBrainError when still invalid after repair", async () => {
    const brain = new ZeroGComputeBrain(new FakeChat(["garbage", "still garbage"]), "llama-x");
    await expect(brain.decide(ctxOf())).rejects.toBeInstanceOf(ZeroGBrainError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C /opt/civilization-0 test packages/zerog`
Expected: FAIL — `./brain` not found.

- [ ] **Step 3: Implement** — `packages/zerog/src/brain.ts`:

```ts
import { type ActionType } from "@civ/shared";
import type { BrainProvider, DecisionContext, DecisionResult } from "@civ/brain";
import { ZeroGBrainError } from "./errors";

export interface ChatMessage { role: "system" | "user"; content: string; }
export interface ChatResult {
  content: string; provider: string; model: string;
  requestId?: string; verified?: boolean; verification?: unknown;
}
export interface Chat { complete(messages: ChatMessage[]): Promise<ChatResult>; }

const SCHEMA = `Return ONLY a JSON object, no prose, no markdown fences:
{"action": <one of the allowed actions>, "targetId": <citizen id or null>, "reasoning": <short string>,
 "memoryWeights": {<memory id>: <0..1>}, "beliefWeights": {<belief id>: <0..1>}}
Only weight memory/belief ids that appear in the lists below.`;

export function buildMessages(ctx: DecisionContext): ChatMessage[] {
  const traits = Object.entries(ctx.citizen.traits).map(([k, v]) => `${k} ${v}`).join(", ");
  const mems = ctx.memories.map((m) => `- [${m.id}] (importance ${m.importance}) ${m.summary}`).join("\n") || "- (none)";
  const beliefs = ctx.beliefs.map((b) => `- [${b.id}] ${b.statement} (confidence ${b.confidence})`).join("\n") || "- (none)";
  const rels = ctx.relationships.map((r) => `- ${r.otherId}: trust ${r.trust}, friendship ${r.friendship}`).join("\n") || "- (none)";
  const system = `You are ${ctx.citizen.name}, a ${ctx.citizen.occupation}. Decide what THIS person would actually do, in character — not the objectively optimal move.
Allowed actions: ${ctx.availableActions.join(", ")}.
${SCHEMA}`;
  const user = `Identity: ${ctx.citizen.name}, age ${ctx.citizen.age}. Traits: ${traits}.
Goal: ${ctx.goal?.description ?? "(none)"}.
World: day ${ctx.worldState.day}. ${ctx.worldState.headline}.
Relevant memories:
${mems}
Beliefs:
${beliefs}
Relationships:
${rels}
Choose ONE action and return the JSON.`;
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

function extractJson(content: string): Record<string, unknown> | null {
  const cleaned = content.replace(/```(?:json)?/gi, "").trim();
  const tryParse = (s: string): Record<string, unknown> | null => {
    try { const v = JSON.parse(s); return v && typeof v === "object" ? (v as Record<string, unknown>) : null; }
    catch { return null; }
  };
  const direct = tryParse(cleaned);
  if (direct) return direct;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return tryParse(cleaned.slice(start, end + 1));
  return null;
}

function filterWeights(raw: unknown, allowedIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const id of allowedIds) {
      const v = obj[id];
      if (typeof v === "number" && Number.isFinite(v)) out[id] = Math.max(0, Math.min(1, v));
    }
  }
  return out;
}

export function tryParseDecision(content: string, ctx: DecisionContext): DecisionResult | null {
  const obj = extractJson(content);
  if (!obj) return null;
  const action = obj.action;
  if (typeof action !== "string" || !ctx.availableActions.includes(action as ActionType)) return null;
  return {
    action: action as ActionType,
    targetId: typeof obj.targetId === "string" ? obj.targetId : null,
    reasoning: typeof obj.reasoning === "string" ? obj.reasoning : "",
    memoryWeights: filterWeights(obj.memoryWeights, ctx.memories.map((m) => m.id)),
    beliefWeights: filterWeights(obj.beliefWeights, ctx.beliefs.map((b) => b.id)),
  };
}

export class ZeroGComputeBrain implements BrainProvider {
  readonly name = "0g-compute";
  constructor(private readonly chat: Chat, readonly model: string) {}

  async decide(ctx: DecisionContext): Promise<DecisionResult> {
    const messages = buildMessages(ctx);
    let result = await this.chat.complete(messages);
    let decision = tryParseDecision(result.content, ctx);
    if (!decision) {
      const repair: ChatMessage = { role: "user", content: "Your previous output was not valid JSON matching the schema. Return ONLY the JSON object." };
      result = await this.chat.complete([...messages, repair]);
      decision = tryParseDecision(result.content, ctx);
    }
    if (!decision) throw new ZeroGBrainError("0G Compute returned no valid decision after one repair attempt");
    decision.meta = {
      provider: result.provider, model: result.model,
      requestId: result.requestId, verified: result.verified, verification: result.verification,
    };
    return decision;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C /opt/civilization-0 test packages/zerog`
Expected: PASS (all `tryParseDecision` + `decide` cases).

- [ ] **Step 5: Commit**

```bash
git -C /opt/civilization-0 add packages/zerog/src/brain.ts packages/zerog/src/brain.test.ts
git -C /opt/civilization-0 commit -m "feat(zerog): ZeroGComputeBrain with 3-phase JSON parse/repair/coerce + subset invariant"
```

---

### Task 8: `RealChat` + `createZeroGComputeBrain` + compute smoke (self-bootstrapping ledger)

**Files:**
- Create: `packages/zerog/src/real-chat.ts`, `packages/zerog/scripts/smoke-0g-compute.ts`

**Interfaces:**
- Consumes: `Chat`, `ChatMessage`, `ChatResult`, `ZeroGComputeBrain` (Task 7); `ZeroGConfig` (Task 4); compute SDK.
- Produces: `class RealChat implements Chat` (with static async `create(config)` that builds the broker, ensures the ledger is funded, and resolves provider+endpoint+model); `createZeroGComputeBrain(config): Promise<ZeroGComputeBrain>`.
- **No unit test** (integration; validated by the smoke script + live run).

- [ ] **Step 1: Implement `real-chat.ts`**

```ts
import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { ZeroGComputeBrain, type Chat, type ChatMessage, type ChatResult } from "./brain";
import type { ZeroGConfig } from "./config";
import { ZeroGBrainError } from "./errors";

type Broker = Awaited<ReturnType<typeof createZGComputeNetworkBroker>>;

export class RealChat implements Chat {
  private constructor(
    private readonly broker: Broker,
    private readonly provider: string,
    private readonly endpoint: string,
    private readonly model: string,
  ) {}

  static async create(config: ZeroGConfig): Promise<RealChat> {
    if (!config.computeProvider) {
      throw new ZeroGBrainError("ZG_COMPUTE_PROVIDER not set — run smoke-0g-compute to list providers and pin one in .env");
    }
    const ethProvider = new ethers.JsonRpcProvider(config.evmRpc);
    const wallet = new ethers.Wallet(config.privateKey, ethProvider);
    const broker = await createZGComputeNetworkBroker(wallet);
    await ensureFunded(broker, config);
    const { endpoint, model } = await broker.inference.getServiceMetadata(config.computeProvider);
    return new RealChat(broker, config.computeProvider, endpoint, config.computeModel ?? model);
  }

  get modelName(): string { return this.model; }

  async complete(messages: ChatMessage[]): Promise<ChatResult> {
    const headers = await this.broker.inference.getRequestHeaders(this.provider);
    const res = await fetch(`${this.endpoint}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...headers },
      body: JSON.stringify({ model: this.model, messages }),
    });
    if (!res.ok) throw new ZeroGBrainError(`0G Compute HTTP ${res.status}: ${await res.text()}`);
    const data = await res.json() as { id?: string; choices?: Array<{ message?: { content?: string } }> };
    const content = data.choices?.[0]?.message?.content ?? "";
    const chatID = res.headers.get("ZG-Res-Key") ?? data.id;
    let verified: boolean | undefined;
    let verification: unknown;
    if (chatID) {
      try { verified = await this.broker.inference.processResponse(this.provider, chatID); verification = { chatID }; }
      catch (e) { verified = false; verification = { error: String(e) }; }
    }
    return { content, provider: this.provider, model: this.model, requestId: chatID ?? undefined, verified, verification };
  }
}

export async function ensureFunded(broker: Broker, config: ZeroGConfig): Promise<void> {
  try { await broker.ledger.getLedger(); }
  catch { await broker.ledger.addLedger(config.fund.deposit); }
  if (config.computeProvider) {
    try { await broker.ledger.transferFund(config.computeProvider, "inference", config.fund.transfer); }
    catch { /* already funded / acknowledged */ }
  }
}

export async function createZeroGComputeBrain(config: ZeroGConfig): Promise<ZeroGComputeBrain> {
  const chat = await RealChat.create(config);
  return new ZeroGComputeBrain(chat, chat.modelName);
}
```
Note: if the SDK's ledger method names differ (`addLedger`/`getLedger`/`depositFund`), the smoke run will surface it; adjust to the actual broker API and keep the same flow (ensure-ledger then transfer-to-provider).

- [ ] **Step 2: Implement `scripts/smoke-0g-compute.ts`**

```ts
import "dotenv/config";
import { loadZeroGConfig } from "../src/config";
import { createZeroGComputeBrain } from "../src/real-chat";
import type { DecisionContext } from "@civ/brain";

const ctx: DecisionContext = {
  citizen: { id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 },
  goal: { id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true },
  memories: [{ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job during recession", embedding: [] }],
  beliefs: [{ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.8, sourceMemoryIds: ["m0"], updatedDay: 2 }],
  relationships: [], worldState: { day: 3, economy: {}, headline: "Recession deepens" },
  availableActions: ["work", "start_company", "invest"],
};

async function main() {
  const config = loadZeroGConfig(process.env);
  if (!config.computeProvider) {
    console.log("ZG_COMPUTE_PROVIDER not set. Listing providers so you can pin one in .env:");
    const { ethers } = await import("ethers");
    const { createZGComputeNetworkBroker } = await import("@0gfoundation/0g-compute-ts-sdk");
    const wallet = new ethers.Wallet(config.privateKey, new ethers.JsonRpcProvider(config.evmRpc));
    const broker = await createZGComputeNetworkBroker(wallet);
    console.log(JSON.stringify(await broker.inference.listService(), null, 2));
    return;
  }
  const brain = await createZeroGComputeBrain(config);
  console.log("Asking 0G Compute for Ada's decision…");
  const d = await brain.decide(ctx);
  console.log("decision:", { action: d.action, targetId: d.targetId, reasoning: d.reasoning });
  console.log("meta:    ", d.meta);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -C /opt/civilization-0 typecheck`
Expected: clean. (Broker method-name mismatches surface here — adjust to the real API, preserve the flow.)

- [ ] **Step 4: Live smoke (only when wallet funded; first run lists providers)**

Run: `pnpm -C /opt/civilization-0 exec tsx packages/zerog/scripts/smoke-0g-compute.ts`
Expected: with no `ZG_COMPUTE_PROVIDER`, prints the provider/model catalog (pin one + its model into `.env`). With it set + wallet funded, prints a real decision + `verified: true`. Unfunded/no-creds → EXPECTED-PENDING-FUNDING; report, don't treat as a code failure.

- [ ] **Step 5: Commit**

```bash
git -C /opt/civilization-0 add packages/zerog/src/real-chat.ts packages/zerog/scripts/smoke-0g-compute.ts
git -C /opt/civilization-0 commit -m "feat(zerog): RealChat (0G Compute broker) + self-bootstrapping compute smoke script"
```

---

### Task 9: `index.ts` exports + `demo-live-tick.ts` (the proof)

**Files:**
- Create: `packages/zerog/src/index.ts`, `packages/zerog/scripts/demo-live-tick.ts`

**Interfaces:**
- Consumes: everything in `@civ/zerog`; `@civ/engine` (`runCitizenTick`, `TickDeps`), `@civ/store`, `@civ/memory`, `@civ/beliefs`.
- Produces: public package exports; the end-to-end live demo.

- [ ] **Step 1: Implement `src/index.ts`**

```ts
export * from "./config";
export * from "./errors";
export * from "./storage";
export * from "./brain";
export { RealUploader, createZeroGStorage } from "./real-uploader";
export { RealChat, createZeroGComputeBrain } from "./real-chat";
```

- [ ] **Step 2: Implement `scripts/demo-live-tick.ts`**

```ts
import "dotenv/config";
import { InMemoryWorldStore } from "@civ/store";
import { FakeEmbedder, MemoryIndex } from "@civ/memory";
import { RuleBasedBeliefReviser } from "@civ/beliefs";
import { ExplainabilityService } from "@civ/explainability";
import { runCitizenTick, type TickDeps } from "@civ/engine";
import { loadZeroGConfig } from "../src/config";
import { createZeroGStorage } from "../src/real-uploader";
import { createZeroGComputeBrain } from "../src/real-chat";

async function main() {
  const config = loadZeroGConfig(process.env);
  const store = new InMemoryWorldStore();
  const embedder = new FakeEmbedder();

  store.upsertCitizen({ id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
  store.upsertCitizen({ id: "marcus", name: "Marcus", occupation: "Investor", age: 41,
    traits: { ambition: 70, empathy: 60, loyalty: 65, curiosity: 50, discipline: 70, riskTolerance: 60 },
    wealth: 100000, reputation: 70, tier: 2, createdDay: 0 });
  store.upsertGoal({ id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true });
  store.addMemory({ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job during recession", embedding: embedder.embed("lost job during recession") });
  store.addMemory({ id: "m2", citizenId: "ada", day: 2, type: "relationship", importance: 7, summary: "marcus offered funding for a company", embedding: embedder.embed("marcus offered funding for a company") });
  store.upsertBelief({ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.7, sourceMemoryIds: ["m2"], updatedDay: 2 });
  store.setWorldState({ day: 3, economy: { inflation: 8 }, headline: "Recession deepens" });

  const storage = createZeroGStorage(config);
  const deps: TickDeps = {
    store, embedder, memoryIndex: new MemoryIndex(store, embedder),
    reviser: new RuleBasedBeliefReviser(),
    brain: await createZeroGComputeBrain(config),
    storage,
    explain: new ExplainabilityService(storage),
    clock: { day: 3 }, idgen: (() => { let n = 0; return () => `id${++n}`; })(),
  };

  console.log("Running ONE live tick: Ada thinks on 0G Compute, archives on 0G Storage…\n");
  const r = await runCitizenTick(deps, "ada");
  console.log("Decision:", r.decision.action, "->", r.decision.targetId);
  console.log("Reasoning:", r.decision.reasoning);
  console.log("Reasoned by:", r.decision.meta?.provider, "| model", r.decision.meta?.model, "| verified", r.decision.meta?.verified);
  console.log("decision_memories:", store.getDecisionMemories(r.decision.id));
  console.log("decision_beliefs: ", store.getDecisionBeliefs(r.decision.id));
  console.log("Trace archived on 0G:", r.trace.zgRootHash, r.trace.zgTxHash);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -C /opt/civilization-0 typecheck`
Expected: clean.

- [ ] **Step 4: Live demo (only when wallet funded + `ZG_COMPUTE_PROVIDER`/`ZG_COMPUTE_MODEL` pinned)**

Run: `pnpm -C /opt/civilization-0 exec tsx packages/zerog/scripts/demo-live-tick.ts`
Expected: prints Ada's real decision, the provider + `verified`, the `decision_memories`/`decision_beliefs`, and the real `zgRootHash`/`zgTxHash`. Unfunded → EXPECTED-PENDING-FUNDING; report.

- [ ] **Step 5: Commit**

```bash
git -C /opt/civilization-0 add packages/zerog/src/index.ts packages/zerog/scripts/demo-live-tick.ts
git -C /opt/civilization-0 commit -m "feat(zerog): package exports + live one-tick demo (think on 0G, archive on 0G)"
```

---

### Task 10: `setup-0g-compute.ts` (reusable funding) + run docs

**Files:**
- Create: `packages/zerog/scripts/setup-0g-compute.ts`, `docs/zerog-runbook.md`

**Interfaces:**
- Consumes: `ensureFunded` (Task 8), `ZeroGConfig`.

- [ ] **Step 1: Implement `scripts/setup-0g-compute.ts`**

```ts
import "dotenv/config";
import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { loadZeroGConfig } from "../src/config";
import { ensureFunded } from "../src/real-chat";

async function main() {
  const config = loadZeroGConfig(process.env);
  const wallet = new ethers.Wallet(config.privateKey, new ethers.JsonRpcProvider(config.evmRpc));
  const broker = await createZGComputeNetworkBroker(wallet);
  console.log("Wallet:", wallet.address);
  await ensureFunded(broker, config);
  console.log("Ledger:", await broker.ledger.getLedger());
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Implement `docs/zerog-runbook.md`** — a short operator guide:

```md
# 0G Adapters Runbook

1. Fund the wallet at https://faucet.0g.ai (address in `.env` `ZG_WALLET_ADDRESS`). Need ≥4 OG for Compute.
2. `pnpm exec tsx packages/zerog/scripts/smoke-0g-storage.ts` → expect a rootHash/txHash.
3. `pnpm exec tsx packages/zerog/scripts/smoke-0g-compute.ts` → lists providers; pin `ZG_COMPUTE_PROVIDER` + `ZG_COMPUTE_MODEL` in `.env`; re-run for a live decision.
4. `pnpm exec tsx packages/zerog/scripts/setup-0g-compute.ts` → (re)fund/inspect the ledger.
5. `pnpm exec tsx packages/zerog/scripts/demo-live-tick.ts` → the full proof.

`.env` keys: `ZG_PRIVATE_KEY`, `ZG_EVM_RPC`, `ZG_STORAGE_INDEXER`, `ZG_COMPUTE_PROVIDER`, `ZG_COMPUTE_MODEL`.
```

- [ ] **Step 3: Typecheck**

Run: `pnpm -C /opt/civilization-0 typecheck`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git -C /opt/civilization-0 add packages/zerog/scripts/setup-0g-compute.ts docs/zerog-runbook.md
git -C /opt/civilization-0 commit -m "feat(zerog): reusable ledger setup script + operator runbook"
```

---

### Task 11: Full suite + typecheck gate

**Files:** none (verification).

- [ ] **Step 1: Full test suite**

Run: `pnpm -C /opt/civilization-0 test`
Expected: all packages green (Slice 0 suite + new shared/brain/engine/zerog tests). The `@civ/zerog` unit tests cover config, errors, storage, and brain; no network is touched.

- [ ] **Step 2: Typecheck**

Run: `pnpm -C /opt/civilization-0 typecheck`
Expected: clean across all packages including `@civ/zerog`.

- [ ] **Step 3: Confirm scripts are excluded from the suite**

Run: `pnpm -C /opt/civilization-0 test 2>&1 | grep -c "scripts/"`
Expected: `0` (no script files executed as tests — they live in `scripts/`, not `*.test.ts`).

- [ ] **Step 4: Commit (if any config fix was needed)**

```bash
git -C /opt/civilization-0 add -A
git -C /opt/civilization-0 commit -m "chore: green full test + typecheck gate for 0G adapters"
```

---

## Self-Review

**Spec coverage:**
- §2 `@civ/zerog` infra package — Task 4 scaffold; Tasks 5–10 fill it. ✓
- §3 testability seam (Uploader/Chat injected; fakes in units; real clients only in scripts) — Tasks 5/7 (fakes) vs 6/8 (real). ✓
- §4 3-phase parse/repair/coerce + throw conditions — Task 7 (`tryParseDecision` + `decide`), tested. ✓
- §5 ZeroGStorage thin serialize+map+wrap — Task 5. ✓
- §6 ExecutionMeta capture across shared/brain/engine/explainability — Tasks 1/2/3. ✓
- §7 DI config — Task 4 `loadZeroGConfig`; factories in Tasks 6/8. ✓
- §8 build order (storage→smoke→compute→smoke→demo→setup last; smoke-compute self-bootstraps) — Tasks 5→6→7→8→9→10. ✓
- §9 typed errors with actionable messages — Task 4 errors; used in 5/6/8. ✓
- §10 deterministic network-free suite; hard-invariant tests (hallucinated ids, clamp, defaults, invalid action throw, repair) — Task 7 tests + Task 11 gate. ✓
- §11 file layout — matches Tasks. ✓

**Placeholder scan:** No TBD/TODO; every code step has complete code. The only "adjust if the SDK export/method names differ" notes (Tasks 6/8) are deliberate integration guidance for code that is typecheck- and smoke-validated, not placeholders for logic.

**Type consistency:** `ExecutionMeta` shape identical across Tasks 1/2/3/7. `Uploader.upload → {rootHash,txHash}` consistent Tasks 5/6. `Chat.complete → ChatResult` consistent Tasks 7/8. `tryParseDecision(content, ctx): DecisionResult | null` consistent Task 7 ↔ used by `decide`. `createZeroGStorage` (sync) vs `createZeroGComputeBrain` (async) used correctly in Task 9 demo. `ZeroGConfig.fund.transfer: bigint` matches `transferFund(..., bigint)` in Task 8.

**Live-dependency note:** Tasks 6, 8, 9 require a funded testnet wallet for their *live* steps; their *code* deliverable (typecheck-clean + committed) does not. If unfunded at execution time, deliver the code and report live steps as EXPECTED-PENDING-FUNDING; the controller runs them once `0xB44c6D45c352B8313067945c30479E26a21c78bc` is funded.

---

## Follow-on (not in this slice)
Postgres + pgvector swap; multi-citizen scaling + tick scheduler + narrative; Next.js UI with the Explainability Graph (now able to render the 0G provider + verification badge).
