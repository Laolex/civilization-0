### Task 1: Scaffold the `@civ/history` package + types

**Files:**
- Create: `packages/history/package.json`
- Create: `packages/history/tsconfig.json`
- Create: `packages/history/src/types.ts`
- Create: `packages/history/src/index.ts`
- Test: `packages/history/src/types.test.ts`

**Interfaces:**
- Produces: all exported types/constants below — consumed by every later task.

- [ ] **Step 1: Write the package manifest**

`packages/history/package.json`:
```json
{
  "name": "@civ/history",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/index.ts",
  "scripts": { "build": "tsc -p tsconfig.json --noEmit" },
  "dependencies": {
    "@civ/shared": "workspace:*",
    "@civ/engine": "workspace:*",
    "@civ/storage": "workspace:*",
    "@civ/zerog": "workspace:*",
    "pg": "^8.13.1"
  },
  "devDependencies": { "@types/pg": "^8.11.10" }
}
```

- [ ] **Step 2: Write the tsconfig**

`packages/history/tsconfig.json` (mirror a sibling package, e.g. `packages/persistence/tsconfig.json` — copy its exact `extends`/`compilerOptions`; if unsure run `cat packages/persistence/tsconfig.json` and replicate):
```json
{
  "extends": "../../tsconfig.base.json",
  "compilerOptions": { "outDir": "dist", "rootDir": "src" },
  "include": ["src", "scripts"]
}
```

**Also register the package in the workspace path map** (every other `@civ/*` package is listed there; bare `@civ/history` imports and `tsc --noEmit` typecheck depend on it). In root `tsconfig.base.json`, add to `compilerOptions.paths`, alongside the existing entries:
```json
      "@civ/history": ["packages/history/src"],
```

- [ ] **Step 3: Write `types.ts`**

`packages/history/src/types.ts`:
```ts
import type { SocialDriver } from "@civ/shared";

/**
 * THE FOUR PROVENANCE INVARIANTS (binding — these are the spec):
 *  #1 Authenticated cognition only. Never reconstruct/infer/estimate/fabricate cognition.
 *     Unknown cognition stays null and renders "unavailable", never a fabricated value.
 *  #2 Mutation <=> history (bidirectional). Every committed world mutation has a corresponding
 *     CognitiveTransition and vice versa, written in the SAME db transaction. No orphans.
 *  #3 Append-only. No event modified/deleted/reordered/recomputed. Corrections are new events.
 *  #4 Schema permanence. Events are read under the schemaVersion recorded at emission;
 *     readers dispatch on schemaVersion, never silently re-read under a later schema.
 */
export const SCHEMA_VERSION = 1 as const;
export const CANON_VERSION = "jcs-1" as const;
export const GENESIS_PARENT = "0x" + "0".repeat(64);

export type EventId = string;
export type Hash = string; // hex sha-256

export interface EventHeader {
  eventId: EventId;
  parentHash: Hash;          // prior event in this world's chain (chronology)
  causalParents?: EventId[]; // causality — present, unused in 1A
  worldId: string;
  tickId: number;            // = day in current engine
  engineVersion: string;
  schemaVersion: number;
  timestamp: string;         // ISO
}

export interface Observation {
  query: string;
  worldHeadline?: string;
  observedEntities?: string[];
  observationHash?: string;
}

export interface ExecutionContext {
  provider: string;
  modelId: string;
  modelVersion: string;
  promptHash: string;
  worldHash: string;
  runtimeHash?: string;
  temperature?: number;
  seed?: number;
  verified: boolean;
}

export interface WorldDelta {
  relationshipsChanged: { a: string; b: string; field: string; from: number; to: number }[];
  wealthTransferred: { actor: string; delta: number }[];
  eventsCreated: { id: string; type: string; targetId: string | null }[];
}

export interface WeightedMemory { id: string; weight: number; summary?: string }
export interface WeightedBelief { id: string; weight: number; statement?: string }

// 1A: always null (Invariant #1). Shapes pinned now so the schema is stable.
export interface CandidateEvaluation { action: string; utility?: number; confidence?: number; rationale?: string }
export interface BeliefDelta { beliefId: string; before: number; after: number; justification?: string }

export interface CognitiveTransition {
  header: EventHeader;
  actor: string;
  observation: Observation;
  retrievedMemories: WeightedMemory[];
  retrievedBeliefs: WeightedBelief[];
  socialDrivers: SocialDriver[];
  availableActions: string[];
  selectedAction: string;
  reasoning: string;
  worldDelta: WorldDelta | null;
  execution: ExecutionContext;
  candidates: CandidateEvaluation[] | null; // null in 1A
  beliefDelta: BeliefDelta | null;          // null in 1A
}

export interface AnchorEvent {
  header: EventHeader;
  merkleRoot: Hash;
  coveredEventIds: EventId[];
  zgRootHash: string | null;
  zgTxHash: string | null;
}

export type HistoryEvent = CognitiveTransition | AnchorEvent;
export type EventKind = "CognitiveTransition" | "Anchor";

export function eventKind(e: HistoryEvent): EventKind {
  return "merkleRoot" in e ? "Anchor" : "CognitiveTransition";
}

/** fold() output: minimal derived world state for 1A — latest authenticated transition per (world,tick,actor). */
export interface WorldState {
  latest: Map<string, CognitiveTransition>; // key = `${worldId}:${tickId}:${actor}`
}

/** What `civ explain` and the optional web view render. Null cognition -> "unavailable" (Invariant #1). */
export interface ExplainView {
  world: string;
  citizen: string;
  tick: number;
  observation: Observation;
  retrievedMemories: WeightedMemory[];
  retrievedBeliefs: WeightedBelief[];
  socialDrivers: SocialDriver[];
  availableActions: string[];
  selectedAction: string;
  reasoning: string;
  worldDelta: WorldDelta | null;
  execution: ExecutionContext;
  candidates: CandidateEvaluation[] | "unavailable";
  beliefDelta: BeliefDelta | "unavailable";
  eventHash: Hash;
  parentHash: Hash;
  chainVerified: boolean;
  anchor: { merkleRoot: Hash; zgRootHash: string | null; zgTxHash: string | null } | null;
}
```

- [ ] **Step 4: Write the barrel**

`packages/history/src/index.ts`:
```ts
export * from "./types";
```

- [ ] **Step 5: Write the failing test**

`packages/history/src/types.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { SCHEMA_VERSION, CANON_VERSION, GENESIS_PARENT, eventKind } from "./index";
import type { CognitiveTransition, AnchorEvent } from "./index";

describe("history types", () => {
  it("pins schema + canon versions and genesis parent", () => {
    expect(SCHEMA_VERSION).toBe(1);
    expect(CANON_VERSION).toBe("jcs-1");
    expect(GENESIS_PARENT).toBe("0x" + "0".repeat(64));
  });

  it("discriminates event kinds", () => {
    const anchor = { merkleRoot: "0xab" } as AnchorEvent;
    const ct = { actor: "1" } as CognitiveTransition;
    expect(eventKind(anchor)).toBe("Anchor");
    expect(eventKind(ct)).toBe("CognitiveTransition");
  });
});
```

- [ ] **Step 6: Install + run the test to verify it passes**

Run: `pnpm install && pnpm vitest run packages/history/src/types.test.ts`
Expected: PASS (2 tests). If `@civ/history` does not resolve, re-run `pnpm install` so the workspace links the new package.

- [ ] **Step 7: Commit**

```bash
git add packages/history pnpm-lock.yaml
git -c user.name="laolex" -c user.email="shelfcron-co@outlook.com" commit -m "feat(history): scaffold @civ/history package + Phase 1A event types"
```

---

## Track B — Canonical hash & chain (no DB)

**Acceptance:** `eventHash` is deterministic and key-order-independent; a per-event chain re-walk detects any tamper; `merkleRoot` is deterministic.
**Rollback:** revert `hash.ts`; no DB or engine touched.
**Invariants exercised:** #3 (append-only tamper-evidence), canonicalization constraint.

