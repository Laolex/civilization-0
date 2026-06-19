# Explainability UI (Slice 4A) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Next.js UI that makes Civilization-0's causality moat understandable to a hackathon judge in under 20 seconds, reading a seeded snapshot with real 0G proofs and offering one live "Verify on 0G" retrieval.

**Architecture:** A seed script runs Ada's life through the real engine on 0G once (capturing genuine `rootHash`/`txHash`/`verified`), serializes the world to a static `world.json`. A new `apps/web` Next.js 14 App Router package reads that JSON with zero network dependency for all rendering; the single live call is an isolated `/api/verify` route that downloads the archived DecisionTrace by root hash from 0G Storage. Pure selectors (`lib/world.ts`) assemble the render models and carry the heavy unit tests; the hero is a custom CSS/SVG `<CausalChain>` component.

**Tech Stack:** TypeScript (ESM, strict), pnpm 9.15.4 workspaces, Next.js 14 (App Router) + React 18, Vitest (+ jsdom per-file for component tests), `@0gfoundation/0g-storage-ts-sdk@1.2.10` (`Indexer.downloadToBlob`), existing `@civ/*` packages.

## Global Constraints

- **Node 20**, pnpm pinned at **9.15.4** (pnpm 10+ needs Node 22). Run pnpm as `pnpm -C /opt/civilization-0[/subdir]`, git as `git -C /opt/civilization-0` (never a compound starting with `cd`).
- **NEVER print, commit, or echo** `ZG_PRIVATE_KEY` or any private key. The seed/verify read it from gitignored `/opt/civilization-0/.env` only.
- Unit tests stay **network-free and deterministic**: no real 0G calls, no `Date.now`/`Math.random` in tested logic. Real network clients (`Real*`) are validated by smoke scripts and are **never imported by `*.test.ts`**.
- Compute SDK 0.8.4 ESM build is broken — scripts importing `@civ/zerog`'s real chat run with `pnpm -C /opt/civilization-0/packages/zerog exec tsx --conditions require scripts/<name>.ts`.
- Causal chain order is fixed: **Memory → Belief → 0G Compute → Decision → Event → 0G Storage**.
- Aesthetic: Bloomberg/Stripe/Linear/Vercel — black/charcoal/slate/off-white + one accent, mono for hashes. **No** neon, particles, glow, animated network graphs, or sci-fi cityscapes.
- Subagent reports go to `/opt/civilization-0/sdd-artifacts/` (gitignored), never `.git/`.

---

### Task 1: `WorldSnapshot` type + `stripEmbeddings` in `@civ/shared`

**Files:**
- Modify: `packages/shared/src/index.ts` (append near the other interfaces)
- Test: `packages/shared/src/snapshot.test.ts`

**Interfaces:**
- Consumes: existing `Citizen, Goal, Relationship, Memory, Belief, Decision, DecisionMemory, DecisionBelief, WorldEvent, DecisionTrace, WorldState` (all already exported from this file).
- Produces: `WorldSnapshot` interface; `stripEmbeddings(s: WorldSnapshot): WorldSnapshot` (returns a copy with every `memory.embedding` set to `[]`).

- [ ] **Step 1: Write the failing test**

```ts
// packages/shared/src/snapshot.test.ts
import { describe, it, expect } from "vitest";
import { stripEmbeddings, type WorldSnapshot } from "./index";

function fixture(): WorldSnapshot {
  return {
    capturedAt: "2026-06-19T00:00:00.000Z",
    citizens: [], goals: [], relationships: [],
    memories: [{ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job", embedding: [1, 2, 3] }],
    beliefs: [], decisions: [], decisionMemories: [], decisionBeliefs: [],
    events: [], traces: [], worldState: { day: 12, economy: {}, headline: "" },
  };
}

describe("stripEmbeddings", () => {
  it("zeroes embeddings but preserves every other field", () => {
    const out = stripEmbeddings(fixture());
    expect(out.memories[0].embedding).toEqual([]);
    expect(out.memories[0].summary).toBe("lost job");
    expect(out.memories[0].importance).toBe(8);
    expect(out.capturedAt).toBe("2026-06-19T00:00:00.000Z");
  });

  it("does not mutate the input", () => {
    const input = fixture();
    stripEmbeddings(input);
    expect(input.memories[0].embedding).toEqual([1, 2, 3]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C /opt/civilization-0 exec vitest run packages/shared/src/snapshot.test.ts`
Expected: FAIL — `stripEmbeddings`/`WorldSnapshot` not exported.

- [ ] **Step 3: Add the type and function**

Append to `packages/shared/src/index.ts`:

```ts
export interface WorldSnapshot {
  capturedAt: string;
  citizens: Citizen[];
  goals: Goal[];
  relationships: Relationship[];
  memories: Memory[];
  beliefs: Belief[];
  decisions: Decision[];
  decisionMemories: DecisionMemory[];
  decisionBeliefs: DecisionBelief[];
  events: WorldEvent[];
  traces: DecisionTrace[];
  worldState: WorldState;
}

/** Return a copy of the snapshot with every memory embedding emptied —
 *  64-float vectors are render-noise for the UI and bloat world.json. */
export function stripEmbeddings(s: WorldSnapshot): WorldSnapshot {
  return { ...s, memories: s.memories.map((m) => ({ ...m, embedding: [] })) };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C /opt/civilization-0 exec vitest run packages/shared/src/snapshot.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git -C /opt/civilization-0 add packages/shared/src/index.ts packages/shared/src/snapshot.test.ts
git -C /opt/civilization-0 commit -m "feat(shared): add WorldSnapshot type and stripEmbeddings"
```

---

### Task 2: `snapshot()` on `WorldStore` / `InMemoryWorldStore`

**Files:**
- Modify: `packages/store/src/index.ts` (add to `WorldStore` interface + `InMemoryWorldStore`)
- Test: `packages/store/src/snapshot.test.ts`

**Interfaces:**
- Consumes: `WorldSnapshot` from `@civ/shared`.
- Produces: `WorldStore.snapshot(): WorldSnapshot` — dumps every collection. `capturedAt` set to `new Date().toISOString()`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/store/src/snapshot.test.ts
import { describe, it, expect } from "vitest";
import { InMemoryWorldStore } from "./index";

describe("InMemoryWorldStore.snapshot", () => {
  it("dumps all collections", () => {
    const s = new InMemoryWorldStore();
    s.upsertCitizen({ id: "ada", name: "Ada", occupation: "Engineer", age: 29, traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 }, wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
    s.upsertGoal({ id: "g1", citizenId: "ada", kind: "wealth", description: "independence", progress: 0.1, active: true });
    s.addMemory({ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job", embedding: [1, 2] });
    s.upsertBelief({ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.8, sourceMemoryIds: ["m1"], updatedDay: 1 });
    s.addDecision({ id: "d1", citizenId: "ada", goalId: "g1", day: 12, reasoning: "r", action: "invest", targetId: "marcus", brainProvider: "0g-compute", brainModel: "qwen" });
    s.addDecisionMemories([{ decisionId: "d1", memoryId: "m1", weight: 0.6 }]);
    s.addDecisionBeliefs([{ decisionId: "d1", beliefId: "b1", weight: 0.8 }]);
    s.addEvent({ id: "e1", day: 12, type: "invest", actorId: "ada", targetId: "marcus", decisionId: "d1", payload: {} });
    s.addTrace({ id: "t1", decisionId: "d1", trace: { decision: "invest", goal: "independence", retrievedMemories: ["m1"], beliefs: ["Marcus is trustworthy"], reasoning: "r", eventId: "e1" } });
    s.setWorldState({ day: 12, economy: { inflation: 8 }, headline: "Recession" });

    const snap = s.snapshot();
    expect(typeof snap.capturedAt).toBe("string");
    expect(snap.citizens).toHaveLength(1);
    expect(snap.goals).toHaveLength(1);
    expect(snap.memories[0].id).toBe("m1");
    expect(snap.beliefs[0].id).toBe("b1");
    expect(snap.decisions[0].id).toBe("d1");
    expect(snap.decisionMemories).toEqual([{ decisionId: "d1", memoryId: "m1", weight: 0.6 }]);
    expect(snap.decisionBeliefs).toEqual([{ decisionId: "d1", beliefId: "b1", weight: 0.8 }]);
    expect(snap.events[0].id).toBe("e1");
    expect(snap.traces[0].id).toBe("t1");
    expect(snap.worldState.day).toBe(12);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C /opt/civilization-0 exec vitest run packages/store/src/snapshot.test.ts`
Expected: FAIL — `snapshot` is not a function.

- [ ] **Step 3: Add `snapshot()` to interface and implementation**

In `packages/store/src/index.ts`, add `WorldSnapshot` to the import from `@civ/shared`, add to the `WorldStore` interface:

```ts
  snapshot(): WorldSnapshot;
```

And implement on `InMemoryWorldStore` (after `setWorldState`):

```ts
  snapshot(): WorldSnapshot {
    return {
      capturedAt: new Date().toISOString(),
      citizens: [...this.citizens.values()],
      goals: [...this.goals.values()],
      relationships: [...this.relationships],
      memories: [...this.memories],
      beliefs: [...this.beliefs.values()],
      decisions: [...this.decisions],
      decisionMemories: [...this.decisionMemories],
      decisionBeliefs: [...this.decisionBeliefs],
      events: [...this.events.values()],
      traces: [...this.traces],
      worldState: this.world,
    };
  }
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C /opt/civilization-0 exec vitest run packages/store/src/snapshot.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /opt/civilization-0 add packages/store/src/index.ts packages/store/src/snapshot.test.ts
git -C /opt/civilization-0 commit -m "feat(store): add snapshot() dumping all collections"
```

---

### Task 3: `@civ/zerog` download seam — `Downloader` + `parseArchivedTrace` (pure)

**Files:**
- Create: `packages/zerog/src/download.ts`
- Test: `packages/zerog/src/download.test.ts`

**Interfaces:**
- Consumes: `ZeroGStorageError` from `./errors`.
- Produces:
  - `interface Downloader { download(rootHash: string): Promise<Uint8Array>; }`
  - `interface ArchivedRecord { key: string; data: unknown; }`
  - `parseArchivedTrace(bytes: Uint8Array): ArchivedRecord` — reverses the `JSON.stringify({key,data})` archive envelope; throws `ZeroGStorageError` on invalid bytes/shape.

> Note: `ZeroGStorage.archive` (in `storage.ts`) stores `JSON.stringify({ key, data })`. For a trace, `key` is `trace/<decisionId>` and `data` is the inner trace object `{ decision, goal, retrievedMemories, beliefs, reasoning, eventId, meta }`.

- [ ] **Step 1: Write the failing test**

```ts
// packages/zerog/src/download.test.ts
import { describe, it, expect } from "vitest";
import { parseArchivedTrace } from "./download";
import { ZeroGStorageError } from "./errors";

function envelope(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}

describe("parseArchivedTrace", () => {
  it("reverses the {key,data} archive envelope", () => {
    const bytes = envelope({ key: "trace/d1", data: { decision: "invest", meta: { verified: true } } });
    const rec = parseArchivedTrace(bytes);
    expect(rec.key).toBe("trace/d1");
    expect((rec.data as any).decision).toBe("invest");
    expect((rec.data as any).meta.verified).toBe(true);
  });

  it("throws ZeroGStorageError on non-JSON bytes", () => {
    expect(() => parseArchivedTrace(new TextEncoder().encode("not json"))).toThrow(ZeroGStorageError);
  });

  it("throws ZeroGStorageError when the envelope lacks key/data", () => {
    expect(() => parseArchivedTrace(envelope({ nope: 1 }))).toThrow(ZeroGStorageError);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C /opt/civilization-0 exec vitest run packages/zerog/src/download.test.ts`
Expected: FAIL — module `./download` not found.

- [ ] **Step 3: Implement `download.ts`**

```ts
// packages/zerog/src/download.ts
import { ZeroGStorageError } from "./errors";

export interface Downloader {
  download(rootHash: string): Promise<Uint8Array>;
}

export interface ArchivedRecord {
  key: string;
  data: unknown;
}

/** Reverse ZeroGStorage's `JSON.stringify({ key, data })` archive envelope. */
export function parseArchivedTrace(bytes: Uint8Array): ArchivedRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) {
    throw new ZeroGStorageError("archived object is not valid JSON", { cause: err });
  }
  if (
    !parsed || typeof parsed !== "object" ||
    typeof (parsed as Record<string, unknown>).key !== "string" ||
    !("data" in (parsed as Record<string, unknown>))
  ) {
    throw new ZeroGStorageError("archived object missing key/data envelope");
  }
  const obj = parsed as Record<string, unknown>;
  return { key: obj.key as string, data: obj.data };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C /opt/civilization-0 exec vitest run packages/zerog/src/download.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git -C /opt/civilization-0 add packages/zerog/src/download.ts packages/zerog/src/download.test.ts
git -C /opt/civilization-0 commit -m "feat(zerog): add Downloader interface and parseArchivedTrace"
```

---

### Task 4: `RealDownloader` + factory + barrel + smoke script (thin client)

**Files:**
- Create: `packages/zerog/src/real-downloader.ts`
- Modify: `packages/zerog/src/index.ts` (barrel)
- Create: `packages/zerog/scripts/smoke-0g-download.ts`

**Interfaces:**
- Consumes: `ZeroGConfig` from `./config`; `Downloader` from `./download`; `Indexer` from `@0gfoundation/0g-storage-ts-sdk`.
- Produces: `class RealDownloader implements Downloader`; `function createZeroGDownloader(config: ZeroGConfig): RealDownloader`. No unit test (thin network client) — validated by the smoke script against a real root.

- [ ] **Step 1: Implement `real-downloader.ts`**

```ts
// packages/zerog/src/real-downloader.ts
import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";
import type { Downloader } from "./download";
import type { ZeroGConfig } from "./config";
import { ZeroGStorageError } from "./errors";

export class RealDownloader implements Downloader {
  private readonly indexer: Indexer;
  constructor(config: ZeroGConfig) {
    this.indexer = new Indexer(config.storageIndexer);
  }

  async download(rootHash: string): Promise<Uint8Array> {
    // downloadToBlob is browser/Node-safe and needs no signer (read path).
    const [blob, err] = await this.indexer.downloadToBlob(rootHash);
    if (err) throw new ZeroGStorageError(`0G Storage download failed for root "${rootHash}"`, { cause: err });
    if (!blob) throw new ZeroGStorageError(`0G Storage returned no data for root "${rootHash}"`);
    return new Uint8Array(await blob.arrayBuffer());
  }
}

export function createZeroGDownloader(config: ZeroGConfig): RealDownloader {
  return new RealDownloader(config);
}
```

- [ ] **Step 2: Extend the barrel**

Append to `packages/zerog/src/index.ts`:

```ts
export * from "./download";
export { RealDownloader, createZeroGDownloader } from "./real-downloader";
```

- [ ] **Step 3: Write the smoke script**

```ts
// packages/zerog/scripts/smoke-0g-download.ts
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
loadDotenv({ path: resolve(import.meta.dirname, "../../../.env") });
import { loadZeroGConfig } from "../src/config";
import { createZeroGDownloader } from "../src/real-downloader";
import { parseArchivedTrace } from "../src/download";

// A real trace root archived on 0G testnet by the proven live tick.
const ROOT = process.argv[2] ?? "0x5683f71d74232ef492093a7a5e27aa3cef78a39250d4644e9e427c5a51ca4217";

async function main() {
  const config = loadZeroGConfig(process.env);
  const downloader = createZeroGDownloader(config);
  console.log("Downloading from 0G Storage:", ROOT);
  const bytes = await downloader.download(ROOT);
  console.log("Bytes:", bytes.length);
  const rec = parseArchivedTrace(bytes);
  console.log("key:", rec.key);
  console.log("data:", JSON.stringify(rec.data).slice(0, 200));
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 4: Typecheck the package source**

Run: `pnpm -C /opt/civilization-0 exec tsc --noEmit -p tsconfig.json`
Expected: PASS (no type errors introduced).

- [ ] **Step 5: Run the smoke script against the real root**

Run: `pnpm -C /opt/civilization-0/packages/zerog exec tsx --conditions require scripts/smoke-0g-download.ts`
Expected: prints `Bytes: <n>`, `key: trace/...`, and a `data:` excerpt containing `"decision"`. If `downloadToBlob` errors, capture the exact SDK error to `/opt/civilization-0/sdd-artifacts/` and retry with the multi-node selection default; the `Downloader` interface stays unchanged regardless of internals.

- [ ] **Step 6: Commit**

```bash
git -C /opt/civilization-0 add packages/zerog/src/real-downloader.ts packages/zerog/src/index.ts packages/zerog/scripts/smoke-0g-download.ts
git -C /opt/civilization-0 commit -m "feat(zerog): add RealDownloader (downloadToBlob) and smoke-0g-download"
```

---

### Task 5: `buildAdaScenario` — deterministic world builder (pure, fakes)

**Files:**
- Create: `packages/zerog/scripts/scenario.ts`
- Test: `packages/zerog/scripts/scenario.test.ts`

**Interfaces:**
- Consumes: `InMemoryWorldStore` (`@civ/store`), `FakeEmbedder`/`MemoryIndex` (`@civ/memory`), `RuleBasedBeliefReviser` (`@civ/beliefs`), `ExplainabilityService` (`@civ/explainability`), `runCitizenTick`/`TickDeps` (`@civ/engine`), `BrainProvider` (`@civ/brain`), `StorageProvider` (`@civ/storage`).
- Produces: `async function buildAdaScenario(brain: BrainProvider, storage: StorageProvider): Promise<InMemoryWorldStore>` — seeds Ada + Marcus, goal, relationship, memories, belief `b1`, three stimulus events (days 1/3/7, `decisionId: null`), world day 12, then runs one `runCitizenTick(deps, "ada")` at day 12 to produce the invest decision/event/trace.

- [ ] **Step 1: Write the failing test**

```ts
// packages/zerog/scripts/scenario.test.ts
import { describe, it, expect } from "vitest";
import { FakeStorage } from "@civ/storage";
import { FakeBrain } from "@civ/brain";
import { buildAdaScenario } from "./scenario";

// Scripted brain: Ada invests in Marcus, weighting memory m1 and belief b1.
const investBrain = new FakeBrain((ctx) => ({
  action: "invest",
  targetId: "marcus",
  reasoning: "Marcus helped me before; I trust him with this.",
  memoryWeights: ctx.memories.some((m) => m.id === "m1") ? { m1: 0.6 } : {},
  beliefWeights: ctx.beliefs.some((b) => b.id === "b1") ? { b1: 0.8 } : {},
  meta: { provider: "fake", model: "scripted-v0", verified: true },
}));

describe("buildAdaScenario", () => {
  it("seeds Ada's world and produces the invest decision via a tick", async () => {
    const store = await buildAdaScenario(investBrain, new FakeStorage());
    const snap = store.snapshot();

    expect(snap.citizens.map((c) => c.id).sort()).toEqual(["ada", "marcus"]);
    // 3 stimulus events (decisionId null) + 1 decision event
    const stimulus = snap.events.filter((e) => e.decisionId === null);
    const decided = snap.events.filter((e) => e.decisionId !== null);
    expect(stimulus).toHaveLength(3);
    expect(decided).toHaveLength(1);

    const d = snap.decisions[0];
    expect(d.action).toBe("invest");
    expect(d.targetId).toBe("marcus");
    expect(snap.decisionMemories).toContainEqual({ decisionId: d.id, memoryId: "m1", weight: 0.6 });
    expect(snap.decisionBeliefs).toContainEqual({ decisionId: d.id, beliefId: "b1", weight: 0.8 });

    const trace = snap.traces.find((t) => t.decisionId === d.id)!;
    expect(trace.zgRootHash).toBeDefined(); // archived (fake root)
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C /opt/civilization-0 exec vitest run packages/zerog/scripts/scenario.test.ts`
Expected: FAIL — module `./scenario` not found.

- [ ] **Step 3: Implement `scenario.ts`**

```ts
// packages/zerog/scripts/scenario.ts
import { InMemoryWorldStore } from "@civ/store";
import { FakeEmbedder, MemoryIndex } from "@civ/memory";
import { RuleBasedBeliefReviser } from "@civ/beliefs";
import { ExplainabilityService } from "@civ/explainability";
import { runCitizenTick, type TickDeps } from "@civ/engine";
import type { BrainProvider } from "@civ/brain";
import type { StorageProvider } from "@civ/storage";

/** Build Ada's canonical world and run one tick (the invest decision).
 *  Pure except for the injected brain/storage — use fakes in tests, real 0G in the seed. */
export async function buildAdaScenario(
  brain: BrainProvider,
  storage: StorageProvider,
): Promise<InMemoryWorldStore> {
  const store = new InMemoryWorldStore();
  const embedder = new FakeEmbedder();
  const mem = (id: string, day: number, type: "event" | "relationship", importance: number, summary: string) =>
    store.addMemory({ id, citizenId: "ada", day, type, importance, summary, embedding: embedder.embed(summary) });

  store.upsertCitizen({ id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
  store.upsertCitizen({ id: "marcus", name: "Marcus", occupation: "Investor", age: 41,
    traits: { ambition: 70, empathy: 60, loyalty: 65, curiosity: 50, discipline: 70, riskTolerance: 60 },
    wealth: 100000, reputation: 70, tier: 2, createdDay: 0 });
  store.upsertGoal({ id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true });
  store.upsertRelationship({ citizenId: "ada", otherId: "marcus", trust: 0.7, friendship: 0.5, influence: 0.4 });

  mem("m1", 1, "event", 8, "Marcus helped me when I lost my job");
  mem("m2", 3, "relationship", 7, "Met Marcus, an investor who believed in my idea");
  mem("m3", 7, "event", 7, "Received seed funding from Marcus");
  store.upsertBelief({ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.8, sourceMemoryIds: ["m1"], updatedDay: 7 });

  // Authored stimulus events (no decision) — the backstory the timeline shows.
  store.addEvent({ id: "evt-lostjob", day: 1, type: "quit_job", actorId: "ada", targetId: null, decisionId: null, payload: { label: "Lost her job" } });
  store.addEvent({ id: "evt-met", day: 3, type: "meet", actorId: "ada", targetId: "marcus", decisionId: null, payload: { label: "Met Marcus" } });
  store.addEvent({ id: "evt-funded", day: 7, type: "partner", actorId: "ada", targetId: "marcus", decisionId: null, payload: { label: "Received funding" } });

  store.setWorldState({ day: 12, economy: { inflation: 8 }, headline: "Markets recovering after the downturn" });

  const deps: TickDeps = {
    store, embedder, memoryIndex: new MemoryIndex(store, embedder),
    reviser: new RuleBasedBeliefReviser(), brain, storage,
    explain: new ExplainabilityService(storage),
    clock: { day: 12 }, idgen: (() => { let n = 0; return () => `tick-${++n}`; })(),
  };
  await runCitizenTick(deps, "ada");
  return store;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm -C /opt/civilization-0 exec vitest run packages/zerog/scripts/scenario.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git -C /opt/civilization-0 add packages/zerog/scripts/scenario.ts packages/zerog/scripts/scenario.test.ts
git -C /opt/civilization-0 commit -m "feat(zerog): add deterministic buildAdaScenario world builder"
```

---

### Task 6: `seed-ada.ts` — produce `apps/web/data/world.json` on real 0G

**Files:**
- Create: `packages/zerog/scripts/seed-ada.ts`
- Create (output, committed): `apps/web/data/world.json`

**Interfaces:**
- Consumes: `buildAdaScenario` (Task 5), `loadZeroGConfig`/`createZeroGStorage`/`createZeroGComputeBrain` (`@civ/zerog`), `stripEmbeddings` (`@civ/shared`).
- Produces: a committed `apps/web/data/world.json` (a `WorldSnapshot` with embeddings stripped) carrying a real `invest` decision with `meta.verified === true` and real `zgRootHash`/`zgTxHash` on its trace.

- [ ] **Step 1: Implement `seed-ada.ts`**

```ts
// packages/zerog/scripts/seed-ada.ts
import { config as loadDotenv } from "dotenv";
import { resolve, dirname } from "node:path";
import { mkdirSync, writeFileSync } from "node:fs";
loadDotenv({ path: resolve(import.meta.dirname, "../../../.env") });
import { stripEmbeddings } from "@civ/shared";
import { loadZeroGConfig } from "../src/config";
import { createZeroGStorage } from "../src/real-uploader";
import { createZeroGComputeBrain } from "../src/real-chat";
import { buildAdaScenario } from "./scenario";

const OUT = resolve(import.meta.dirname, "../../../apps/web/data/world.json");

async function main() {
  const config = loadZeroGConfig(process.env);
  const storage = createZeroGStorage(config);
  const brain = await createZeroGComputeBrain(config);

  console.log("Seeding Ada's world on real 0G Compute + Storage…");
  const store = await buildAdaScenario(brain, storage);
  const snap = stripEmbeddings(store.snapshot());

  const decision = snap.decisions[0];
  console.log("Decision:", decision?.action, "->", decision?.targetId);
  console.log("Verified:", decision?.meta?.verified, "| provider:", decision?.meta?.provider);
  const trace = snap.traces.find((t) => t.decisionId === decision?.id);
  console.log("Trace root:", trace?.zgRootHash);

  if (decision?.action !== "invest" || decision?.meta?.verified !== true || !trace?.zgRootHash) {
    throw new Error("Seed did not produce a verified invest decision with an archived trace — re-run.");
  }

  mkdirSync(dirname(OUT), { recursive: true });
  writeFileSync(OUT, JSON.stringify(snap, null, 2));
  console.log("Wrote", OUT);
}

main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Run the seed against real 0G**

Run: `pnpm -C /opt/civilization-0/packages/zerog exec tsx --conditions require scripts/seed-ada.ts`
Expected: prints `Decision: invest -> <marcus|Marcus>`, `Verified: true`, a real `Trace root: 0x...`, and `Wrote .../apps/web/data/world.json`. If the model does not return `invest`, re-run (the prompt strongly biases it; the proven run returns invest→Marcus). On repeated deviation, capture output to `sdd-artifacts/` and report before proceeding.

- [ ] **Step 3: Sanity-check the artifact**

Run: `pnpm -C /opt/civilization-0 exec node -e "const w=require('./apps/web/data/world.json'); console.log('citizens',w.citizens.length,'events',w.events.length,'traces',w.traces.length,'verified',w.decisions[0].meta.verified)"`
Expected: `citizens 2 events 4 traces 1 verified true`.

- [ ] **Step 4: Commit**

```bash
git -C /opt/civilization-0 add packages/zerog/scripts/seed-ada.ts apps/web/data/world.json
git -C /opt/civilization-0 commit -m "feat(zerog): add seed-ada and commit canonical world.json (real 0G proofs)"
```

---

### Task 7: Scaffold `apps/web` (Next.js 14) + workspace + vitest wiring + landing

**Files:**
- Modify: `pnpm-workspace.yaml`, `vitest.config.ts`
- Create: `apps/web/package.json`, `apps/web/next.config.js`, `apps/web/tsconfig.json`, `apps/web/next-env.d.ts`, `apps/web/app/layout.tsx`, `apps/web/app/globals.css`, `apps/web/app/page.tsx`

**Interfaces:**
- Produces: a bootable Next.js app at `apps/web` with the landing page; workspace + vitest configured to include `apps/**`.

- [ ] **Step 1: Add `apps/*` to the workspace and vitest include**

`pnpm-workspace.yaml`:

```yaml
packages:
  - "packages/*"
  - "apps/*"
```

`vitest.config.ts` — change the include line to:

```ts
    test: { globals: true, include: ["packages/**/*.test.ts", "apps/**/*.test.{ts,tsx}"], },
```

- [ ] **Step 2: Create `apps/web/package.json`**

```json
{
  "name": "@civ/web",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "scripts": {
    "dev": "next dev -p 4310",
    "build": "next build",
    "start": "next start -p 4310",
    "typecheck": "tsc --noEmit"
  },
  "dependencies": {
    "@civ/shared": "workspace:*",
    "@civ/zerog": "workspace:*",
    "next": "14.2.5",
    "react": "18.3.1",
    "react-dom": "18.3.1"
  },
  "devDependencies": {
    "@types/react": "18.3.3",
    "@types/react-dom": "18.3.0"
  }
}
```

- [ ] **Step 3: Create `apps/web/next.config.js`**

```js
/** @type {import('next').NextConfig} */
const nextConfig = {
  transpilePackages: ["@civ/shared", "@civ/zerog"],
};
export default nextConfig;
```

- [ ] **Step 4: Create `apps/web/tsconfig.json`**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["dom", "dom.iterable", "ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "noEmit": true,
    "jsx": "preserve",
    "incremental": true,
    "resolveJsonModule": true,
    "plugins": [{ "name": "next" }]
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 5: Create the layout, globals, and landing page**

`apps/web/next-env.d.ts`:

```ts
/// <reference types="next" />
/// <reference types="next/image-types/global" />
```

`apps/web/app/globals.css`:

```css
:root {
  --bg: #0a0b0d; --panel: #141619; --slate: #2a2e35;
  --fg: #e8eaed; --muted: #9aa0a8; --accent: #5b8cff; --mono: ui-monospace, "SF Mono", Menlo, monospace;
}
* { box-sizing: border-box; }
html, body { margin: 0; padding: 0; background: var(--bg); color: var(--fg);
  font-family: ui-sans-serif, system-ui, -apple-system, sans-serif; }
a { color: inherit; text-decoration: none; }
.mono { font-family: var(--mono); }
```

`apps/web/app/layout.tsx`:

```tsx
import "./globals.css";
import type { ReactNode } from "react";

export const metadata = { title: "Civilization-0", description: "A society whose citizens think on 0G." };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (<html lang="en"><body>{children}</body></html>);
}
```

`apps/web/app/page.tsx`:

```tsx
import Link from "next/link";

export default function Landing() {
  return (
    <main style={{ minHeight: "100vh", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 28, padding: 24, textAlign: "center" }}>
      <h1 style={{ fontSize: 56, margin: 0, letterSpacing: -1 }}>Civilization-0</h1>
      <p style={{ fontSize: 20, color: "var(--muted)", maxWidth: 560, lineHeight: 1.5 }}>
        A society whose citizens think on 0G, and whose history lives on 0G.
      </p>
      <Link href="/citizens/ada" style={{ padding: "14px 28px", border: "1px solid var(--slate)", borderRadius: 10, background: "var(--panel)", fontSize: 16 }}>
        Enter Civilization →
      </Link>
    </main>
  );
}
```

- [ ] **Step 6: Install and verify the build**

Run: `pnpm -C /opt/civilization-0 install`
Then: `pnpm -C /opt/civilization-0/apps/web build`
Expected: install resolves; `next build` succeeds and compiles `/` and `/citizens/ada` is not yet present (only `/` so far) — build passes with the single landing route.

- [ ] **Step 7: Commit**

```bash
git -C /opt/civilization-0 add pnpm-workspace.yaml vitest.config.ts pnpm-lock.yaml apps/web/package.json apps/web/next.config.js apps/web/tsconfig.json apps/web/next-env.d.ts apps/web/app
git -C /opt/civilization-0 commit -m "feat(web): scaffold Next.js app + landing, wire workspace and vitest"
```

---

### Task 8: Render models + pure selectors (`apps/web/lib`)

**Files:**
- Create: `apps/web/lib/types.ts`
- Create: `apps/web/lib/world.ts`
- Test: `apps/web/lib/world.test.ts`

**Interfaces:**
- Consumes: `WorldSnapshot` and entity types from `@civ/shared`.
- Produces (render models in `types.ts`):
  - `type ChainNodeKind = "memory" | "belief" | "compute" | "decision" | "event" | "storage";`
  - `interface ChainNode { kind: ChainNodeKind; title: string; detail: Record<string, string>; weight?: number; }`
  - `interface CausalChainView { decisionId: string; nodes: ChainNode[]; rootHash?: string; txHash?: string; }`
  - `interface TimelineEntry { eventId: string; day: number; label: string; decisionId: string | null; }`
- Produces (selectors in `world.ts`):
  - `getCitizen(s, id)`, `getRelationships(s, id)`
  - `getTimeline(s, citizenId): TimelineEntry[]`
  - `getCausalChain(s, decisionId): CausalChainView` (order: memory→belief→compute→decision→event→storage)
  - `buildStorySummary(s, citizenId): string`
  - `decisionConfidence(chain): number`

- [ ] **Step 1: Write the failing test** (uses a hand-built fixture, not world.json)

```ts
// apps/web/lib/world.test.ts
import { describe, it, expect } from "vitest";
import type { WorldSnapshot } from "@civ/shared";
import { getTimeline, getCausalChain, buildStorySummary, decisionConfidence } from "./world";

function snap(): WorldSnapshot {
  return {
    capturedAt: "2026-06-19T00:00:00.000Z",
    citizens: [
      { id: "ada", name: "Ada", occupation: "Engineer", age: 29, traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 }, wealth: 0, reputation: 50, tier: 3, createdDay: 0 },
      { id: "marcus", name: "Marcus", occupation: "Investor", age: 41, traits: { ambition: 70, empathy: 60, loyalty: 65, curiosity: 50, discipline: 70, riskTolerance: 60 }, wealth: 100000, reputation: 70, tier: 2, createdDay: 0 },
    ],
    goals: [{ id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true }],
    relationships: [{ citizenId: "ada", otherId: "marcus", trust: 0.7, friendship: 0.5, influence: 0.4 }],
    memories: [{ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "Marcus helped me when I lost my job", embedding: [] }],
    beliefs: [{ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.8, sourceMemoryIds: ["m1"], updatedDay: 7 }],
    decisions: [{ id: "d1", citizenId: "ada", goalId: "g1", day: 12, reasoning: "I trust Marcus.", action: "invest", targetId: "marcus", brainProvider: "0g-compute", brainModel: "qwen/qwen2.5-omni-7b", meta: { provider: "0xProvider", model: "qwen/qwen2.5-omni-7b", verified: true } }],
    decisionMemories: [{ decisionId: "d1", memoryId: "m1", weight: 0.6 }],
    decisionBeliefs: [{ decisionId: "d1", beliefId: "b1", weight: 0.8 }],
    events: [
      { id: "evt-lostjob", day: 1, type: "quit_job", actorId: "ada", targetId: null, decisionId: null, payload: { label: "Lost her job" } },
      { id: "e-invest", day: 12, type: "invest", actorId: "ada", targetId: "marcus", decisionId: "d1", payload: {} },
    ],
    traces: [{ id: "t1", decisionId: "d1", trace: { decision: "invest", goal: "financial independence", retrievedMemories: ["m1"], beliefs: ["Marcus is trustworthy"], reasoning: "I trust Marcus.", eventId: "e-invest", meta: { provider: "0xProvider", model: "qwen/qwen2.5-omni-7b", verified: true } }, zgRootHash: "0xroot", zgTxHash: "0xtx" }],
    worldState: { day: 12, economy: {}, headline: "" },
  };
}

describe("getTimeline", () => {
  it("returns events sorted by day with decision linkage", () => {
    const t = getTimeline(snap(), "ada");
    expect(t.map((e) => e.day)).toEqual([1, 12]);
    expect(t[0].decisionId).toBeNull();
    expect(t[1].decisionId).toBe("d1");
    expect(t[0].label).toBe("Lost her job");
  });
});

describe("getCausalChain", () => {
  it("assembles nodes in the order memory→belief→compute→decision→event→storage", () => {
    const c = getCausalChain(snap(), "d1");
    expect(c.nodes.map((n) => n.kind)).toEqual(["memory", "belief", "compute", "decision", "event", "storage"]);
    expect(c.nodes[0].weight).toBe(0.6);
    expect(c.nodes[1].weight).toBe(0.8);
    expect(c.nodes[2].detail.verified).toBe("true");
    expect(c.rootHash).toBe("0xroot");
    expect(c.txHash).toBe("0xtx");
  });
});

describe("buildStorySummary", () => {
  it("produces prose mentioning the memory, belief, compute, and archive", () => {
    const s = buildStorySummary(snap(), "ada");
    expect(s).toContain("Marcus");
    expect(s).toContain("trustworthy");
    expect(s).toMatch(/0G Compute/);
    expect(s).toMatch(/0G Storage/);
  });
});

describe("decisionConfidence", () => {
  it("derives a 0-100 score from join weights", () => {
    const c = getCausalChain(snap(), "d1");
    expect(decisionConfidence(c)).toBe(70); // mean(0.6,0.8)=0.7 -> 70
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm -C /opt/civilization-0 exec vitest run apps/web/lib/world.test.ts`
Expected: FAIL — module `./world` not found.

- [ ] **Step 3: Implement `types.ts`**

```ts
// apps/web/lib/types.ts
export type ChainNodeKind = "memory" | "belief" | "compute" | "decision" | "event" | "storage";

export interface ChainNode {
  kind: ChainNodeKind;
  title: string;
  detail: Record<string, string>;
  weight?: number;
}

export interface CausalChainView {
  decisionId: string;
  nodes: ChainNode[];
  rootHash?: string;
  txHash?: string;
}

export interface TimelineEntry {
  eventId: string;
  day: number;
  label: string;
  decisionId: string | null;
}
```

- [ ] **Step 4: Implement `world.ts`**

```ts
// apps/web/lib/world.ts
import type { WorldSnapshot, WorldEvent } from "@civ/shared";
import type { CausalChainView, ChainNode, TimelineEntry } from "./types";

export function getCitizen(s: WorldSnapshot, id: string) {
  return s.citizens.find((c) => c.id === id);
}
export function getRelationships(s: WorldSnapshot, id: string) {
  return s.relationships.filter((r) => r.citizenId === id);
}

function eventLabel(s: WorldSnapshot, e: WorldEvent): string {
  const payloadLabel = (e.payload as Record<string, unknown>)?.label;
  if (typeof payloadLabel === "string") return payloadLabel;
  const target = e.targetId ? getCitizen(s, e.targetId)?.name ?? e.targetId : null;
  const verb = e.type.replace(/_/g, " ");
  return target ? `${verb[0].toUpperCase()}${verb.slice(1)} ${target}` : `${verb[0].toUpperCase()}${verb.slice(1)}`;
}

export function getTimeline(s: WorldSnapshot, citizenId: string): TimelineEntry[] {
  return s.events
    .filter((e) => e.actorId === citizenId)
    .slice()
    .sort((a, b) => a.day - b.day)
    .map((e) => ({ eventId: e.id, day: e.day, label: eventLabel(s, e), decisionId: e.decisionId }));
}

export function getCausalChain(s: WorldSnapshot, decisionId: string): CausalChainView {
  const decision = s.decisions.find((d) => d.id === decisionId);
  if (!decision) throw new Error(`unknown decision ${decisionId}`);
  const event = s.events.find((e) => e.decisionId === decisionId);
  const trace = s.traces.find((t) => t.decisionId === decisionId);

  const nodes: ChainNode[] = [];

  for (const dm of s.decisionMemories.filter((r) => r.decisionId === decisionId)) {
    const m = s.memories.find((x) => x.id === dm.memoryId);
    if (m) nodes.push({ kind: "memory", title: `Memory ${m.id}`, weight: dm.weight, detail: { summary: m.summary, weight: dm.weight.toFixed(2), day: String(m.day) } });
  }
  for (const db of s.decisionBeliefs.filter((r) => r.decisionId === decisionId)) {
    const b = s.beliefs.find((x) => x.id === db.beliefId);
    if (b) nodes.push({ kind: "belief", title: `Belief ${b.id}`, weight: db.weight, detail: { statement: b.statement, weight: db.weight.toFixed(2), confidence: b.confidence.toFixed(2) } });
  }
  const meta = decision.meta;
  nodes.push({ kind: "compute", title: "0G Compute", detail: { provider: meta?.provider ?? decision.brainProvider, model: meta?.model ?? decision.brainModel, verified: String(meta?.verified ?? false) } });
  nodes.push({ kind: "decision", title: "Decision", detail: { action: decision.action, target: decision.targetId ?? "—", reasoning: decision.reasoning } });
  if (event) nodes.push({ kind: "event", title: "Event", detail: { label: eventLabel(s, event), day: String(event.day) } });
  nodes.push({ kind: "storage", title: "0G Storage", detail: { rootHash: trace?.zgRootHash ?? "—", txHash: trace?.zgTxHash ?? "—" } });

  return { decisionId, nodes, rootHash: trace?.zgRootHash, txHash: trace?.zgTxHash };
}

export function buildStorySummary(s: WorldSnapshot, citizenId: string): string {
  const c = getCitizen(s, citizenId);
  if (!c) return "";
  const decision = s.decisions.find((d) => d.citizenId === citizenId);
  const target = decision?.targetId ? getCitizen(s, decision.targetId)?.name ?? decision.targetId : "someone";
  const keyMemory = s.memories.filter((m) => m.citizenId === citizenId).sort((a, b) => b.importance - a.importance)[0];
  const belief = s.beliefs.find((b) => b.citizenId === citizenId);
  const parts = [
    keyMemory ? `${keyMemory.summary}.` : "",
    belief ? `Over time ${c.name} formed the belief that ${belief.statement.toLowerCase()}.` : "",
    `That belief influenced a decision generated on 0G Compute.`,
    decision ? `${c.name} ultimately chose to ${decision.action} ${decision.targetId ? `with ${target}` : ""}, and the decision trace was archived on 0G Storage.` : "",
  ];
  return parts.filter(Boolean).join(" ").replace(/\s+/g, " ").trim();
}

export function decisionConfidence(chain: CausalChainView): number {
  const weights = chain.nodes.map((n) => n.weight).filter((w): w is number => typeof w === "number");
  if (weights.length === 0) return 0;
  const mean = weights.reduce((a, b) => a + b, 0) / weights.length;
  return Math.round(mean * 100);
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -C /opt/civilization-0 exec vitest run apps/web/lib/world.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 6: Commit**

```bash
git -C /opt/civilization-0 add apps/web/lib
git -C /opt/civilization-0 commit -m "feat(web): add render models and pure world selectors"
```

---

### Task 9: `<CausalChain>` + node component (render, light jsdom smoke)

**Files:**
- Create: `apps/web/components/CausalChain.tsx`
- Test: `apps/web/components/CausalChain.test.tsx`
- Modify: root `package.json` (add `@testing-library/react`, `jsdom` devDeps)

**Interfaces:**
- Consumes: `CausalChainView`, `ChainNode` from `../lib/types`.
- Produces: `export function CausalChain({ chain }: { chain: CausalChainView })` and a per-node `Node` renderer; clicking a node toggles its `detail` block. Renders node titles in order with `▼` connectors.

- [ ] **Step 1: Add test deps**

Add to root `package.json` devDependencies: `"@testing-library/react": "^16.0.0"`, `"jsdom": "^25.0.0"`. Then run `pnpm -C /opt/civilization-0 install`.

- [ ] **Step 2: Write the failing test**

```tsx
// apps/web/components/CausalChain.test.tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CausalChain } from "./CausalChain";
import type { CausalChainView } from "../lib/types";

const chain: CausalChainView = {
  decisionId: "d1",
  rootHash: "0xroot", txHash: "0xtx",
  nodes: [
    { kind: "memory", title: "Memory m1", weight: 0.6, detail: { summary: "Marcus helped me", weight: "0.60" } },
    { kind: "belief", title: "Belief b1", weight: 0.8, detail: { statement: "Marcus is trustworthy", weight: "0.80" } },
    { kind: "compute", title: "0G Compute", detail: { provider: "0xP", model: "qwen", verified: "true" } },
    { kind: "decision", title: "Decision", detail: { action: "invest", target: "marcus", reasoning: "trust" } },
    { kind: "event", title: "Event", detail: { label: "Invest marcus", day: "12" } },
    { kind: "storage", title: "0G Storage", detail: { rootHash: "0xroot", txHash: "0xtx" } },
  ],
};

describe("CausalChain", () => {
  it("renders all node titles in order", () => {
    render(<CausalChain chain={chain} />);
    for (const n of chain.nodes) expect(screen.getByText(n.title)).toBeDefined();
  });

  it("reveals detail on click", () => {
    render(<CausalChain chain={chain} />);
    expect(screen.queryByText("Marcus is trustworthy")).toBeNull();
    fireEvent.click(screen.getByText("Belief b1"));
    expect(screen.getByText("Marcus is trustworthy")).toBeDefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `pnpm -C /opt/civilization-0 exec vitest run apps/web/components/CausalChain.test.tsx`
Expected: FAIL — module `./CausalChain` not found.

- [ ] **Step 4: Implement `CausalChain.tsx`**

```tsx
// apps/web/components/CausalChain.tsx
"use client";
import { useState, type ReactNode } from "react";
import type { CausalChainView, ChainNode } from "../lib/types";

const ACCENT: Record<string, string> = { compute: "var(--accent)", storage: "var(--accent)" };

function NodeCard({ node, extra }: { node: ChainNode; extra?: ReactNode }) {
  const [open, setOpen] = useState(false);
  const verified = node.detail.verified === "true";
  return (
    <div style={{ width: 380, border: "1px solid var(--slate)", borderRadius: 10, background: "var(--panel)", padding: "14px 16px" }}>
      <button onClick={() => setOpen((v) => !v)} style={{ all: "unset", cursor: "pointer", display: "flex", justifyContent: "space-between", width: "100%", color: ACCENT[node.kind] ?? "var(--fg)", fontWeight: 600 }}>
        <span>{node.title}{verified ? " ✓" : ""}</span>
        <span style={{ color: "var(--muted)" }}>{typeof node.weight === "number" ? node.weight.toFixed(2) : open ? "−" : "+"}</span>
      </button>
      {open && (
        <dl style={{ margin: "10px 0 0", display: "grid", gridTemplateColumns: "auto 1fr", gap: "4px 12px", fontSize: 13 }}>
          {Object.entries(node.detail).map(([k, v]) => (
            <div key={k} style={{ display: "contents" }}>
              <dt style={{ color: "var(--muted)" }}>{k}</dt>
              <dd className={k.toLowerCase().includes("hash") ? "mono" : undefined} style={{ margin: 0, wordBreak: "break-all" }}>{v}</dd>
            </div>
          ))}
          {extra}
        </dl>
      )}
    </div>
  );
}

export function CausalChain({ chain, storageExtra }: { chain: CausalChainView; storageExtra?: ReactNode }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 0 }}>
      {chain.nodes.map((node, i) => (
        <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
          <NodeCard node={node} extra={node.kind === "storage" ? storageExtra : undefined} />
          {i < chain.nodes.length - 1 && <span style={{ color: "var(--muted)", padding: "6px 0" }}>▼</span>}
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm -C /opt/civilization-0 exec vitest run apps/web/components/CausalChain.test.tsx`
Expected: PASS (2 tests).

- [ ] **Step 6: Commit**

```bash
git -C /opt/civilization-0 add apps/web/components/CausalChain.tsx apps/web/components/CausalChain.test.tsx package.json pnpm-lock.yaml
git -C /opt/civilization-0 commit -m "feat(web): add custom CausalChain component with expandable nodes"
```

---

### Task 10: `/citizens/ada` page — profile + story summary + timeline + graph reveal

**Files:**
- Create: `apps/web/lib/snapshot.ts` (server-side JSON loader)
- Create: `apps/web/components/CitizenView.tsx` (client; holds selected-event state)
- Create: `apps/web/app/citizens/ada/page.tsx` (server component)

**Interfaces:**
- Consumes: selectors from `../lib/world`, `CausalChain` from `../components/CausalChain`.
- Produces: `loadSnapshot(): WorldSnapshot` (imports the committed JSON); a rendered `/citizens/ada` page where clicking the invest timeline entry reveals its `<CausalChain>`.

- [ ] **Step 1: Implement the snapshot loader**

```ts
// apps/web/lib/snapshot.ts
import type { WorldSnapshot } from "@civ/shared";
import world from "../data/world.json";

export function loadSnapshot(): WorldSnapshot {
  return world as unknown as WorldSnapshot;
}
```

- [ ] **Step 2: Implement `CitizenView.tsx`** (client component, owns the reveal state)

```tsx
// apps/web/components/CitizenView.tsx
"use client";
import { useState } from "react";
import type { Citizen, Relationship } from "@civ/shared";
import type { CausalChainView, TimelineEntry } from "../lib/types";
import { CausalChain } from "./CausalChain";
import { VerifyOnZeroG } from "./VerifyOnZeroG";

export function CitizenView({ citizen, relationships, story, timeline, chains, confidenceByDecision }: {
  citizen: Citizen; relationships: Relationship[]; story: string;
  timeline: TimelineEntry[]; chains: Record<string, CausalChainView>;
  confidenceByDecision: Record<string, number>;
}) {
  const firstDecision = timeline.find((t) => t.decisionId)?.decisionId ?? null;
  const [selected, setSelected] = useState<string | null>(firstDecision);
  const chain = selected ? chains[selected] : null;

  return (
    <main style={{ maxWidth: 860, margin: "0 auto", padding: "48px 24px", display: "flex", flexDirection: "column", gap: 32 }}>
      <header>
        <h1 style={{ margin: 0, fontSize: 40 }}>{citizen.name}</h1>
        <p style={{ color: "var(--muted)", margin: "6px 0 0" }}>{citizen.occupation} · age {citizen.age} · wealth {citizen.wealth}</p>
      </header>

      <section style={{ border: "1px solid var(--slate)", borderRadius: 12, background: "var(--panel)", padding: 20 }}>
        <h2 style={{ margin: "0 0 8px", fontSize: 14, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>Story</h2>
        <p style={{ margin: 0, lineHeight: 1.6, fontSize: 17 }}>{story}</p>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "240px 1fr", gap: 32 }}>
        <div>
          <h2 style={{ fontSize: 14, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>Timeline</h2>
          <ol style={{ listStyle: "none", padding: 0, margin: 0, display: "flex", flexDirection: "column", gap: 10 }}>
            {timeline.map((t) => {
              const active = t.decisionId && t.decisionId === selected;
              return (
                <li key={t.eventId}>
                  <button
                    onClick={() => t.decisionId && setSelected(t.decisionId)}
                    disabled={!t.decisionId}
                    style={{ all: "unset", cursor: t.decisionId ? "pointer" : "default", display: "block", padding: "8px 12px", borderRadius: 8, border: `1px solid ${active ? "var(--accent)" : "var(--slate)"}`, background: active ? "rgba(91,140,255,0.08)" : "transparent", width: "100%" }}>
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>Day {t.day}</span>
                    <div style={{ fontSize: 15 }}>{t.label}{t.decisionId ? " →" : ""}</div>
                  </button>
                </li>
              );
            })}
          </ol>
        </div>

        <div>
          <h2 style={{ fontSize: 14, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1, display: "flex", justifyContent: "space-between" }}>
            <span>Why this decision</span>
            {selected && <span style={{ color: "var(--accent)" }}>Confidence {confidenceByDecision[selected]}%</span>}
          </h2>
          {chain
            ? <CausalChain chain={chain} storageExtra={<VerifyOnZeroG rootHash={chain.rootHash} />} />
            : <p style={{ color: "var(--muted)" }}>Select a decision event to see its causal chain.</p>}
        </div>
      </section>

      {relationships.length > 0 && (
        <section>
          <h2 style={{ fontSize: 14, color: "var(--muted)", textTransform: "uppercase", letterSpacing: 1 }}>Relationships</h2>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {relationships.map((r) => <li key={r.otherId}>{r.otherId}: trust {r.trust}, friendship {r.friendship}</li>)}
          </ul>
        </section>
      )}
    </main>
  );
}
```

- [ ] **Step 3: Implement the page (server component)**

```tsx
// apps/web/app/citizens/ada/page.tsx
import { loadSnapshot } from "../../../lib/snapshot";
import { getCitizen, getRelationships, getTimeline, getCausalChain, buildStorySummary, decisionConfidence } from "../../../lib/world";
import { CitizenView } from "../../../components/CitizenView";
import type { CausalChainView } from "../../../lib/types";

export default function AdaPage() {
  const snap = loadSnapshot();
  const citizen = getCitizen(snap, "ada");
  if (!citizen) return <main style={{ padding: 48 }}>No citizen data. Run the seed script.</main>;

  const timeline = getTimeline(snap, "ada");
  const chains: Record<string, CausalChainView> = {};
  const confidenceByDecision: Record<string, number> = {};
  for (const t of timeline) {
    if (t.decisionId && !chains[t.decisionId]) {
      const c = getCausalChain(snap, t.decisionId);
      chains[t.decisionId] = c;
      confidenceByDecision[t.decisionId] = decisionConfidence(c);
    }
  }

  return (
    <CitizenView
      citizen={citizen}
      relationships={getRelationships(snap, "ada")}
      story={buildStorySummary(snap, "ada")}
      timeline={timeline}
      chains={chains}
      confidenceByDecision={confidenceByDecision}
    />
  );
}
```

> Note: `CitizenView` imports `VerifyOnZeroG`, built in Task 11. To keep this task's build green on its own, create a minimal placeholder `apps/web/components/VerifyOnZeroG.tsx` now that renders nothing (`export function VerifyOnZeroG(_: { rootHash?: string }) { return null; }`); Task 11 replaces it.

- [ ] **Step 4: Build and verify**

Run: `pnpm -C /opt/civilization-0/apps/web build`
Expected: `/citizens/ada` compiles. Then `pnpm -C /opt/civilization-0/apps/web dev` and load `http://localhost:4310/citizens/ada` — confirm the story card, timeline (Day 1→12), and the invest chain rendering in order memory→belief→compute→decision→event→storage.

- [ ] **Step 5: Commit**

```bash
git -C /opt/civilization-0 add apps/web/lib/snapshot.ts apps/web/components/CitizenView.tsx apps/web/components/VerifyOnZeroG.tsx apps/web/app/citizens
git -C /opt/civilization-0 commit -m "feat(web): build /citizens/ada with story, timeline, and graph reveal"
```

---

### Task 11: `/api/verify` route + `<VerifyOnZeroG>` live retrieval

**Files:**
- Create: `apps/web/app/api/verify/route.ts`
- Replace: `apps/web/components/VerifyOnZeroG.tsx` (the placeholder from Task 10)

**Interfaces:**
- Consumes: `loadZeroGConfig`, `createZeroGDownloader`, `parseArchivedTrace` from `@civ/zerog`.
- Produces: `GET /api/verify?root=<rootHash>` → JSON `{ ok: true, key, decision, verified, excerpt }` or `{ ok: false, error }`. `<VerifyOnZeroG rootHash>` renders a button that calls it and shows the verified panel + JSON excerpt from the downloaded artifact.

- [ ] **Step 1: Implement the API route**

```ts
// apps/web/app/api/verify/route.ts
import { NextResponse } from "next/server";
import { loadZeroGConfig, createZeroGDownloader, parseArchivedTrace } from "@civ/zerog";

export const runtime = "nodejs";

export async function GET(req: Request) {
  const root = new URL(req.url).searchParams.get("root");
  if (!root) return NextResponse.json({ ok: false, error: "missing root" }, { status: 400 });
  try {
    const config = loadZeroGConfig(process.env);
    const bytes = await createZeroGDownloader(config).download(root);
    const rec = parseArchivedTrace(bytes);
    const data = rec.data as { decision?: string; meta?: { verified?: boolean } };
    const excerpt = JSON.stringify({ decision: data.decision, verified: data.meta?.verified ?? false }, null, 2);
    return NextResponse.json({ ok: true, key: rec.key, decision: data.decision ?? null, verified: data.meta?.verified ?? false, excerpt });
  } catch (err) {
    return NextResponse.json({ ok: false, error: err instanceof Error ? err.message : String(err) }, { status: 502 });
  }
}
```

- [ ] **Step 2: Implement `VerifyOnZeroG.tsx`**

```tsx
// apps/web/components/VerifyOnZeroG.tsx
"use client";
import { useState } from "react";

type State = { status: "idle" | "loading" | "ok" | "error"; key?: string; excerpt?: string; error?: string };

export function VerifyOnZeroG({ rootHash }: { rootHash?: string }) {
  const [s, setS] = useState<State>({ status: "idle" });
  if (!rootHash) return null;

  async function verify() {
    setS({ status: "loading" });
    try {
      const res = await fetch(`/api/verify?root=${encodeURIComponent(rootHash!)}`);
      const j = await res.json();
      if (!j.ok) return setS({ status: "error", error: j.error });
      setS({ status: "ok", key: j.key, excerpt: j.excerpt });
    } catch (e) {
      setS({ status: "error", error: e instanceof Error ? e.message : String(e) });
    }
  }

  return (
    <div style={{ gridColumn: "1 / -1", marginTop: 8 }}>
      <button onClick={verify} disabled={s.status === "loading"} style={{ all: "unset", cursor: "pointer", padding: "8px 14px", border: "1px solid var(--accent)", borderRadius: 8, color: "var(--accent)", fontSize: 13 }}>
        {s.status === "loading" ? "Retrieving from 0G…" : "Verify on 0G"}
      </button>
      {s.status === "ok" && (
        <div style={{ marginTop: 10 }}>
          <div style={{ color: "var(--accent)", fontSize: 13 }}>✓ Verified on 0G Testnet — retrieved archived DecisionTrace ({s.key})</div>
          <pre className="mono" style={{ marginTop: 6, padding: 12, background: "#0d0f12", border: "1px solid var(--slate)", borderRadius: 8, fontSize: 12, overflowX: "auto" }}>{s.excerpt}</pre>
        </div>
      )}
      {s.status === "error" && <div style={{ marginTop: 8, color: "#d98", fontSize: 13 }}>Could not reach 0G Storage: {s.error}</div>}
    </div>
  );
}
```

- [ ] **Step 3: Build and verify the live retrieval**

Run: `pnpm -C /opt/civilization-0/apps/web build` (expect success), then `pnpm -C /opt/civilization-0/apps/web dev`. With `.env` present at repo root, load `/citizens/ada`, expand the **0G Storage** node, click **Verify on 0G** — confirm the panel shows `✓ Verified on 0G Testnet` and a JSON excerpt `{ "decision": "invest", "verified": true }` retrieved from the network. (The dev server must run with the repo-root `.env` loaded; if needed, start it as `pnpm -C /opt/civilization-0/apps/web exec dotenv -e ../../.env -- next dev -p 4310`, or export the vars in the shell.)

- [ ] **Step 4: Commit**

```bash
git -C /opt/civilization-0 add apps/web/app/api/verify/route.ts apps/web/components/VerifyOnZeroG.tsx
git -C /opt/civilization-0 commit -m "feat(web): add /api/verify route and live Verify-on-0G retrieval"
```

---

### Task 12: Aesthetic polish pass

**Files:**
- Modify: `apps/web/app/globals.css` and component inline styles as needed.

**Interfaces:** none (visual only). No new behavior; do not change selector or component contracts/tests.

- [ ] **Step 1: Apply the design system**

Invoke the `design-taste-frontend` skill and apply within the Global Constraints aesthetic (Bloomberg/Stripe/Linear/Vercel; black/charcoal/slate/off-white + one accent; mono hashes; **no** neon/particles/glow/cityscapes). Tighten type scale, spacing, node-card treatment, and the landing. Keep it restrained — the chain should read like a forensic evidence report.

- [ ] **Step 2: Verify nothing regressed**

Run: `pnpm -C /opt/civilization-0 test` (all unit + component tests pass) and `pnpm -C /opt/civilization-0/apps/web build` (succeeds). Re-walk the judge flow in dev.

- [ ] **Step 3: Commit**

```bash
git -C /opt/civilization-0 add apps/web
git -C /opt/civilization-0 commit -m "style(web): aesthetic polish pass (forensic-evidence look)"
```

---

### Final verification (whole slice)

- [ ] `pnpm -C /opt/civilization-0 test` — all unit + component tests pass, network-free.
- [ ] `pnpm -C /opt/civilization-0 exec tsc --noEmit -p tsconfig.json` — packages typecheck clean.
- [ ] `pnpm -C /opt/civilization-0/apps/web build` — Next build succeeds.
- [ ] Manual judge walkthrough in dev: `/` → Enter → `/citizens/ada` → story + timeline → click *Invested in Marcus* → chain in order memory→belief→**0G Compute (Verified)**→decision→event→**0G Storage** → click **Verify on 0G** → archived JSON excerpt returns from the network.
- [ ] Acceptance criteria §13 of the spec all satisfied.

---

## Self-review notes (author)

- **Spec coverage:** §3 seams → Tasks 1–4; §4 seed → Tasks 5–6; §5 screens → Tasks 7,10; §6 hero + Verify → Tasks 9,11; §7 WorldSnapshot → Task 1; §8 selectors → Task 8; §10 testing → embedded per task; §11 aesthetic → Task 12 + Global Constraints; optional confidence badge (§6) → built into Task 8 selector + rendered in Task 10. All covered.
- **Stretch flagged:** the confidence badge is folded in cheaply (a pure selector already under test + one render line); if it ever fights the layout, it can be dropped without touching other tasks.
- **Type consistency:** `getCausalChain`/`CausalChainView`/`ChainNode`/`TimelineEntry` names match across Tasks 8–11; `Downloader`/`parseArchivedTrace`/`createZeroGDownloader` match across Tasks 3,4,11; `buildAdaScenario(brain, storage)` signature matches across Tasks 5,6; `snapshot()`/`stripEmbeddings`/`WorldSnapshot` match across Tasks 1,2,6,8.
- **Risk:** seed determinism (model must return `invest`) is guarded by an assertion in `seed-ada.ts` (re-run on deviation); `downloadToBlob` read path confirmed in the SDK `.d.ts` and validated by `smoke-0g-download` before the route depends on it.
```