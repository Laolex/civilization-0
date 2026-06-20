# Slice 3 — World History Explorer + 0G-visible everywhere — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the persistent world's history searchable and its 0G provenance visible on every surface — a `searchEvents` projection, a `/history` Explorer screen, "0G Compute ✓ / 0G Storage ✓" badges everywhere, a deterministic citizen life-story, and a one-time LIVE 0G-narrated life story as the slice's proof point.

**Architecture:** Extend the existing **pg-light read path** (`packages/persistence/src/read.ts`, imports ONLY `pg`) with `searchEvents` + `readNarrative` so keyless Next server components can deep-import them without dragging the engine/store graph into the bundle. A new `narratives` table holds 0G-narrated text (FK-free, like `events`). The life-story narration reuses the **already-proven raw verified chat path** (`RealChat.create(config)` → `chat.complete(messages)` → `{content, verified}`) + `createZeroGStorage` archive, mirroring the Slice 2 live proof. Engine (`packages/engine`) and WorldStore (`packages/store`) stay **byte-for-byte unchanged**.

**Tech Stack:** pnpm 9.15.4 / Node 20, TypeScript ESM monorepo, Vitest (unit `*.test.ts` + integration `*.itest.ts` via `vitest.integration.config.ts`), Postgres 16 + pgvector, Next.js 14.2.5 App Router, real 0G (testnet chainId 16602).

## Global Constraints

- **Engine + WorldStore UNCHANGED:** `git diff --stat <base>..HEAD -- packages/engine packages/store` must be EMPTY at every task. Never edit `packages/engine/src` or `packages/store/src`.
- **pg-light `read.ts`:** `packages/persistence/src/read.ts` imports ONLY `pg` (`import type { Pool } from "pg"`). NO `@civ/*` imports. Define all view interfaces inline. Verify with `grep -nE "^\s*import" packages/persistence/src/read.ts` → only `pg`.
- **Keyless web:** Next pages/components hold NO `ZG_PRIVATE_KEY` and NO 0G write path. They read Postgres (pg-light) only. Deep-import `@civ/persistence/src/{pool,read}` — never the engine/store/memory/brain/scheduler packages.
- **Secrets:** NEVER print, echo, log, or commit `ZG_PRIVATE_KEY` or `.env`. Live scripts log wallet ADDRESS + balances + root hashes only. Throwaway testnet wallet `0xB44c6D45c352B8313067945c30479E26a21c78bc` (key in gitignored `/opt/civilization-0/.env`).
- **Tests:** unit `*.test.ts` are network-free. DB tests are `*.itest.ts`, run ONLY via `cd /opt/civilization-0 && pnpm test:it [path]` (loads `.env` DATABASE_URL via dotenv-cli). NEVER `pnpm dlx`. Integration itests use the FK-safe `resetWorld()` helper in `beforeAll`.
- **Compute scripts:** run with `tsx --conditions require` (compute SDK 0.8.4 ESM build is broken). Live 0G runs spend OG — controller-only, cost-gated.
- **Commits:** NO `Co-Authored-By` trailer. Commit only the files a task touches.
- **Shell:** the dev shell resets cwd between bash calls — always prefix `cd /opt/civilization-0 && `.
- **DB:** `DATABASE_URL=postgres://civ:civ-local@127.0.0.1:5432/civ0` (gitignored .env). Must NOT disturb other DBs (polymarket_agent, meteora_agent, arc_payouts*).

---

## File Structure

- `packages/persistence/src/schema.sql` — **modify:** add `narratives` table + index.
- `packages/persistence/src/testutil.ts` — **modify:** add `"narratives"` to `WORLD_TABLES`.
- `packages/persistence/src/read.ts` — **modify:** add `HistoricalEvent`, `searchEvents`, `NarrativeView`, `readNarrative`; extend `WorldView.recentEvents` with optional `rootHash`.
- `packages/persistence/src/narrative-repository.ts` — **create:** `NarrativeRepository.saveNarrative` (write path; imports `pg` + `@civ/shared` types OK — it is NOT deep-imported by web).
- `packages/persistence/src/index.ts` — **modify:** barrel re-export `narrative-repository`.
- `apps/web/components/ZeroGBadges.tsx` — **create:** badge component.
- `apps/web/app/globals.css` — **modify:** add `.zg-badge*` classes.
- `apps/web/app/history/page.tsx` — **create:** History Explorer (search + filters + per-citizen life story).
- `apps/web/app/world/page.tsx` — **modify:** render `<ZeroGBadges>` on events; nav link to `/history`.
- `apps/web/app/orgs/[id]/page.tsx` — **modify:** render `<ZeroGBadges>` on decisions.
- `apps/web/lib/dashboard.ts` — **modify:** add optional `rootHash` to `WorldView.recentEvents`.
- `apps/web/lib/lifestory.ts` — **create:** deterministic `buildLifeStory(citizen, events)` + unit tests.
- `packages/scheduler/scripts/run-life-story.ts` — **create:** LIVE 0G narration runnable (controller-run).

---

### Task 1: `narratives` table + reset helper

**Files:**
- Modify: `packages/persistence/src/schema.sql` (append)
- Modify: `packages/persistence/src/testutil.ts` (WORLD_TABLES)
- Test: `packages/persistence/src/narrative-schema.itest.ts`

**Interfaces:**
- Produces: `narratives` table `(id TEXT PK, subject_id TEXT, kind TEXT, day INT, text TEXT, zg_root_hash TEXT, zg_tx_hash TEXT, created_day INT)` + `narratives_subject_idx`. `subject_id` is NOT FK-constrained (mirrors `events.actor_id` — holds a citizen OR org id).

- [ ] **Step 1: Write the failing test** — `packages/persistence/src/narrative-schema.itest.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";

beforeAll(async () => { await migrate(); await resetWorld(); });
afterAll(async () => { await closePool(); });

describe("narratives table", () => {
  it("accepts a narrative row with 0G provenance and reads it back", async () => {
    await getPool().query(
      `INSERT INTO narratives (id, subject_id, kind, day, text, zg_root_hash, zg_tx_hash, created_day)
       VALUES ('n1', 'ada', 'life_story', 12, 'Ada built things.', '0xroot', '0xtx', 12)`);
    const r = await getPool().query("SELECT subject_id, kind, text, zg_root_hash FROM narratives WHERE id = 'n1'");
    expect(r.rows[0]).toMatchObject({ subject_id: "ada", kind: "life_story", text: "Ada built things.", zg_root_hash: "0xroot" });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`relation "narratives" does not exist`)

Run: `cd /opt/civilization-0 && pnpm test:it packages/persistence/src/narrative-schema.itest.ts`
Expected: FAIL.

- [ ] **Step 3: Append the table to `packages/persistence/src/schema.sql`** (after the `memberships` block)

```sql
CREATE TABLE IF NOT EXISTS narratives (
  id TEXT PRIMARY KEY, subject_id TEXT NOT NULL, kind TEXT NOT NULL,
  day INT NOT NULL, text TEXT NOT NULL,
  zg_root_hash TEXT, zg_tx_hash TEXT, created_day INT NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS narratives_subject_idx ON narratives (subject_id);
```

- [ ] **Step 4: Add `"narratives"` to `WORLD_TABLES` in `packages/persistence/src/testutil.ts`**

Open the file; find the `WORLD_TABLES` array; add `"narratives"` as the FIRST element (it has no children, truncation order is not critical, but keep it before `organizations`). Example: `const WORLD_TABLES = ["narratives", "memberships", "organizations", ...rest];`

- [ ] **Step 5: Run it — expect PASS**

Run: `cd /opt/civilization-0 && pnpm test:it packages/persistence/src/narrative-schema.itest.ts`
Expected: PASS.

- [ ] **Step 6: Gates + commit**

Run: `cd /opt/civilization-0 && pnpm test && pnpm typecheck && git diff --stat <base>..HEAD -- packages/engine packages/store`
Expected: unit green, typecheck clean, engine/store diff empty.
```bash
cd /opt/civilization-0 && git add packages/persistence/src/schema.sql packages/persistence/src/testutil.ts packages/persistence/src/narrative-schema.itest.ts
git commit -m "feat(persistence): narratives table + reset helper"
```

---

### Task 2: `searchEvents` + `HistoricalEvent` (pg-light)

**Files:**
- Modify: `packages/persistence/src/read.ts` (append; extend `WorldView`)
- Test: `packages/persistence/src/read-history.itest.ts`

**Interfaces:**
- Consumes: `Pool` from `pg`; tables `events`, `traces`.
- Produces:
  ```ts
  export interface HistoricalEvent {
    id: string; day: number; type: string; actorId: string; targetId: string | null;
    reasoning: string | null; rootHash: string | null;
  }
  export interface SearchFilters { actorId?: string; type?: string; limit?: number; }
  export async function searchEvents(pool: Pool, filters: SearchFilters): Promise<HistoricalEvent[]>;
  export async function listEventTypes(pool: Pool): Promise<string[]>;
  ```
  `searchEvents` matches `actor_id = actorId OR target_id = actorId` when `actorId` set; `type = type` when set; default `limit` 50; ordered `day DESC, id DESC`. `reasoning` from `events.payload->>'reasoning'` (org ticks) else from the joined trace's `trace->>'reasoning'`. `rootHash` from `events.zg_root_hash` else joined `traces.zg_root_hash`.

- [ ] **Step 1: Write the failing test** — `packages/persistence/src/read-history.itest.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";
import { searchEvents, listEventTypes } from "./read";

beforeAll(async () => {
  await migrate();
  await resetWorld();
  // citizen-authored event with a trace carrying reasoning + root hash
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits) VALUES ('ada','Ada','Engineer',30,'{}')`);
  await getPool().query(`INSERT INTO decisions (id,citizen_id,goal_id,day,reasoning,action,target_id,brain_provider,brain_model)
    VALUES ('d1','ada',null,2,'I will build','work',null,'p','m')`);
  await getPool().query(`INSERT INTO events (id,day,type,actor_id,target_id,decision_id,payload)
    VALUES ('e1',2,'work','ada',null,'d1','{}')`);
  await getPool().query(`INSERT INTO traces (id,decision_id,trace,zg_root_hash)
    VALUES ('t1','d1','{"reasoning":"I will build"}','0xaaa')`);
  // org event with reasoning + root in payload/trace
  await getPool().query(`INSERT INTO events (id,day,type,actor_id,target_id,decision_id,payload,zg_root_hash)
    VALUES ('e2',3,'invest','ada-collective','ada','d2','{"orgTick":true,"reasoning":"grow"}','0xbbb')`);
});
afterAll(async () => { await closePool(); });

describe("searchEvents", () => {
  it("finds events where the citizen is actor or target, newest first, with 0G provenance", async () => {
    const rows = await searchEvents(getPool(), { actorId: "ada" });
    expect(rows.map((r) => r.id)).toEqual(["e2", "e1"]); // e2 day3 (target=ada), e1 day2 (actor=ada)
    expect(rows[1]).toMatchObject({ id: "e1", reasoning: "I will build", rootHash: "0xaaa" });
    expect(rows[0]).toMatchObject({ id: "e2", reasoning: "grow", rootHash: "0xbbb" });
  });
  it("filters by type", async () => {
    const rows = await searchEvents(getPool(), { type: "invest" });
    expect(rows.map((r) => r.id)).toEqual(["e2"]);
  });
  it("listEventTypes returns distinct types", async () => {
    const types = await listEventTypes(getPool());
    expect(types).toContain("work"); expect(types).toContain("invest");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`searchEvents is not a function`)

Run: `cd /opt/civilization-0 && pnpm test:it packages/persistence/src/read-history.itest.ts`
Expected: FAIL.

- [ ] **Step 3: Append to `packages/persistence/src/read.ts`**

```ts
export interface HistoricalEvent {
  id: string; day: number; type: string; actorId: string; targetId: string | null;
  reasoning: string | null; rootHash: string | null;
}
export interface SearchFilters { actorId?: string; type?: string; limit?: number; }

export async function searchEvents(pool: Pool, filters: SearchFilters): Promise<HistoricalEvent[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.actorId) { params.push(filters.actorId); where.push(`(e.actor_id = $${params.length} OR e.target_id = $${params.length})`); }
  if (filters.type) { params.push(filters.type); where.push(`e.type = $${params.length}`); }
  params.push(filters.limit ?? 50);
  const limitIdx = params.length;
  const sql = `SELECT e.id, e.day, e.type, e.actor_id, e.target_id, e.zg_root_hash AS event_root,
      e.payload, t.zg_root_hash AS trace_root, t.trace
    FROM events e LEFT JOIN traces t ON t.decision_id = e.decision_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY e.day DESC, e.id DESC LIMIT $${limitIdx}`;
  const r = await pool.query(sql, params);
  return r.rows.map((x) => ({
    id: x.id, day: x.day, type: x.type, actorId: x.actor_id, targetId: x.target_id ?? null,
    reasoning: (x.payload?.reasoning as string) ?? (x.trace?.reasoning as string) ?? null,
    rootHash: x.event_root ?? x.trace_root ?? null,
  }));
}

export async function listEventTypes(pool: Pool): Promise<string[]> {
  const r = await pool.query("SELECT DISTINCT type FROM events ORDER BY type");
  return r.rows.map((x) => x.type as string);
}
```

- [ ] **Step 4: Run it — expect PASS (all 3)**

Run: `cd /opt/civilization-0 && pnpm test:it packages/persistence/src/read-history.itest.ts`
Expected: PASS.

- [ ] **Step 5: Confirm pg-light + gates**

Run: `cd /opt/civilization-0 && grep -nE "^\s*import" packages/persistence/src/read.ts && pnpm test && pnpm typecheck`
Expected: only `import type { Pool } from "pg"`; unit green; typecheck clean.

- [ ] **Step 6: Commit**

```bash
cd /opt/civilization-0 && git add packages/persistence/src/read.ts packages/persistence/src/read-history.itest.ts
git commit -m "feat(persistence): searchEvents history projection"
```

---

### Task 3: narrative read + write repo

**Files:**
- Modify: `packages/persistence/src/read.ts` (append `NarrativeView` + `readNarrative`)
- Create: `packages/persistence/src/narrative-repository.ts`
- Modify: `packages/persistence/src/index.ts` (barrel)
- Test: `packages/persistence/src/narrative-repository.itest.ts`

**Interfaces:**
- Produces (read.ts, pg-light):
  ```ts
  export interface NarrativeView { id: string; subjectId: string; kind: string; day: number; text: string; rootHash: string | null; }
  export async function readNarrative(pool: Pool, subjectId: string, kind: string): Promise<NarrativeView | null>;
  ```
  Returns the NEWEST narrative for `(subjectId, kind)` by `day DESC, id DESC`, or null.
- Produces (narrative-repository.ts, write path):
  ```ts
  export interface NarrativeRecord { id: string; subjectId: string; kind: string; day: number; text: string; rootHash?: string; txHash?: string; }
  export class NarrativeRepository { saveNarrative(rec: NarrativeRecord): Promise<void>; }
  ```
  `saveNarrative` upserts on `id` (`ON CONFLICT (id) DO UPDATE`), sets `created_day = day`.

- [ ] **Step 1: Write the failing test** — `packages/persistence/src/narrative-repository.itest.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";
import { NarrativeRepository } from "./narrative-repository";
import { readNarrative } from "./read";

const repo = new NarrativeRepository();
beforeAll(async () => { await migrate(); await resetWorld(); });
afterAll(async () => { await closePool(); });

describe("NarrativeRepository + readNarrative", () => {
  it("saves a narrative and reads back the newest", async () => {
    await repo.saveNarrative({ id: "n1", subjectId: "ada", kind: "life_story", day: 5, text: "Old.", rootHash: "0x1" });
    await repo.saveNarrative({ id: "n2", subjectId: "ada", kind: "life_story", day: 12, text: "Newest.", rootHash: "0x2", txHash: "0xtx" });
    const v = await readNarrative(getPool(), "ada", "life_story");
    expect(v).toMatchObject({ id: "n2", text: "Newest.", rootHash: "0x2", day: 12 });
  });
  it("returns null when none exist", async () => {
    expect(await readNarrative(getPool(), "nobody", "life_story")).toBeNull();
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`Cannot find module './narrative-repository'`)

Run: `cd /opt/civilization-0 && pnpm test:it packages/persistence/src/narrative-repository.itest.ts`
Expected: FAIL.

- [ ] **Step 3a: Create `packages/persistence/src/narrative-repository.ts`**

```ts
import { getPool } from "./pool";

export interface NarrativeRecord {
  id: string; subjectId: string; kind: string; day: number; text: string;
  rootHash?: string; txHash?: string;
}

export class NarrativeRepository {
  async saveNarrative(rec: NarrativeRecord): Promise<void> {
    await getPool().query(
      `INSERT INTO narratives (id, subject_id, kind, day, text, zg_root_hash, zg_tx_hash, created_day)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$4)
       ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, day = EXCLUDED.day,
         zg_root_hash = EXCLUDED.zg_root_hash, zg_tx_hash = EXCLUDED.zg_tx_hash`,
      [rec.id, rec.subjectId, rec.kind, rec.day, rec.text, rec.rootHash ?? null, rec.txHash ?? null]);
  }
}
```

- [ ] **Step 3b: Append to `packages/persistence/src/read.ts`** (pg-light)

```ts
export interface NarrativeView { id: string; subjectId: string; kind: string; day: number; text: string; rootHash: string | null; }

export async function readNarrative(pool: Pool, subjectId: string, kind: string): Promise<NarrativeView | null> {
  const r = await pool.query(
    `SELECT id, subject_id, kind, day, text, zg_root_hash FROM narratives
     WHERE subject_id = $1 AND kind = $2 ORDER BY day DESC, id DESC LIMIT 1`, [subjectId, kind]);
  const x = r.rows[0];
  if (!x) return null;
  return { id: x.id, subjectId: x.subject_id, kind: x.kind, day: x.day, text: x.text, rootHash: x.zg_root_hash ?? null };
}
```

- [ ] **Step 3c: Add to `packages/persistence/src/index.ts`**

Add line: `export * from "./narrative-repository";`

- [ ] **Step 4: Run it — expect PASS**

Run: `cd /opt/civilization-0 && pnpm test:it packages/persistence/src/narrative-repository.itest.ts`
Expected: PASS (both).

- [ ] **Step 5: Confirm read.ts still pg-light + gates**

Run: `cd /opt/civilization-0 && grep -nE "^\s*import" packages/persistence/src/read.ts && pnpm test && pnpm typecheck`
Expected: read.ts only imports `pg`; unit green; typecheck clean. (narrative-repository.ts importing `./pool` is fine — it is NOT deep-imported by web.)

- [ ] **Step 6: Commit**

```bash
cd /opt/civilization-0 && git add packages/persistence/src/narrative-repository.ts packages/persistence/src/read.ts packages/persistence/src/index.ts packages/persistence/src/narrative-repository.itest.ts
git commit -m "feat(persistence): narrative read + write repo"
```

---

### Task 4: `<ZeroGBadges>` component

**Files:**
- Create: `apps/web/components/ZeroGBadges.tsx`
- Create: `apps/web/components/ZeroGBadges.test.tsx`
- Modify: `apps/web/app/globals.css` (append `.zg-badge*`)

**Interfaces:**
- Produces:
  ```tsx
  export function ZeroGBadges(props: { rootHash?: string | null; verified?: boolean }): JSX.Element
  ```
  Renders "0G Storage ✓" linking to `/verify/<rootHash>` when `rootHash` is set; renders "0G Compute ✓" when `verified` is true OR `rootHash` is set (a stored trace implies it was reasoned on 0G). Renders nothing (empty fragment) when no `rootHash` and not `verified`.

- [ ] **Step 1: Write the failing test** — `apps/web/components/ZeroGBadges.test.tsx`

```tsx
// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ZeroGBadges } from "./ZeroGBadges";

describe("ZeroGBadges", () => {
  it("shows both badges and a verify link when a root hash is present", () => {
    render(<ZeroGBadges rootHash="0xabc" verified />);
    expect(screen.getByText(/0G Compute/)).toBeTruthy();
    const storage = screen.getByText(/0G Storage/).closest("a");
    expect(storage?.getAttribute("href")).toBe("/verify/0xabc");
  });
  it("renders nothing when no provenance", () => {
    const { container } = render(<ZeroGBadges rootHash={null} verified={false} />);
    expect(container.textContent).toBe("");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd /opt/civilization-0 && pnpm -C apps/web test ZeroGBadges`
Expected: FAIL (module not found).

- [ ] **Step 3: Create `apps/web/components/ZeroGBadges.tsx`**

```tsx
import React from "react";
import Link from "next/link";

export function ZeroGBadges({ rootHash, verified }: { rootHash?: string | null; verified?: boolean }) {
  const showCompute = verified || !!rootHash;
  if (!showCompute && !rootHash) return <></>;
  return (
    <span className="zg-badges">
      {showCompute && <span className="zg-badge zg-badge-compute mono">0G Compute ✓</span>}
      {rootHash && (
        <Link href={`/verify/${rootHash}`} className="zg-badge zg-badge-storage mono">0G Storage ✓</Link>
      )}
    </span>
  );
}
```

- [ ] **Step 4: Append CSS to `apps/web/app/globals.css`**

```css
.zg-badges { display: inline-flex; gap: 6px; align-items: center; }
.zg-badge { font-size: 11px; padding: 2px 7px; border-radius: 4px; border: 1px solid #2b3a5c; color: #9db4e8; text-decoration: none; }
.zg-badge-storage:hover { border-color: #4f7ef8; color: #4f7ef8; }
```

- [ ] **Step 5: Run it — expect PASS**

Run: `cd /opt/civilization-0 && pnpm -C apps/web test ZeroGBadges`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
cd /opt/civilization-0 && git add apps/web/components/ZeroGBadges.tsx apps/web/components/ZeroGBadges.test.tsx apps/web/app/globals.css
git commit -m "feat(web): ZeroGBadges provenance component"
```

---

### Task 5: deterministic life-story lib

**Files:**
- Create: `apps/web/lib/lifestory.ts`
- Create: `apps/web/lib/lifestory.test.ts`

**Interfaces:**
- Consumes: `HistoricalEvent` shape (id/day/type/actorId/targetId/reasoning/rootHash) — define a minimal local input type to avoid importing persistence into a unit-tested lib.
- Produces:
  ```ts
  export interface LifeEvent { day: number; type: string; targetId: string | null; reasoning: string | null; }
  export interface LifeStoryInput { name: string; occupation: string; events: LifeEvent[]; }
  export function buildLifeStory(input: LifeStoryInput): string[];
  ```
  Returns an ordered list of prose sentences (oldest→newest): an opening line (`<Name>, a <occupation>, …`), one line per event (`On day N, <name> chose to <type> [<targetId>] — "<reasoning>".`), and a closing line noting how many actions are on the permanent 0G record. Deterministic, pure, no I/O.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/lifestory.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { buildLifeStory } from "./lifestory";

describe("buildLifeStory", () => {
  const input = { name: "Ada", occupation: "Engineer", events: [
    { day: 1, type: "work", targetId: null, reasoning: "build the foundation" },
    { day: 3, type: "invest", targetId: "marcus", reasoning: "back a partner" },
  ]};
  it("opens with name + occupation and renders events oldest-first", () => {
    const s = buildLifeStory(input);
    expect(s[0]).toContain("Ada"); expect(s[0]).toContain("Engineer");
    expect(s[1]).toContain("day 1"); expect(s[1]).toContain("work");
    expect(s[2]).toContain("day 3"); expect(s[2]).toContain("marcus");
  });
  it("handles a citizen with no events", () => {
    const s = buildLifeStory({ name: "Bo", occupation: "Farmer", events: [] });
    expect(s.length).toBeGreaterThanOrEqual(1);
    expect(s[0]).toContain("Bo");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL**

Run: `cd /opt/civilization-0 && pnpm -C apps/web test lifestory`
Expected: FAIL.

- [ ] **Step 3: Create `apps/web/lib/lifestory.ts`**

```ts
export interface LifeEvent { day: number; type: string; targetId: string | null; reasoning: string | null; }
export interface LifeStoryInput { name: string; occupation: string; events: LifeEvent[]; }

export function buildLifeStory(input: LifeStoryInput): string[] {
  const lines: string[] = [];
  lines.push(`${input.name}, a ${input.occupation}, lives a recorded life on the persistent world.`);
  const ordered = [...input.events].sort((a, b) => a.day - b.day);
  for (const e of ordered) {
    const target = e.targetId ? ` ${e.targetId}` : "";
    const why = e.reasoning ? ` — "${e.reasoning}".` : ".";
    lines.push(`On day ${e.day}, ${input.name} chose to ${e.type}${target}${why}`);
  }
  const n = ordered.length;
  lines.push(n === 0
    ? `${input.name} has yet to act — but every future decision will be reasoned on 0G and kept on the permanent record.`
    : `${n} ${n === 1 ? "decision is" : "decisions are"} on the permanent 0G record, each reasoned and verifiable.`);
  return lines;
}
```

- [ ] **Step 4: Run it — expect PASS**

Run: `cd /opt/civilization-0 && pnpm -C apps/web test lifestory`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd /opt/civilization-0 && git add apps/web/lib/lifestory.ts apps/web/lib/lifestory.test.ts
git commit -m "feat(web): deterministic life-story generator"
```

---

### Task 6: `/history` Explorer page

**Files:**
- Create: `apps/web/app/history/page.tsx`
- Modify: `apps/web/app/world/page.tsx` (add a `/history` nav link in the main footer)

**Interfaces:**
- Consumes: `getPool` from `@civ/persistence/src/pool`; `searchEvents`, `listEventTypes`, `readNarrative`, `type HistoricalEvent` from `@civ/persistence/src/read`; `buildLifeStory` from `../../lib/lifestory`; `ZeroGBadges` from `../../components/ZeroGBadges`.
- Keyless server component. `runtime="nodejs"`, `dynamic="force-dynamic"`. Reads `searchParams: { actor?: string; type?: string }`.

- [ ] **Step 1: Create `apps/web/app/history/page.tsx`**

```tsx
import React from "react";
import Link from "next/link";
import { getPool } from "@civ/persistence/src/pool";
import { searchEvents, listEventTypes, readNarrative, type HistoricalEvent } from "@civ/persistence/src/read";
import { buildLifeStory } from "../../lib/lifestory";
import { ZeroGBadges } from "../../components/ZeroGBadges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function linkFor(id: string): string {
  // orgs are rendered under /orgs/<id>; everything else is a citizen.
  return id.includes("-collective") || id.includes("guild") ? `/orgs/${id}` : `/citizens/${id}`;
}

export default async function HistoryPage({ searchParams }: { searchParams: { actor?: string; type?: string } }) {
  const actor = searchParams.actor?.trim() || undefined;
  const type = searchParams.type?.trim() || undefined;

  let events: HistoricalEvent[] = [];
  let types: string[] = [];
  let error: string | null = null;
  try {
    [events, types] = await Promise.all([searchEvents(getPool(), { actorId: actor, type, limit: 100 }), listEventTypes(getPool())]);
  } catch (err) { error = err instanceof Error ? err.message : String(err); }

  // Per-citizen life story when a single actor is selected.
  let story: string[] | null = null;
  let narrative: Awaited<ReturnType<typeof readNarrative>> = null;
  if (actor && !error) {
    try {
      const c = await getPool().query("SELECT name, occupation FROM citizens WHERE id = $1", [actor]);
      if (c.rows[0]) {
        const lifeEvents = events.filter((e) => e.actorId === actor)
          .map((e) => ({ day: e.day, type: e.type, targetId: e.targetId, reasoning: e.reasoning }));
        story = buildLifeStory({ name: c.rows[0].name, occupation: c.rows[0].occupation, events: lifeEvents });
      }
      narrative = await readNarrative(getPool(), actor, "life_story");
    } catch { /* story is optional */ }
  }

  return (
    <main className="world-root">
      <p className="landing-eyebrow">History Explorer · civilization-0</p>
      <h1 className="world-h1">World History</h1>

      <form className="world-stat-row" method="get" action="/history" style={{ flexWrap: "wrap", gap: 12 }}>
        <input className="mono" name="actor" defaultValue={actor ?? ""} placeholder="citizen or org id (e.g. ada)"
          style={{ padding: "8px 10px", background: "#0d1424", border: "1px solid #2b3a5c", borderRadius: 6, color: "#cdd9f5", minWidth: 220 }} />
        <select className="mono" name="type" defaultValue={type ?? ""}
          style={{ padding: "8px 10px", background: "#0d1424", border: "1px solid #2b3a5c", borderRadius: 6, color: "#cdd9f5" }}>
          <option value="">all types</option>
          {types.map((t) => <option key={t} value={t}>{t}</option>)}
        </select>
        <button type="submit" className="landing-cta">Search</button>
        {(actor || type) && <Link href="/history" className="build-link">clear</Link>}
      </form>

      {story && (
        <section className="world-section">
          <h2 className="world-section-h2">Life of {actor}</h2>
          {story.map((line, i) => <p key={i} className="world-empty" style={{ textAlign: "left", margin: "4px 0" }}>{line}</p>)}
          {narrative && (
            <div style={{ marginTop: 12 }}>
              <p className="landing-eyebrow">Narrated on 0G</p>
              <p className="mono" style={{ lineHeight: 1.6 }}>{narrative.text}</p>
              <ZeroGBadges rootHash={narrative.rootHash} verified />
            </div>
          )}
        </section>
      )}

      <section className="world-section">
        <h2 className="world-section-h2">Events{actor ? ` involving ${actor}` : ""}{type ? ` · ${type}` : ""}</h2>
        {error ? (
          <div className="world-error-panel"><p className="world-error-msg mono">{error}</p></div>
        ) : events.length === 0 ? (
          <p className="world-empty">No events match.</p>
        ) : (
          <ul className="world-event-list">
            {events.map((e) => (
              <li key={e.id} className="world-event-item">
                <span className="world-event-day label">Day {e.day}</span>
                <span className="world-event-type mono">{e.type}</span>
                <span className="world-event-actors mono">
                  <Link href={linkFor(e.actorId)} className="world-id-link">{e.actorId}</Link>
                  {e.targetId && <>{" → "}<Link href={linkFor(e.targetId)} className="world-id-link">{e.targetId}</Link></>}
                </span>
                <ZeroGBadges rootHash={e.rootHash} verified />
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="build-cta-row" style={{ marginTop: 40 }}>
        <Link href="/world" className="build-link">← World</Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Add a `/history` link to `apps/web/app/world/page.tsx`**

In the MAIN return footer `build-cta-row` (the one with `Organizations →` and `← Home`), add before `← Home`:
```tsx
<Link href="/history" className="landing-cta">History →</Link>
```

- [ ] **Step 3: Build check**

Run: `cd /opt/civilization-0 && pnpm -C apps/web build`
Expected: SUCCESS; `/history` listed as a dynamic route `ƒ`; `/world` still light. Confirm no heavy imports: `grep -rE "@civ/(engine|store|memory|brain|beliefs|scheduler)" apps/web/app/history` → no matches.

- [ ] **Step 4: Typecheck + unit + commit**

Run: `cd /opt/civilization-0 && pnpm typecheck && pnpm test`
Expected: clean + green.
```bash
cd /opt/civilization-0 && git add apps/web/app/history/page.tsx apps/web/app/world/page.tsx
git commit -m "feat(web): /history explorer with search + life story"
```

---

### Task 7: 0G badges on `/world` + `/orgs/[id]` surfaces

**Files:**
- Modify: `packages/persistence/src/read.ts` (`readWorldView` carries `rootHash`; extend `WorldView`)
- Modify: `apps/web/lib/dashboard.ts` (`WorldView.recentEvents` optional `rootHash`)
- Modify: `apps/web/app/world/page.tsx` (render `<ZeroGBadges>` per event)
- Modify: `apps/web/app/orgs/[id]/page.tsx` (render `<ZeroGBadges>` per decision)
- Modify: `packages/persistence/src/read-orgs.itest.ts` is unaffected; extend `repository.itest.ts`? No — add a focused assertion to `read-history.itest`? Keep scope tight: add one assertion to a NEW small itest `read-worldview-prov.itest.ts`.

**Interfaces:**
- `WorldView.recentEvents` item gains optional `rootHash?: string | null`. `readWorldView` LEFT JOINs traces and coalesces `events.zg_root_hash`/`traces.zg_root_hash`.

- [ ] **Step 1: Write the failing test** — `packages/persistence/src/read-worldview-prov.itest.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";
import { readWorldView } from "./read";

beforeAll(async () => {
  await migrate(); await resetWorld();
  await getPool().query(`INSERT INTO events (id,day,type,actor_id,target_id,decision_id,payload,zg_root_hash)
    VALUES ('e1',1,'work','ada',null,null,'{}','0xfeed')`);
});
afterAll(async () => { await closePool(); });

it("readWorldView carries each event's 0G root hash", async () => {
  const v = await readWorldView(getPool(), 10);
  const e = v.recentEvents.find((x) => x.id === "e1");
  expect(e?.rootHash).toBe("0xfeed");
});
```

- [ ] **Step 2: Run it — expect FAIL** (`rootHash` undefined)

Run: `cd /opt/civilization-0 && pnpm test:it packages/persistence/src/read-worldview-prov.itest.ts`
Expected: FAIL.

- [ ] **Step 3: Edit `readWorldView` in `packages/persistence/src/read.ts`**

Change the `WorldView` interface `recentEvents` item to add `rootHash: string | null;`. Change the events query + mapping:
```ts
  const es = await pool.query(
    `SELECT e.id, e.day, e.type, e.actor_id, e.target_id,
       COALESCE(e.zg_root_hash, t.zg_root_hash) AS root_hash
     FROM events e LEFT JOIN traces t ON t.decision_id = e.decision_id
     ORDER BY e.day DESC, e.id DESC LIMIT $1`, [limit]);
```
```ts
    recentEvents: es.rows.map((r) => ({
      id: r.id, day: r.day, type: r.type, actorId: r.actor_id,
      targetId: r.target_id, rootHash: r.root_hash ?? null,
    })),
```

- [ ] **Step 4: Run it — expect PASS**

Run: `cd /opt/civilization-0 && pnpm test:it packages/persistence/src/read-worldview-prov.itest.ts`
Expected: PASS.

- [ ] **Step 5: Mirror the optional field in `apps/web/lib/dashboard.ts`**

In its `WorldView.recentEvents` item type, add `rootHash?: string | null;` (optional — keeps `dashboard.test.ts` green since its fixtures omit it).

- [ ] **Step 6: Render badges**

In `apps/web/app/world/page.tsx`, import `ZeroGBadges` and add `<ZeroGBadges rootHash={e.rootHash} verified />` inside each `world-event-item` (after the `world-event-id`).
In `apps/web/app/orgs/[id]/page.tsx`, import `ZeroGBadges` and add `<ZeroGBadges rootHash={d.rootHash} verified />` to each decision item (replacing or beside the existing `verify on 0G ↗` link — keep one verify affordance; prefer the badge).

- [ ] **Step 7: Build + gates + commit**

Run: `cd /opt/civilization-0 && pnpm -C apps/web build && pnpm typecheck && pnpm test`
Expected: build SUCCESS, typecheck clean, unit green (incl. dashboard.test.ts).
```bash
cd /opt/civilization-0 && git add packages/persistence/src/read.ts packages/persistence/src/read-worldview-prov.itest.ts apps/web/lib/dashboard.ts apps/web/app/world/page.tsx apps/web/app/orgs/[id]/page.tsx
git commit -m "feat(web): 0G provenance badges on world + org surfaces"
```

---

### Task 8: LIVE 0G-narrated life story (proof point) — controller-run

**Files:**
- Create: `packages/scheduler/scripts/run-life-story.ts`

**Interfaces:**
- Consumes: `loadZeroGConfig`, `getWalletAddress`, `getBalanceOG` from `@civ/zerog/src/{config,wallet}`; `RealChat` from `@civ/zerog/src/real-chat`; `createZeroGStorage` from `@civ/zerog/src/real-uploader`; `getPool`, `closePool`, `NarrativeRepository`, `searchEvents` from `@civ/persistence`.
- SPLIT: a subagent may WRITE the script (no secrets). The CONTROLLER runs the live step (spends OG, loads the key).

- [ ] **Step 1: Create `packages/scheduler/scripts/run-life-story.ts`**

```ts
import { loadZeroGConfig } from "@civ/zerog/src/config";
import { getBalanceOG, getWalletAddress } from "@civ/zerog/src/wallet";
import { RealChat } from "@civ/zerog/src/real-chat";
import { createZeroGStorage } from "@civ/zerog/src/real-uploader";
import { getPool, closePool, NarrativeRepository, searchEvents } from "@civ/persistence";

// LIVE: narrate a citizen's life on real 0G Compute, archive to 0G Storage,
// persist into narratives. Logs wallet ADDRESS + balances only — never the key.
async function main() {
  const FLOOR = Number(process.env.ZG_BALANCE_FLOOR_OG ?? 0.1);
  const config = loadZeroGConfig(process.env);
  console.log("Wallet:", getWalletAddress(config));

  const idArg = process.argv.indexOf("--citizen");
  const citizenId = idArg !== -1 ? process.argv[idArg + 1] : "ada";

  const c = await getPool().query("SELECT name, occupation FROM citizens WHERE id = $1", [citizenId]);
  if (!c.rows[0]) { console.warn(`Citizen ${citizenId} not found — seed-world first`); await closePool(); process.exit(1); }
  const events = await searchEvents(getPool(), { actorId: citizenId, limit: 50 });

  const startBal = await getBalanceOG(config);
  console.log("Start balance:", startBal, "OG");
  if (startBal < FLOOR) { console.warn(`Balance ${startBal} < floor ${FLOOR} — stopping (no spend).`); await closePool(); process.exit(1); }

  const facts = events.map((e) => `day ${e.day}: ${e.type}${e.targetId ? " " + e.targetId : ""}${e.reasoning ? ` (${e.reasoning})` : ""}`).join("; ");
  const chat = await RealChat.create(config);
  const result = await chat.complete([
    { role: "system", content: "You are a historian. Narrate the citizen's life in 3-5 vivid, factual sentences. Use only the provided events. No preamble." },
    { role: "user", content: `Citizen ${c.rows[0].name}, a ${c.rows[0].occupation}. Events: ${facts || "(none yet)"}.` },
  ]);

  const storage = createZeroGStorage(config);
  const day = events[0]?.day ?? 0;
  const id = `life-${citizenId}-${Date.now().toString(36)}`;
  const archive = await storage.archive(`narrative/${id}`, {
    schema: "civ.narrative/v0", subjectId: citizenId, kind: "life_story", day, text: result.content,
  });
  await new NarrativeRepository().saveNarrative({
    id, subjectId: citizenId, kind: "life_story", day, text: result.content,
    rootHash: archive.rootHash, txHash: archive.txHash,
  });

  const endBal = await getBalanceOG(config);
  console.log("Citizen:", citizenId, `(${c.rows[0].name})`);
  console.log("0G verified:", result.verified ?? "(n/a)");
  console.log("Narrative:", result.content);
  console.log("Archived root hash:", archive.rootHash);
  console.log("Verify at: /verify/" + archive.rootHash);
  console.log(`OG spent: ${(startBal - endBal).toFixed(6)}`);
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
```

- [ ] **Step 2: Typecheck**

Run: `cd /opt/civilization-0 && pnpm typecheck`
Expected: clean. (If `getBalanceOG`/`RealChat`/`createZeroGStorage`/`NarrativeRepository`/`searchEvents` signatures differ, READ the source and adapt — they are the source of truth.)

- [ ] **Step 3: CONTROLLER live run** (spends OG; ensure citizen `ada` exists — run `scripts/seed-world.ts` first if needed)

Run: `cd /opt/civilization-0/packages/scheduler && set -a && . /opt/civilization-0/.env && set +a && pnpm exec tsx --conditions require scripts/run-life-story.ts --citizen ada`
Expected: prints wallet address, `0G verified: true` (ideally), a narrative, an archived root hash, OG spent (~0.002–0.004). Capture all output (minus secrets).

- [ ] **Step 4: Read-back proof**

Run (psql): `cd /opt/civilization-0 && PGPASSWORD=civ-local psql -h 127.0.0.1 -U civ -d civ0 -tAc "SELECT subject_id, kind, left(text,40), zg_root_hash FROM narratives WHERE subject_id='ada' ORDER BY day DESC LIMIT 1;"`
Expected: one row with the narrative text + root hash. Then `/history?actor=ada` renders the "Narrated on 0G" block with a working `/verify/<root>` badge.

- [ ] **Step 5: Commit (script only)**

```bash
cd /opt/civilization-0 && git add packages/scheduler/scripts/run-life-story.ts
git commit -m "feat(scheduler): live 0G life-story narration + cost gate"
```

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- `HistoricalEvent` projection → Task 2 (`searchEvents`/`HistoricalEvent`). ✓
- DB-backed search by citizen/org/event type → Task 2 (`actorId` matches actor OR target; `type` filter). ✓
- History Explorer screen ("all events involving Ada") → Task 6 (`/history?actor=ada`). ✓
- "0G Compute ✓ / 0G Storage ✓" badges on every decision/event/org surface → Tasks 4 (component) + 6 (history) + 7 (world + org). ✓
- Life-story generation for a tier-3 citizen → Task 5 (deterministic) + Task 8 (live 0G narration), rendered Task 6. Ada is tier-3. ✓
- Acceptance: search returns full event history with working links (Task 6 `linkFor`), every surface shows 0G provenance (Tasks 6/7), coherent life story renders (Tasks 5/6/8). ✓

**2. Placeholder scan:** none — every step has concrete code/commands.

**3. Type consistency:** `HistoricalEvent` (id/day/type/actorId/targetId/reasoning/rootHash) is produced in Task 2 and consumed verbatim in Task 6. `NarrativeView`/`NarrativeRecord` consistent across Tasks 3/6/8. `ZeroGBadges({rootHash, verified})` consistent across Tasks 4/6/7. `buildLifeStory(LifeStoryInput)` consistent Tasks 5/6.

**Adaptation note (architecture vs. roadmap):** the roadmap says "life story on the Citizen page"; the only citizen page (`/citizens/ada`) is a seeded-snapshot static page, and the generalized DB-backed Citizen page is explicitly Slice 4 scope. To stay DB-backed and keyless this slice, the life story renders on the History Explorer's single-citizen view (`/history?actor=ada`), which is also where "all events involving Ada" lives — one coherent surface. Generalizing onto a per-citizen route is deferred to Slice 4.

## Execution Handoff

Subagent-driven (same as Slices 1 & 2): fresh implementer per task, controller reviews between tasks; controller runs the Task 8 live OG step. Final: whole-branch review → finishing-a-development-branch (merge to master) → memory update.
