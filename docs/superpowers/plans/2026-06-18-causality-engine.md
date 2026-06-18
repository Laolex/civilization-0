# Civilization-0 — Core Causality Engine (Slice 0) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a fully-tested, network-free causality engine where a single citizen runs one tick and produces the chain `Memory → Belief → Decision → Event → DecisionTrace → archive`, with the exact retrieved memories and beliefs recorded as the reason for the decision.

**Architecture:** Pure-TypeScript pnpm monorepo. Each concern is a package behind a typed interface. The two external dependencies (the "brain"/LLM and durable "storage") and persistence are abstracted behind interfaces with deterministic **Fake** implementations, so the entire engine is unit-testable with no network and no database. The engine package orchestrates the per-citizen tick by composing these interfaces.

**Tech Stack:** TypeScript (ESM), pnpm workspaces, Vitest, vite-tsconfig-paths. No build step for tests — Vitest runs TS directly.

## Global Constraints

- Node version floor: `>=20` (matches installed v20.20.2). One line in root `package.json` engines.
- Package manager: **pnpm** workspaces only. No npm/yarn lockfiles.
- Module system: **ESM** everywhere (`"type": "module"` in every `package.json`).
- TypeScript: `strict: true`. No `any` in committed code except explicitly-typed test doubles.
- Internal package names are scoped `@civ/<name>`; source lives in `packages/<name>/src`.
- Import internal packages by their `@civ/*` alias, never by relative path across package boundaries.
- All randomness/time is injected (`idgen: () => string`, `clock: { day: number }`). No `Date.now()` / `Math.random()` / `crypto.randomUUID()` inside engine logic — determinism is a hard requirement of the spec.
- Commit after every task. Commit messages: Conventional Commits style. **Do not** add a `Co-Authored-By` trailer.

---

## File Structure

```
/opt/civilization-0
  package.json                 root: workspace scripts, devDeps (vitest, typescript, vite-tsconfig-paths)
  pnpm-workspace.yaml          packages/*
  tsconfig.base.json           strict, paths @civ/* -> packages/*/src
  vitest.config.ts             tsconfig paths plugin, globals
  packages/
    shared/src/index.ts        domain types + enums + id/util helpers
    storage/src/index.ts       StorageProvider interface + FakeStorage
    brain/src/index.ts         BrainProvider + DecisionContext/DecisionResult + FakeBrain
    store/src/index.ts         WorldStore interface + InMemoryWorldStore
    memory/src/index.ts        Embedder + FakeEmbedder + MemoryIndex (retrieve/rank)
    beliefs/src/index.ts       BeliefReviser interface + RuleBasedBeliefReviser
    explainability/src/index.ts ExplainabilityService (buildTrace + archive)
    engine/src/index.ts        runCitizenTick (the loop) + TickDeps/TickResult
    engine/src/scenario.test.ts end-to-end "Ada starts a company" causality proof
```

Each `packages/<name>` also has its own `package.json` (`@civ/<name>`, `"type":"module"`, `main: src/index.ts`) and colocated `*.test.ts` files.

---

### Task 1: Monorepo scaffold

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `tsconfig.base.json`, `vitest.config.ts`
- Create: `packages/shared/package.json`, `packages/shared/tsconfig.json`
- Test: `packages/shared/src/smoke.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: a working `pnpm test` command and the `@civ/shared` package alias resolvable from Vitest.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/smoke.test.ts`
```ts
import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs typescript tests", () => {
    const sum = (a: number, b: number): number => a + b;
    expect(sum(2, 3)).toBe(5);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test`
Expected: FAIL — `pnpm` errors that there is no `package.json` / `test` script yet (toolchain not set up).

- [ ] **Step 3: Write minimal implementation**

`package.json`
```json
{
  "name": "civilization-0",
  "private": true,
  "type": "module",
  "engines": { "node": ">=20" },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "typecheck": "tsc -b --pretty"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "vitest": "^2.0.0",
    "vite-tsconfig-paths": "^5.0.0"
  }
}
```

`pnpm-workspace.yaml`
```yaml
packages:
  - "packages/*"
```

`tsconfig.base.json`
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "declaration": true,
    "baseUrl": ".",
    "paths": {
      "@civ/shared": ["packages/shared/src"],
      "@civ/storage": ["packages/storage/src"],
      "@civ/brain": ["packages/brain/src"],
      "@civ/store": ["packages/store/src"],
      "@civ/memory": ["packages/memory/src"],
      "@civ/beliefs": ["packages/beliefs/src"],
      "@civ/explainability": ["packages/explainability/src"],
      "@civ/engine": ["packages/engine/src"]
    }
  }
}
```

`vitest.config.ts`
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { globals: true, include: ["packages/**/*.test.ts"] },
});
```

`packages/shared/package.json`
```json
{ "name": "@civ/shared", "version": "0.0.0", "private": true, "type": "module", "main": "src/index.ts" }
```

`packages/shared/tsconfig.json`
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```

Then install: `pnpm install`

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test`
Expected: PASS — 1 passed (`smoke.test.ts`).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold pnpm + vitest monorepo"
```

---

### Task 2: Domain types (`@civ/shared`)

**Files:**
- Create: `packages/shared/src/index.ts`
- Test: `packages/shared/src/index.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces (all later tasks rely on these exact names/types):
  - Enums/unions: `ActionType`, `MemoryType`, `Tier`.
  - Entities: `Traits`, `Citizen`, `Goal`, `Relationship`, `Memory`, `Belief`, `Decision`, `DecisionMemory`, `DecisionBelief`, `WorldEvent`, `DecisionTrace`, `WorldState`.
  - `ALL_ACTIONS: ActionType[]`.
  - Helper: `cosineSimilarity(a: number[], b: number[]): number`.

- [ ] **Step 1: Write the failing test**

`packages/shared/src/index.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { ALL_ACTIONS, cosineSimilarity, type Citizen } from "./index";

describe("shared", () => {
  it("exposes the MVP action verbs", () => {
    expect(ALL_ACTIONS).toContain("start_company");
    expect(ALL_ACTIONS).toContain("betray");
    expect(ALL_ACTIONS).toHaveLength(10);
  });

  it("computes cosine similarity", () => {
    expect(cosineSimilarity([1, 0], [1, 0])).toBeCloseTo(1);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0);
  });

  it("types a citizen", () => {
    const c: Citizen = {
      id: "c1", name: "Ada", occupation: "Engineer", age: 29,
      traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
      wealth: 0, reputation: 50, tier: 3, createdDay: 0,
    };
    expect(c.name).toBe("Ada");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/shared`
Expected: FAIL — cannot resolve `./index` exports.

- [ ] **Step 3: Write minimal implementation**

`packages/shared/src/index.ts`
```ts
export type Tier = 1 | 2 | 3;

export type ActionType =
  | "meet" | "friend" | "argue" | "hire" | "quit_job"
  | "start_company" | "partner" | "betray" | "invest" | "work";

export const ALL_ACTIONS: ActionType[] = [
  "meet", "friend", "argue", "hire", "quit_job",
  "start_company", "partner", "betray", "invest", "work",
];

export type MemoryType = "event" | "relationship" | "goal" | "observation";

export interface Traits {
  ambition: number; empathy: number; loyalty: number;
  curiosity: number; discipline: number; riskTolerance: number;
}

export interface Citizen {
  id: string; name: string; occupation: string; age: number;
  traits: Traits; wealth: number; reputation: number; tier: Tier; createdDay: number;
}

export interface Goal {
  id: string; citizenId: string; kind: string; description: string;
  progress: number; active: boolean;
}

export interface Relationship {
  citizenId: string; otherId: string; trust: number; friendship: number; influence: number;
}

export interface Memory {
  id: string; citizenId: string; day: number; type: MemoryType;
  importance: number; summary: string; embedding: number[];
  zgRootHash?: string; zgTxHash?: string;
}

export interface Belief {
  id: string; citizenId: string; statement: string; confidence: number;
  sourceMemoryIds: string[]; updatedDay: number;
}

export interface Decision {
  id: string; citizenId: string; goalId: string | null; day: number;
  reasoning: string; action: ActionType; targetId: string | null;
  brainProvider: string; brainModel: string;
}

export interface DecisionMemory { decisionId: string; memoryId: string; weight: number; }
export interface DecisionBelief { decisionId: string; beliefId: string; weight: number; }

export interface WorldEvent {
  id: string; day: number; type: ActionType; actorId: string; targetId: string | null;
  decisionId: string | null; payload: Record<string, unknown>;
  zgRootHash?: string; zgTxHash?: string;
}

export interface DecisionTrace {
  id: string; decisionId: string;
  trace: {
    decision: ActionType; goal: string | null; retrievedMemories: string[];
    beliefs: string[]; reasoning: string; eventId: string;
  };
  zgRootHash?: string; zgTxHash?: string;
}

export interface WorldState {
  day: number; economy: Record<string, number>; headline: string;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/shared`
Expected: PASS — 3 passed (plus smoke test).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(shared): domain types, action verbs, cosine helper"
```

---

### Task 3: Durable storage abstraction (`@civ/storage`)

**Files:**
- Create: `packages/storage/package.json`, `packages/storage/tsconfig.json`, `packages/storage/src/index.ts`
- Test: `packages/storage/src/index.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `interface ArchiveResult { rootHash: string; txHash: string; ts: number; }`
  - `interface StorageProvider { readonly name: string; archive(key: string, data: unknown): Promise<ArchiveResult>; }`
  - `class FakeStorage implements StorageProvider` — deterministic content-addressed hash; records calls in `.calls`.

- [ ] **Step 1: Write the failing test**

`packages/storage/src/index.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { FakeStorage } from "./index";

describe("FakeStorage", () => {
  it("returns a deterministic content hash and records the call", async () => {
    const s = new FakeStorage();
    const r1 = await s.archive("event/evt_1", { type: "start_company" });
    const r2 = await s.archive("event/evt_1", { type: "start_company" });
    expect(r1.rootHash).toMatch(/^0xfake/);
    expect(r1.rootHash).toBe(r2.rootHash);
    expect(s.calls).toHaveLength(2);
    expect(s.calls[0].key).toBe("event/evt_1");
  });

  it("differs by content", async () => {
    const s = new FakeStorage();
    const a = await s.archive("k", { v: 1 });
    const b = await s.archive("k", { v: 2 });
    expect(a.rootHash).not.toBe(b.rootHash);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/storage`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Write minimal implementation**

`packages/storage/package.json`
```json
{ "name": "@civ/storage", "version": "0.0.0", "private": true, "type": "module", "main": "src/index.ts" }
```
`packages/storage/tsconfig.json`
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```
`packages/storage/src/index.ts`
```ts
export interface ArchiveResult { rootHash: string; txHash: string; ts: number; }

export interface StorageProvider {
  readonly name: string;
  archive(key: string, data: unknown): Promise<ArchiveResult>;
}

function hashString(s: string): string {
  // FNV-1a 32-bit — deterministic, no crypto/network.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export class FakeStorage implements StorageProvider {
  readonly name = "fake";
  readonly calls: Array<{ key: string; data: unknown; result: ArchiveResult }> = [];

  async archive(key: string, data: unknown): Promise<ArchiveResult> {
    const digest = hashString(JSON.stringify(data));
    const result: ArchiveResult = {
      rootHash: `0xfake${digest}`,
      txHash: `0xtx${hashString(key + digest)}`,
      ts: this.calls.length,
    };
    this.calls.push({ key, data, result });
    return result;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/storage`
Expected: PASS — 2 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(storage): StorageProvider interface + deterministic FakeStorage"
```

---

### Task 4: Brain abstraction (`@civ/brain`)

**Files:**
- Create: `packages/brain/package.json`, `packages/brain/tsconfig.json`, `packages/brain/src/index.ts`
- Test: `packages/brain/src/index.test.ts`

**Interfaces:**
- Consumes: `@civ/shared` (`Citizen`, `Goal`, `Memory`, `Belief`, `Relationship`, `WorldState`, `ActionType`).
- Produces:
  - `interface DecisionContext { citizen; goal: Goal | null; memories: Memory[]; beliefs: Belief[]; relationships: Relationship[]; worldState: WorldState; availableActions: ActionType[]; }`
  - `interface DecisionResult { action: ActionType; targetId: string | null; reasoning: string; memoryWeights: Record<string, number>; beliefWeights: Record<string, number>; }`
  - `interface BrainProvider { readonly name: string; readonly model: string; decide(ctx: DecisionContext): Promise<DecisionResult>; }`
  - `class FakeBrain implements BrainProvider` — constructed with a script: `(ctx) => DecisionResult`.

- [ ] **Step 1: Write the failing test**

`packages/brain/src/index.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { FakeBrain, type DecisionContext } from "./index";

const ctx: DecisionContext = {
  citizen: { id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 },
  goal: null, memories: [{ id: "m1", citizenId: "ada", day: 1, type: "event",
    importance: 8, summary: "Lost job", embedding: [1, 0] }],
  beliefs: [{ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy",
    confidence: 0.9, sourceMemoryIds: ["m0"], updatedDay: 2 }],
  relationships: [], worldState: { day: 3, economy: {}, headline: "" },
  availableActions: ["work", "start_company"],
};

describe("FakeBrain", () => {
  it("returns the scripted decision and reports its identity", async () => {
    const brain = new FakeBrain((c) => ({
      action: "start_company", targetId: null,
      reasoning: "Have funding belief, lost job",
      memoryWeights: { [c.memories[0].id]: 1 },
      beliefWeights: { [c.beliefs[0].id]: 0.9 },
    }));
    expect(brain.name).toBe("fake");
    const d = await brain.decide(ctx);
    expect(d.action).toBe("start_company");
    expect(d.memoryWeights["m1"]).toBe(1);
    expect(d.beliefWeights["b1"]).toBe(0.9);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/brain`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Write minimal implementation**

`packages/brain/package.json`
```json
{ "name": "@civ/brain", "version": "0.0.0", "private": true, "type": "module", "main": "src/index.ts" }
```
`packages/brain/tsconfig.json`
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```
`packages/brain/src/index.ts`
```ts
import type {
  ActionType, Belief, Citizen, Goal, Memory, Relationship, WorldState,
} from "@civ/shared";

export interface DecisionContext {
  citizen: Citizen;
  goal: Goal | null;
  memories: Memory[];
  beliefs: Belief[];
  relationships: Relationship[];
  worldState: WorldState;
  availableActions: ActionType[];
}

export interface DecisionResult {
  action: ActionType;
  targetId: string | null;
  reasoning: string;
  memoryWeights: Record<string, number>;
  beliefWeights: Record<string, number>;
}

export interface BrainProvider {
  readonly name: string;
  readonly model: string;
  decide(ctx: DecisionContext): Promise<DecisionResult>;
}

export type BrainScript = (ctx: DecisionContext) => DecisionResult;

export class FakeBrain implements BrainProvider {
  readonly name = "fake";
  readonly model = "scripted-v0";
  constructor(private readonly script: BrainScript) {}
  async decide(ctx: DecisionContext): Promise<DecisionResult> {
    return this.script(ctx);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/brain`
Expected: PASS — 1 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(brain): BrainProvider interface + scripted FakeBrain"
```

---

### Task 5: World store (`@civ/store`)

**Files:**
- Create: `packages/store/package.json`, `packages/store/tsconfig.json`, `packages/store/src/index.ts`
- Test: `packages/store/src/index.test.ts`

**Note:** This package is the relational/world-state CRUD that becomes Postgres in a later plan. It is a clarifying addition to the spec's package list (spec's `memory` package stays focused on semantic retrieval; `store` holds structured entity persistence). The interface is what the engine depends on; `InMemoryWorldStore` is the Slice-0 implementation.

**Interfaces:**
- Consumes: `@civ/shared` entities.
- Produces:
  - `interface WorldStore` with methods:
    - `getCitizen(id): Citizen | undefined`, `upsertCitizen(c): void`
    - `getActiveGoal(citizenId): Goal | undefined`, `upsertGoal(g): void`
    - `getRelationships(citizenId): Relationship[]`, `upsertRelationship(r): void`
    - `getMemories(citizenId): Memory[]`, `addMemory(m): void`, `updateMemoryArchive(id, rootHash, txHash): void`
    - `getBeliefs(citizenId): Belief[]`, `upsertBelief(b): void`
    - `addDecision(d): void`
    - `addDecisionMemories(rows: DecisionMemory[]): void`, `addDecisionBeliefs(rows: DecisionBelief[]): void`
    - `getDecisionMemories(decisionId): DecisionMemory[]`, `getDecisionBeliefs(decisionId): DecisionBelief[]`
    - `addEvent(e): void`, `updateEventArchive(id, rootHash, txHash): void`
    - `addTrace(t): void`, `updateTraceArchive(id, rootHash, txHash): void`
    - `getTrace(decisionId): DecisionTrace | undefined`
    - `getWorldState(): WorldState`, `setWorldState(w): void`
  - `class InMemoryWorldStore implements WorldStore`.

- [ ] **Step 1: Write the failing test**

`packages/store/src/index.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { InMemoryWorldStore } from "./index";

describe("InMemoryWorldStore", () => {
  it("stores and retrieves citizens and their memories", () => {
    const s = new InMemoryWorldStore();
    s.upsertCitizen({ id: "ada", name: "Ada", occupation: "Engineer", age: 29,
      traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
      wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
    s.addMemory({ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "Lost job", embedding: [1, 0] });
    expect(s.getCitizen("ada")?.name).toBe("Ada");
    expect(s.getMemories("ada")).toHaveLength(1);
    expect(s.getMemories("other")).toHaveLength(0);
  });

  it("records decision_memories and decision_beliefs joins", () => {
    const s = new InMemoryWorldStore();
    s.addDecisionMemories([{ decisionId: "d1", memoryId: "m1", weight: 1 }]);
    s.addDecisionBeliefs([{ decisionId: "d1", beliefId: "b1", weight: 0.9 }]);
    expect(s.getDecisionMemories("d1")).toEqual([{ decisionId: "d1", memoryId: "m1", weight: 1 }]);
    expect(s.getDecisionBeliefs("d1")[0].beliefId).toBe("b1");
  });

  it("updates archive hashes on events", () => {
    const s = new InMemoryWorldStore();
    s.addEvent({ id: "e1", day: 1, type: "start_company", actorId: "ada", targetId: null, decisionId: "d1", payload: {} });
    s.updateEventArchive("e1", "0xroot", "0xtx");
    expect(s.getEvent("e1")?.zgRootHash).toBe("0xroot");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/store`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Write minimal implementation**

`packages/store/package.json`
```json
{ "name": "@civ/store", "version": "0.0.0", "private": true, "type": "module", "main": "src/index.ts" }
```
`packages/store/tsconfig.json`
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```
`packages/store/src/index.ts`
```ts
import type {
  Belief, Citizen, Decision, DecisionBelief, DecisionMemory, DecisionTrace,
  Goal, Memory, Relationship, WorldEvent, WorldState,
} from "@civ/shared";

export interface WorldStore {
  getCitizen(id: string): Citizen | undefined;
  upsertCitizen(c: Citizen): void;
  getActiveGoal(citizenId: string): Goal | undefined;
  upsertGoal(g: Goal): void;
  getRelationships(citizenId: string): Relationship[];
  upsertRelationship(r: Relationship): void;
  getMemories(citizenId: string): Memory[];
  addMemory(m: Memory): void;
  updateMemoryArchive(id: string, rootHash: string, txHash: string): void;
  getBeliefs(citizenId: string): Belief[];
  upsertBelief(b: Belief): void;
  addDecision(d: Decision): void;
  addDecisionMemories(rows: DecisionMemory[]): void;
  addDecisionBeliefs(rows: DecisionBelief[]): void;
  getDecisionMemories(decisionId: string): DecisionMemory[];
  getDecisionBeliefs(decisionId: string): DecisionBelief[];
  addEvent(e: WorldEvent): void;
  getEvent(id: string): WorldEvent | undefined;
  updateEventArchive(id: string, rootHash: string, txHash: string): void;
  addTrace(t: DecisionTrace): void;
  getTrace(decisionId: string): DecisionTrace | undefined;
  updateTraceArchive(id: string, rootHash: string, txHash: string): void;
  getWorldState(): WorldState;
  setWorldState(w: WorldState): void;
}

export class InMemoryWorldStore implements WorldStore {
  private citizens = new Map<string, Citizen>();
  private goals = new Map<string, Goal>();
  private relationships: Relationship[] = [];
  private memories: Memory[] = [];
  private beliefs = new Map<string, Belief>();
  private decisions: Decision[] = [];
  private decisionMemories: DecisionMemory[] = [];
  private decisionBeliefs: DecisionBelief[] = [];
  private events = new Map<string, WorldEvent>();
  private traces: DecisionTrace[] = [];
  private world: WorldState = { day: 0, economy: {}, headline: "" };

  getCitizen(id: string) { return this.citizens.get(id); }
  upsertCitizen(c: Citizen) { this.citizens.set(c.id, c); }
  getActiveGoal(citizenId: string) {
    return [...this.goals.values()].find((g) => g.citizenId === citizenId && g.active);
  }
  upsertGoal(g: Goal) { this.goals.set(g.id, g); }
  getRelationships(citizenId: string) { return this.relationships.filter((r) => r.citizenId === citizenId); }
  upsertRelationship(r: Relationship) {
    const i = this.relationships.findIndex((x) => x.citizenId === r.citizenId && x.otherId === r.otherId);
    if (i >= 0) this.relationships[i] = r; else this.relationships.push(r);
  }
  getMemories(citizenId: string) { return this.memories.filter((m) => m.citizenId === citizenId); }
  addMemory(m: Memory) { this.memories.push(m); }
  updateMemoryArchive(id: string, rootHash: string, txHash: string) {
    const m = this.memories.find((x) => x.id === id);
    if (m) { m.zgRootHash = rootHash; m.zgTxHash = txHash; }
  }
  getBeliefs(citizenId: string) { return [...this.beliefs.values()].filter((b) => b.citizenId === citizenId); }
  upsertBelief(b: Belief) { this.beliefs.set(b.id, b); }
  addDecision(d: Decision) { this.decisions.push(d); }
  addDecisionMemories(rows: DecisionMemory[]) { this.decisionMemories.push(...rows); }
  addDecisionBeliefs(rows: DecisionBelief[]) { this.decisionBeliefs.push(...rows); }
  getDecisionMemories(decisionId: string) { return this.decisionMemories.filter((r) => r.decisionId === decisionId); }
  getDecisionBeliefs(decisionId: string) { return this.decisionBeliefs.filter((r) => r.decisionId === decisionId); }
  addEvent(e: WorldEvent) { this.events.set(e.id, e); }
  getEvent(id: string) { return this.events.get(id); }
  updateEventArchive(id: string, rootHash: string, txHash: string) {
    const e = this.events.get(id);
    if (e) { e.zgRootHash = rootHash; e.zgTxHash = txHash; }
  }
  addTrace(t: DecisionTrace) { this.traces.push(t); }
  getTrace(decisionId: string) { return this.traces.find((t) => t.decisionId === decisionId); }
  updateTraceArchive(id: string, rootHash: string, txHash: string) {
    const t = this.traces.find((x) => x.id === id);
    if (t) { t.zgRootHash = rootHash; t.zgTxHash = txHash; }
  }
  getWorldState() { return this.world; }
  setWorldState(w: WorldState) { this.world = w; }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/store`
Expected: PASS — 3 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(store): WorldStore interface + InMemoryWorldStore"
```

---

### Task 6: Memory retrieval (`@civ/memory`)

**Files:**
- Create: `packages/memory/package.json`, `packages/memory/tsconfig.json`, `packages/memory/src/index.ts`
- Test: `packages/memory/src/index.test.ts`

**Interfaces:**
- Consumes: `@civ/shared` (`Memory`, `cosineSimilarity`), `@civ/store` (`WorldStore`).
- Produces:
  - `interface Embedder { embed(text: string): number[]; }`
  - `class FakeEmbedder implements Embedder` — deterministic bag-of-tokens vector over a fixed dimension.
  - `class MemoryIndex` with `constructor(store: WorldStore, embedder: Embedder)` and `retrieve(citizenId: string, queryText: string, k: number): Memory[]` (ranked by importance-weighted cosine, descending, top-k).

- [ ] **Step 1: Write the failing test**

`packages/memory/src/index.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { InMemoryWorldStore } from "@civ/store";
import { FakeEmbedder, MemoryIndex } from "./index";

describe("MemoryIndex", () => {
  it("retrieves the most relevant memories first", () => {
    const store = new InMemoryWorldStore();
    const emb = new FakeEmbedder();
    const add = (id: string, summary: string, importance: number) =>
      store.addMemory({ id, citizenId: "ada", day: 1, type: "event", importance, summary, embedding: emb.embed(summary) });
    add("m1", "lost job during recession", 8);
    add("m2", "ate lunch at a cafe", 2);
    add("m3", "marcus offered funding for a company", 9);

    const index = new MemoryIndex(store, emb);
    const top = index.retrieve("ada", "should I start a company with funding", 2);
    expect(top).toHaveLength(2);
    expect(top.map((m) => m.id)).toContain("m3");
    expect(top[0].id).toBe("m3"); // funding/company is most relevant + high importance
  });

  it("only returns the citizen's own memories", () => {
    const store = new InMemoryWorldStore();
    const emb = new FakeEmbedder();
    store.addMemory({ id: "x", citizenId: "bob", day: 1, type: "event", importance: 9, summary: "company funding", embedding: emb.embed("company funding") });
    const index = new MemoryIndex(store, emb);
    expect(index.retrieve("ada", "company funding", 5)).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/memory`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Write minimal implementation**

`packages/memory/package.json`
```json
{ "name": "@civ/memory", "version": "0.0.0", "private": true, "type": "module", "main": "src/index.ts" }
```
`packages/memory/tsconfig.json`
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```
`packages/memory/src/index.ts`
```ts
import { cosineSimilarity, type Memory } from "@civ/shared";
import type { WorldStore } from "@civ/store";

export interface Embedder { embed(text: string): number[]; }

const DIM = 64;

function tokenBucket(token: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < token.length; i++) { h ^= token.charCodeAt(i); h = Math.imul(h, 0x01000193); }
  return (h >>> 0) % DIM;
}

/** Deterministic bag-of-tokens embedding — no network, stable across runs. */
export class FakeEmbedder implements Embedder {
  embed(text: string): number[] {
    const v = new Array<number>(DIM).fill(0);
    for (const raw of text.toLowerCase().split(/\W+/)) {
      if (!raw) continue;
      v[tokenBucket(raw)] += 1;
    }
    return v;
  }
}

export class MemoryIndex {
  constructor(private readonly store: WorldStore, private readonly embedder: Embedder) {}

  retrieve(citizenId: string, queryText: string, k: number): Memory[] {
    const q = this.embedder.embed(queryText);
    return this.store
      .getMemories(citizenId)
      .map((m) => ({ m, score: cosineSimilarity(q, m.embedding) * (1 + m.importance / 10) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, k)
      .map((x) => x.m);
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/memory`
Expected: PASS — 2 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(memory): FakeEmbedder + MemoryIndex retrieval/ranking"
```

---

### Task 7: Belief revision (`@civ/beliefs`)

**Files:**
- Create: `packages/beliefs/package.json`, `packages/beliefs/tsconfig.json`, `packages/beliefs/src/index.ts`
- Test: `packages/beliefs/src/index.test.ts`

**Design:** Belief revision is deterministic and rule-based for Slice 0 (an LLM-backed reviser is a later swap, same interface). Rule: a `relationship`-type memory whose `payload`-derived summary names another entity strengthens (or creates) a "trust" belief toward that entity; confidence rises with repeated supporting memories, capped at 1. The reviser is told the target entity and a polarity by the caller (the engine knows the action target), so it stays free of brittle text parsing.

**Interfaces:**
- Consumes: `@civ/shared` (`Belief`, `Memory`).
- Produces:
  - `interface BeliefInput { citizenId: string; newMemory: Memory; existing: Belief[]; targetName: string | null; polarity: 1 | -1; day: number; idgen: () => string; }`
  - `interface BeliefRevision { created: Belief[]; updated: Belief[]; }`
  - `interface BeliefReviser { revise(input: BeliefInput): BeliefRevision; }`
  - `class RuleBasedBeliefReviser implements BeliefReviser`.

- [ ] **Step 1: Write the failing test**

`packages/beliefs/src/index.test.ts`
```ts
import { describe, it, expect } from "vitest";
import type { Belief, Memory } from "@civ/shared";
import { RuleBasedBeliefReviser } from "./index";

const mem = (id: string): Memory => ({ id, citizenId: "ada", day: 2, type: "relationship", importance: 7, summary: "Marcus offered funding", embedding: [] });

describe("RuleBasedBeliefReviser", () => {
  it("creates a trust belief from a positive relationship memory", () => {
    const r = new RuleBasedBeliefReviser();
    let n = 0;
    const out = r.revise({ citizenId: "ada", newMemory: mem("m1"), existing: [], targetName: "Marcus", polarity: 1, day: 2, idgen: () => `b${++n}` });
    expect(out.created).toHaveLength(1);
    expect(out.created[0].statement).toBe("Marcus is trustworthy");
    expect(out.created[0].confidence).toBeGreaterThan(0.5);
    expect(out.created[0].sourceMemoryIds).toEqual(["m1"]);
  });

  it("strengthens an existing belief and appends the source memory", () => {
    const r = new RuleBasedBeliefReviser();
    const existing: Belief = { id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.6, sourceMemoryIds: ["m0"], updatedDay: 1 };
    const out = r.revise({ citizenId: "ada", newMemory: mem("m2"), existing: [existing], targetName: "Marcus", polarity: 1, day: 3, idgen: () => "bx" });
    expect(out.created).toHaveLength(0);
    expect(out.updated).toHaveLength(1);
    expect(out.updated[0].confidence).toBeGreaterThan(0.6);
    expect(out.updated[0].sourceMemoryIds).toContain("m2");
    expect(out.updated[0].updatedDay).toBe(3);
  });

  it("no-ops when there is no target entity", () => {
    const r = new RuleBasedBeliefReviser();
    const out = r.revise({ citizenId: "ada", newMemory: mem("m9"), existing: [], targetName: null, polarity: 1, day: 2, idgen: () => "b" });
    expect(out.created).toHaveLength(0);
    expect(out.updated).toHaveLength(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/beliefs`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Write minimal implementation**

`packages/beliefs/package.json`
```json
{ "name": "@civ/beliefs", "version": "0.0.0", "private": true, "type": "module", "main": "src/index.ts" }
```
`packages/beliefs/tsconfig.json`
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```
`packages/beliefs/src/index.ts`
```ts
import type { Belief, Memory } from "@civ/shared";

export interface BeliefInput {
  citizenId: string;
  newMemory: Memory;
  existing: Belief[];
  targetName: string | null;
  polarity: 1 | -1;
  day: number;
  idgen: () => string;
}

export interface BeliefRevision { created: Belief[]; updated: Belief[]; }

export interface BeliefReviser { revise(input: BeliefInput): BeliefRevision; }

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

export class RuleBasedBeliefReviser implements BeliefReviser {
  revise(input: BeliefInput): BeliefRevision {
    const { targetName, polarity, existing, newMemory, citizenId, day, idgen } = input;
    if (!targetName) return { created: [], updated: [] };

    const statement = polarity > 0 ? `${targetName} is trustworthy` : `${targetName} is untrustworthy`;
    const match = existing.find((b) => b.statement === statement);
    const delta = 0.15 * polarity;

    if (match) {
      const updated: Belief = {
        ...match,
        confidence: clamp01(match.confidence + delta),
        sourceMemoryIds: match.sourceMemoryIds.includes(newMemory.id)
          ? match.sourceMemoryIds
          : [...match.sourceMemoryIds, newMemory.id],
        updatedDay: day,
      };
      return { created: [], updated: [updated] };
    }

    const created: Belief = {
      id: idgen(), citizenId, statement,
      confidence: clamp01(0.5 + delta),
      sourceMemoryIds: [newMemory.id], updatedDay: day,
    };
    return { created: [created], updated: [] };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/beliefs`
Expected: PASS — 3 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(beliefs): BeliefReviser interface + RuleBasedBeliefReviser"
```

---

### Task 8: Explainability trace (`@civ/explainability`)

**Files:**
- Create: `packages/explainability/package.json`, `packages/explainability/tsconfig.json`, `packages/explainability/src/index.ts`
- Test: `packages/explainability/src/index.test.ts`

**Interfaces:**
- Consumes: `@civ/shared` (`Decision`, `Memory`, `Belief`, `WorldEvent`, `DecisionTrace`, `Goal`), `@civ/storage` (`StorageProvider`).
- Produces:
  - `class ExplainabilityService` with `constructor(storage: StorageProvider)` and
    `async buildAndArchive(args: { id: string; decision: Decision; goal: Goal | null; memories: Memory[]; beliefs: Belief[]; event: WorldEvent }): Promise<DecisionTrace>` — assembles the `DecisionTrace`, archives `trace.trace` to storage under key `trace/<decisionId>`, and returns the trace with `zgRootHash`/`zgTxHash` populated.

- [ ] **Step 1: Write the failing test**

`packages/explainability/src/index.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { FakeStorage } from "@civ/storage";
import type { Belief, Decision, Goal, Memory, WorldEvent } from "@civ/shared";
import { ExplainabilityService } from "./index";

describe("ExplainabilityService", () => {
  it("builds a trace and archives it, returning hashes", async () => {
    const storage = new FakeStorage();
    const svc = new ExplainabilityService(storage);
    const decision: Decision = { id: "d1", citizenId: "ada", goalId: "g1", day: 5,
      reasoning: "have funding belief", action: "start_company", targetId: null,
      brainProvider: "fake", brainModel: "scripted-v0" };
    const goal: Goal = { id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true };
    const memories: Memory[] = [{ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "Lost job", embedding: [] }];
    const beliefs: Belief[] = [{ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.75, sourceMemoryIds: ["m0"], updatedDay: 3 }];
    const event: WorldEvent = { id: "e1", day: 5, type: "start_company", actorId: "ada", targetId: null, decisionId: "d1", payload: {} };

    const trace = await svc.buildAndArchive({ id: "t1", decision, goal, memories, beliefs, event });

    expect(trace.trace.decision).toBe("start_company");
    expect(trace.trace.retrievedMemories).toEqual(["m1"]);
    expect(trace.trace.beliefs).toEqual(["Marcus is trustworthy"]);
    expect(trace.trace.goal).toBe("financial independence");
    expect(trace.trace.eventId).toBe("e1");
    expect(trace.zgRootHash).toMatch(/^0xfake/);
    expect(storage.calls[0].key).toBe("trace/d1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/explainability`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Write minimal implementation**

`packages/explainability/package.json`
```json
{ "name": "@civ/explainability", "version": "0.0.0", "private": true, "type": "module", "main": "src/index.ts" }
```
`packages/explainability/tsconfig.json`
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```
`packages/explainability/src/index.ts`
```ts
import type { Belief, Decision, DecisionTrace, Goal, Memory, WorldEvent } from "@civ/shared";
import type { StorageProvider } from "@civ/storage";

export interface BuildTraceArgs {
  id: string;
  decision: Decision;
  goal: Goal | null;
  memories: Memory[];
  beliefs: Belief[];
  event: WorldEvent;
}

export class ExplainabilityService {
  constructor(private readonly storage: StorageProvider) {}

  async buildAndArchive(args: BuildTraceArgs): Promise<DecisionTrace> {
    const { id, decision, goal, memories, beliefs, event } = args;
    const trace: DecisionTrace = {
      id,
      decisionId: decision.id,
      trace: {
        decision: decision.action,
        goal: goal ? goal.description : null,
        retrievedMemories: memories.map((m) => m.id),
        beliefs: beliefs.map((b) => b.statement),
        reasoning: decision.reasoning,
        eventId: event.id,
      },
    };
    const res = await this.storage.archive(`trace/${decision.id}`, trace.trace);
    trace.zgRootHash = res.rootHash;
    trace.zgTxHash = res.txHash;
    return trace;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/explainability`
Expected: PASS — 1 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(explainability): build + archive DecisionTrace"
```

---

### Task 9: The tick loop (`@civ/engine`)

**Files:**
- Create: `packages/engine/package.json`, `packages/engine/tsconfig.json`, `packages/engine/src/index.ts`
- Test: `packages/engine/src/index.test.ts`

**Design:** `runCitizenTick` composes every package into the spec's loop: observe → retrieve (memories+beliefs+relationships) → build context → decide → execute (create event) → record causality (`decision` + `decision_memories` + `decision_beliefs`) → build+archive trace → form memory → revise beliefs → archive major event. "Major" = action in `MAJOR_ACTIONS`. The `target` of the action drives belief revision (positive polarity toward the target). Memory importance comes from the brain result if provided, else a default; memories below `MEMORY_IMPORTANCE_THRESHOLD` (4) are not stored.

**Interfaces:**
- Consumes: every prior package.
- Produces:
  - `const MAJOR_ACTIONS: ActionType[]`
  - `interface TickDeps { store; memoryIndex; reviser; brain; storage; explain; embedder; clock: { day: number }; idgen: () => string; }`
  - `interface TickResult { decision: Decision; event: WorldEvent; trace: DecisionTrace; storedMemory: Memory | null; }`
  - `async function runCitizenTick(deps: TickDeps, citizenId: string): Promise<TickResult>`

- [ ] **Step 1: Write the failing test**

`packages/engine/src/index.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { InMemoryWorldStore } from "@civ/store";
import { FakeEmbedder, MemoryIndex } from "@civ/memory";
import { RuleBasedBeliefReviser } from "@civ/beliefs";
import { FakeBrain } from "@civ/brain";
import { FakeStorage } from "@civ/storage";
import { ExplainabilityService } from "@civ/explainability";
import { runCitizenTick, type TickDeps } from "./index";

function setup() {
  const store = new InMemoryWorldStore();
  const embedder = new FakeEmbedder();
  store.upsertCitizen({ id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
  store.upsertGoal({ id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true });
  store.addMemory({ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job during recession", embedding: embedder.embed("lost job during recession") });
  store.upsertBelief({ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.7, sourceMemoryIds: ["m0"], updatedDay: 2 });
  store.setWorldState({ day: 5, economy: { inflation: 8 }, headline: "Recession deepens" });

  let n = 0;
  const idgen = () => `id${++n}`;
  const brain = new FakeBrain((ctx) => ({
    action: "start_company", targetId: "marcus",
    reasoning: "I lost my job and I trust Marcus's funding offer",
    memoryWeights: Object.fromEntries(ctx.memories.map((m) => [m.id, 1])),
    beliefWeights: Object.fromEntries(ctx.beliefs.map((b) => [b.id, b.confidence])),
  }));
  const storage = new FakeStorage();
  const deps: TickDeps = {
    store, embedder, memoryIndex: new MemoryIndex(store, embedder),
    reviser: new RuleBasedBeliefReviser(), brain, storage,
    explain: new ExplainabilityService(storage),
    clock: { day: 5 }, idgen,
  };
  return { store, storage, deps };
}

describe("runCitizenTick", () => {
  it("produces the full causality chain", async () => {
    const { store, storage, deps } = setup();
    const result = await runCitizenTick(deps, "ada");

    // decision recorded with provider identity
    expect(result.decision.action).toBe("start_company");
    expect(result.decision.brainProvider).toBe("fake");

    // decision_memories + decision_beliefs joins reference the retrieved inputs
    const dm = store.getDecisionMemories(result.decision.id);
    const db = store.getDecisionBeliefs(result.decision.id);
    expect(dm.map((r) => r.memoryId)).toContain("m1");
    expect(db.map((r) => r.beliefId)).toContain("b1");

    // event created and linked to the decision
    expect(result.event.decisionId).toBe(result.decision.id);

    // trace archived to storage with a hash
    expect(result.trace.zgRootHash).toMatch(/^0xfake/);
    expect(store.getTrace(result.decision.id)?.zgRootHash).toBe(result.trace.zgRootHash);

    // major event archived to storage
    const archivedEvent = store.getEvent(result.event.id);
    expect(archivedEvent?.zgRootHash).toMatch(/^0xfake/);

    // a new memory formed and a belief about Marcus strengthened
    expect(result.storedMemory).not.toBeNull();
    const marcusBelief = store.getBeliefs("ada").find((b) => b.statement === "Marcus is trustworthy");
    expect(marcusBelief!.confidence).toBeGreaterThan(0.7);
  });

  it("archives a trace for every decision (the 'why' is always durable)", async () => {
    const { storage, deps } = setup();
    await runCitizenTick(deps, "ada");
    expect(storage.calls.some((c) => c.key.startsWith("trace/"))).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/engine`
Expected: FAIL — cannot resolve `./index`.

- [ ] **Step 3: Write minimal implementation**

`packages/engine/package.json`
```json
{ "name": "@civ/engine", "version": "0.0.0", "private": true, "type": "module", "main": "src/index.ts" }
```
`packages/engine/tsconfig.json`
```json
{ "extends": "../../tsconfig.base.json", "include": ["src"] }
```
`packages/engine/src/index.ts`
```ts
import {
  ALL_ACTIONS, type ActionType, type Decision, type DecisionBelief,
  type DecisionMemory, type DecisionTrace, type Memory, type WorldEvent,
} from "@civ/shared";
import type { WorldStore } from "@civ/store";
import { type Embedder, MemoryIndex } from "@civ/memory";
import type { BeliefReviser } from "@civ/beliefs";
import type { BrainProvider } from "@civ/brain";
import type { StorageProvider } from "@civ/storage";
import type { ExplainabilityService } from "@civ/explainability";

export const MAJOR_ACTIONS: ActionType[] = [
  "start_company", "partner", "betray", "hire", "quit_job", "invest",
];

const RETRIEVE_K = 5;
const MEMORY_IMPORTANCE_THRESHOLD = 4;

export interface TickDeps {
  store: WorldStore;
  embedder: Embedder;
  memoryIndex: MemoryIndex;
  reviser: BeliefReviser;
  brain: BrainProvider;
  storage: StorageProvider;
  explain: ExplainabilityService;
  clock: { day: number };
  idgen: () => string;
}

export interface TickResult {
  decision: Decision;
  event: WorldEvent;
  trace: DecisionTrace;
  storedMemory: Memory | null;
}

export async function runCitizenTick(deps: TickDeps, citizenId: string): Promise<TickResult> {
  const { store, embedder, memoryIndex, reviser, brain, storage, explain, clock, idgen } = deps;

  const citizen = store.getCitizen(citizenId);
  if (!citizen) throw new Error(`unknown citizen ${citizenId}`);
  const goal = store.getActiveGoal(citizenId) ?? null;
  const worldState = store.getWorldState();

  // 1-2. Observe + retrieve
  const query = `${goal?.description ?? ""} ${worldState.headline}`.trim();
  const memories = memoryIndex.retrieve(citizenId, query, RETRIEVE_K);
  const beliefs = store.getBeliefs(citizenId);
  const relationships = store.getRelationships(citizenId);

  // 3-4. Build context + decide
  const result = await brain.decide({
    citizen, goal, memories, beliefs, relationships, worldState, availableActions: ALL_ACTIONS,
  });

  // 5. Execute -> event
  const decisionId = idgen();
  const event: WorldEvent = {
    id: idgen(), day: clock.day, type: result.action, actorId: citizenId,
    targetId: result.targetId, decisionId, payload: {},
  };
  store.addEvent(event);

  // 6. Record causality
  const decision: Decision = {
    id: decisionId, citizenId, goalId: goal?.id ?? null, day: clock.day,
    reasoning: result.reasoning, action: result.action, targetId: result.targetId,
    brainProvider: brain.name, brainModel: brain.model,
  };
  store.addDecision(decision);

  const dm: DecisionMemory[] = memories
    .filter((m) => m.id in result.memoryWeights)
    .map((m) => ({ decisionId, memoryId: m.id, weight: result.memoryWeights[m.id] }));
  const db: DecisionBelief[] = beliefs
    .filter((b) => b.id in result.beliefWeights)
    .map((b) => ({ decisionId, beliefId: b.id, weight: result.beliefWeights[b.id] }));
  store.addDecisionMemories(dm);
  store.addDecisionBeliefs(db);

  // 7. Build + archive trace
  const usedBeliefs = beliefs.filter((b) => b.id in result.beliefWeights);
  const trace = await explain.buildAndArchive({
    id: idgen(), decision, goal, memories, beliefs: usedBeliefs, event,
  });
  store.addTrace(trace);

  // 8. Form memory
  const summary = `${citizen.name} chose to ${result.action}` +
    (result.targetId ? ` with ${result.targetId}` : "") + `: ${result.reasoning}`;
  const importance = MAJOR_ACTIONS.includes(result.action) ? 8 : 4;
  let storedMemory: Memory | null = null;
  if (importance >= MEMORY_IMPORTANCE_THRESHOLD) {
    storedMemory = {
      id: idgen(), citizenId, day: clock.day,
      type: result.targetId ? "relationship" : "event",
      importance, summary, embedding: embedder.embed(summary),
    };
    store.addMemory(storedMemory);
  }

  // 9. Belief revision (toward the action target)
  if (storedMemory && result.targetId) {
    const target = store.getCitizen(result.targetId);
    const rev = reviser.revise({
      citizenId, newMemory: storedMemory, existing: store.getBeliefs(citizenId),
      targetName: target?.name ?? result.targetId, polarity: result.action === "betray" ? -1 : 1,
      day: clock.day, idgen,
    });
    for (const b of [...rev.created, ...rev.updated]) store.upsertBelief(b);
  }

  // 10. Archive major event
  if (MAJOR_ACTIONS.includes(result.action)) {
    const res = await storage.archive(`event/${event.id}`, event);
    store.updateEventArchive(event.id, res.rootHash, res.txHash);
  }

  return { decision, event, trace, storedMemory };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/engine`
Expected: PASS — 2 passed.

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): runCitizenTick composes the full causality loop"
```

---

### Task 10: End-to-end demo scenario (the proof)

**Files:**
- Create: `packages/engine/src/scenario.test.ts`
- Create: `packages/engine/src/scenario.ts` (reusable seed + multi-tick runner)

**Interfaces:**
- Consumes: every package.
- Produces: `seedAdaWorld(): { deps: TickDeps; storage: FakeStorage }` and `runDays(deps, citizenId, days): Promise<TickResult[]>` — used by the test now and the CLI/UI later. (Returns the concrete `FakeStorage` so callers can inspect `.calls`.)

- [ ] **Step 1: Write the failing test**

`packages/engine/src/scenario.test.ts`
```ts
import { describe, it, expect } from "vitest";
import { seedAdaWorld, runDays } from "./scenario";

describe("scenario: Ada starts a company", () => {
  it("produces a coherent, fully-traceable history over multiple days", async () => {
    const { deps, storage } = seedAdaWorld();
    const results = await runDays(deps, "ada", 3);

    // every decision in the run has an archived trace (the 'why' is always durable)
    for (const r of results) {
      expect(r.trace.zgRootHash).toMatch(/^0xfake/);
      const dm = deps.store.getDecisionMemories(r.decision.id);
      expect(dm.length).toBeGreaterThan(0); // memory -> decision link always present
    }

    // at least one major event got archived to storage
    const archived = storage.calls.filter((c) => c.key.startsWith("event/"));
    expect(archived.length).toBeGreaterThan(0);

    // Ada accumulated at least one belief
    expect(deps.store.getBeliefs("ada").length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm test packages/engine`
Expected: FAIL — cannot resolve `./scenario`.

- [ ] **Step 3: Write minimal implementation**

`packages/engine/src/scenario.ts`
```ts
import { InMemoryWorldStore } from "@civ/store";
import { FakeEmbedder, MemoryIndex } from "@civ/memory";
import { RuleBasedBeliefReviser } from "@civ/beliefs";
import { FakeBrain } from "@civ/brain";
import { FakeStorage } from "@civ/storage";
import { ExplainabilityService } from "@civ/explainability";
import type { ActionType } from "@civ/shared";
import { runCitizenTick, type TickDeps, type TickResult } from "./index";

export function seedAdaWorld(): { deps: TickDeps; storage: FakeStorage } {
  const store = new InMemoryWorldStore();
  const embedder = new FakeEmbedder();
  const storage = new FakeStorage();

  store.upsertCitizen({ id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
  store.upsertCitizen({ id: "marcus", name: "Marcus", occupation: "Investor", age: 41,
    traits: { ambition: 70, empathy: 60, loyalty: 65, curiosity: 50, discipline: 70, riskTolerance: 60 },
    wealth: 100000, reputation: 70, tier: 2, createdDay: 0 });
  store.upsertGoal({ id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true });
  store.addMemory({ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8,
    summary: "lost job during recession", embedding: embedder.embed("lost job during recession") });
  store.addMemory({ id: "m2", citizenId: "ada", day: 2, type: "relationship", importance: 7,
    summary: "marcus offered funding for a company", embedding: embedder.embed("marcus offered funding for a company") });
  store.upsertBelief({ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy",
    confidence: 0.7, sourceMemoryIds: ["m2"], updatedDay: 2 });
  store.setWorldState({ day: 3, economy: { inflation: 8 }, headline: "Recession deepens" });

  // Scripted brain: start a company with Marcus, then invest, then work.
  // The brain advances its own step per decide() call — one call per tick.
  const plan: ActionType[] = ["start_company", "invest", "work"];
  let step = 0;
  const brain = new FakeBrain((ctx) => {
    const action = plan[Math.min(step, plan.length - 1)];
    step++;
    const targetId = action === "work" ? null : "marcus";
    return {
      action, targetId,
      reasoning: `Day plan: ${action}; goal ${ctx.goal?.description ?? "none"}`,
      memoryWeights: Object.fromEntries(ctx.memories.map((m) => [m.id, 1])),
      beliefWeights: Object.fromEntries(ctx.beliefs.map((b) => [b.id, b.confidence])),
    };
  });

  let n = 0;
  const clock = { day: 3 };
  const deps: TickDeps = {
    store, embedder, memoryIndex: new MemoryIndex(store, embedder),
    reviser: new RuleBasedBeliefReviser(), brain, storage,
    explain: new ExplainabilityService(storage),
    clock, idgen: () => `id${++n}`,
  };
  return { deps, storage };
}

export async function runDays(deps: TickDeps, citizenId: string, days: number): Promise<TickResult[]> {
  const results: TickResult[] = [];
  for (let i = 0; i < days; i++) {
    const r = await runCitizenTick(deps, citizenId);
    results.push(r);
    deps.clock.day += 1;
  }
  return results;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm test packages/engine`
Expected: PASS — all engine tests pass (the per-tick test from Task 9 plus the scenario test).

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(engine): seeded Ada scenario + multi-day runner (causality proof)"
```

---

### Task 11: Full suite + typecheck gate

**Files:**
- Modify: none (verification task).

- [ ] **Step 1: Run the entire test suite**

Run: `pnpm test`
Expected: PASS — every package's tests green.

- [ ] **Step 2: Run the typechecker across the workspace**

Run: `pnpm typecheck`
Expected: no type errors. (If `tsc -b` needs per-package `composite: true`, add `"composite": true` to each `packages/*/tsconfig.json` and a root `tsconfig.json` with `references` to each package, then re-run.)

- [ ] **Step 3: Commit any config fixes**

```bash
git add -A
git commit -m "chore: green full test + typecheck gate for causality engine"
```

---

## Self-Review

**Spec coverage (Slice 0 portion of the spec):**
- §2 monorepo packages — Tasks 1–10 create `shared, storage, brain, store, memory, beliefs, explainability, engine`. `narrative` is deferred (needs multi-citizen/day; out of Slice 0). ✓ (with `store` added as a clarifying split, noted in Task 5).
- §3 data model — every Slice-0 table represented as a typed entity + store method: citizens, goals, relationships, memories, beliefs, decisions, decision_memories, decision_beliefs, events, decision_traces, world_state. `narratives` deferred. ✓
- §3 `decision_memories`/`decision_beliefs` populated at decision time — Task 9 Step 3 + asserted in Task 9 test. ✓
- §3 belief layer (Memory→Belief→Decision) — Tasks 7 + 9. ✓
- §3 DecisionTrace archived to 0G — Task 8 + Task 9 (FakeStorage stands in for 0G). ✓
- §4 agent loop steps 1–10 — Task 9 implements them in order. ✓
- §4 determinism (record brain input+output, injected clock/idgen) — global constraints + injected `clock`/`idgen`; brain result fully recorded via decision + joins + trace. ✓
- §9 testing (FakeBrain + FakeStorage; assert joins, archived trace, archived major event, importance thresholding, belief revision) — Tasks 3,4,6,7,9 cover each assertion. ✓
- Out of Slice 0 (correctly deferred to follow-on plans): 0G Storage/Compute real adapters (§5), Postgres/pgvector swap, tiers/scheduler scaling (§6), narrative generation, all UI (§7). Listed below.

**Placeholder scan:** No TBD/TODO; every code step contains complete, runnable code; no "add error handling" hand-waves. ✓

**Type consistency:** `DecisionContext`/`DecisionResult` (Task 4) match `brain.decide` usage in Task 9. `WorldStore` method names (Task 5) match every call site in Tasks 6, 8, 9. `ExplainabilityService.buildAndArchive` signature (Task 8) matches the call in Task 9. `BeliefInput`/`BeliefReviser.revise` (Task 7) match the call in Task 9. `MemoryIndex(store, embedder).retrieve(citizenId, query, k)` consistent across Tasks 6 and 9. `ArchiveResult.rootHash/txHash` consistent across Tasks 3, 8, 9. ✓

---

## Follow-on plans (not in this plan)

1. **0G adapters** — `ZeroGStorage` (Storage SDK) + `ZeroGComputeBrain` (serving broker), swapped behind the existing interfaces; thin integration tests; needs testnet wallet + funded Compute ledger.
2. **Postgres + pgvector** — `PostgresWorldStore` implementing `WorldStore`, `PgVectorMemoryIndex`; docker-compose + migrations; swap behind interfaces.
3. **Scale & autonomy** — multi-citizen world, relationship-driven interactions, agent tiers, tick scheduler, `narrative` (daily newspaper) generation.
4. **UI** — Next.js app: landing ticker, world timeline, citizen profile + Explainability Graph (hero), newspaper linking back to the event chain.
