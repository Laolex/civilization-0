# Civilization-0 V1 · Slice 1 — Persistence + Scheduler + Dashboard

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** make the world durable and self-advancing — a small multi-citizen
population that ticks autonomously against Postgres, survives restarts, archives
to 0G, and renders a live World Dashboard. Proves the north star.

**Architecture:** **Load-save repository pattern.** The engine and the
synchronous `WorldStore` are unchanged. A new async `WorldRepository`
(`@civ/persistence`) hydrates a fresh `InMemoryWorldStore` with one citizen's
context, the existing `runCitizenTick` runs synchronously, then the repository
persists the new rows back to Postgres. A new `@civ/scheduler` selects who ticks
each day by agent tier and drives the load → tick → persist loop. Memory
embeddings are stored in a pgvector column but ranking stays **in-process** for
Slice 1 (per-citizen memory counts are small); moving ranking into a pgvector
query is a later optimization.

**Tech Stack:** Postgres 16 + pgvector (the VPS's existing native
`postgresql@16-main` on 127.0.0.1:5432; **the controller has already provisioned
an isolated `civ0` database owned by role `civ`, with the `vector` extension
enabled, and set `DATABASE_URL` in `.env`** — Docker is not used), `pg`
(node-postgres) with hand-written SQL + a tiny migration runner, TypeScript ESM,
Vitest, pnpm 9.15.4 / Node 20.

## Global Constraints

- Keep the `WorldStore` interface and the engine **unchanged**. New persistence
  is a separate async layer, not a `WorldStore` reimplementation.
- `BrainProvider` abstract; `ZeroGComputeBrain` is production. The network-free
  **unit** suite (pure logic + fakes) must not import DB or 0G clients.
- DB-touching tests are **integration tests** (`*.itest.ts`) that run against the
  Docker test database; they are a separate Vitest project from the unit suite.
- Never print/commit `ZG_PRIVATE_KEY` or the Postgres password in code. Config
  comes from env (`.env`, gitignored).
- 0G stays load-bearing: every major action archives to 0G Storage; at least one
  ticked decision must be 0G-verifiable. Per-day OG burn must be measured before
  enabling continuous ticking.
- pnpm 9.15.4 / Node 20. TDD, frequent commits. Compute scripts run with
  `tsx --conditions require`.

---

## File Structure

- (DB host: the VPS's native `postgresql@16-main`; no `docker-compose.yml`.)
- `packages/persistence/` — new package `@civ/persistence`:
  - `src/pool.ts` — `pg` Pool factory from env.
  - `src/migrate.ts` — apply `schema.sql`.
  - `src/schema.sql` — world tables + pgvector column.
  - `src/repository.ts` — `WorldRepository` (`loadContext`, `persistTick`,
    `advanceDay`, read helpers for the dashboard).
  - `src/repository.itest.ts` — integration tests (Docker DB).
- `packages/scheduler/` — new package `@civ/scheduler`:
  - `src/select.ts` — pure tier-based selection (`selectTickers`).
  - `src/select.test.ts` — unit tests (network-free).
  - `src/loop.ts` — `runDay(deps)` orchestration (load → tick → persist).
  - `scripts/seed-world.ts` — insert seed population into Postgres.
  - `scripts/run-scheduler.ts` — live runnable (real 0G + DB), budget-capped.
- `apps/web/lib/dashboard.ts` — pure dashboard selectors over a `WorldView`.
- `apps/web/lib/dashboard.test.ts` — unit tests.
- `apps/web/app/world/page.tsx` — World Dashboard (server component).
- `deploy/civ0-scheduler.service` — systemd unit.

---

## Task 1: `@civ/persistence` package + connection pool

**Pre-provisioned by the controller (do NOT redo):** the VPS's native Postgres 16
already has an isolated `civ0` database owned by role `civ`, the `vector`
extension enabled, and `.env` contains
`DATABASE_URL=postgres://civ:civ-local@127.0.0.1:5432/civ0`. Verify with:
`PGPASSWORD=civ-local psql -h 127.0.0.1 -U civ -d civ0 -tAc "SELECT extname FROM pg_extension WHERE extname='vector';"`
→ expect `vector`. There is no Docker and no `docker-compose.yml`.

**Files:**
- Create: `packages/persistence/package.json`, `tsconfig.json`
- Create: `packages/persistence/src/pool.ts`
- Modify: `tsconfig.base.json` (add `@civ/persistence` path)

**Interfaces:**
- Produces: `getPool(): Pool` and `closePool(): Promise<void>` from `@civ/persistence/src/pool`.

- [ ] **Step 1: package scaffold + path alias**

`packages/persistence/package.json`:
```json
{
  "name": "@civ/persistence",
  "version": "0.0.0",
  "private": true,
  "type": "module",
  "main": "src/pool.ts",
  "dependencies": {
    "@civ/shared": "workspace:*",
    "@civ/store": "workspace:*",
    "@civ/memory": "workspace:*",
    "pg": "^8.13.1"
  },
  "devDependencies": { "@types/pg": "^8.11.10" }
}
```
`packages/persistence/tsconfig.json`: `{ "extends": "../../tsconfig.base.json", "include": ["src"] }`
Add to `tsconfig.base.json` paths: `"@civ/persistence": ["packages/persistence/src"]`

- [ ] **Step 2: pool factory**

`packages/persistence/src/pool.ts`:
```ts
import { Pool } from "pg";

let pool: Pool | undefined;

export function getPool(): Pool {
  if (!pool) {
    const connectionString = process.env.DATABASE_URL;
    if (!connectionString) throw new Error("DATABASE_URL is required");
    pool = new Pool({ connectionString, max: 5 });
  }
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) { await pool.end(); pool = undefined; }
}
```

- [ ] **Step 3: install + verify connection + commit**

```bash
cd /opt/civilization-0 && pnpm install
# sanity: getPool connects (dotenv loads DATABASE_URL)
pnpm dlx tsx --env-file=.env -e "import('@civ/persistence/src/pool').then(async m=>{const r=await m.getPool().query('select 1 as ok');console.log(r.rows[0]);await m.closePool();})"
git add packages/persistence tsconfig.base.json
git commit -m "feat(persistence): @civ/persistence package + connection pool"
```
Expected: `{ ok: 1 }`.

---

## Task 2: World schema + migration runner

**Files:**
- Create: `packages/persistence/src/schema.sql`
- Create: `packages/persistence/src/migrate.ts`
- Test: `packages/persistence/src/migrate.itest.ts`

**Interfaces:**
- Produces: `migrate(): Promise<void>` from `@civ/persistence/src/migrate` (applies `schema.sql`, idempotent).

- [ ] **Step 1: schema (mirrors `@civ/shared` types)**

`packages/persistence/src/schema.sql` (idempotent `CREATE TABLE IF NOT EXISTS`):
```sql
CREATE EXTENSION IF NOT EXISTS vector;

CREATE TABLE IF NOT EXISTS world_state (
  id INT PRIMARY KEY DEFAULT 1,
  day INT NOT NULL DEFAULT 0,
  economy JSONB NOT NULL DEFAULT '{}',
  headline TEXT NOT NULL DEFAULT ''
);
INSERT INTO world_state (id) VALUES (1) ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS citizens (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, occupation TEXT NOT NULL,
  age INT NOT NULL, traits JSONB NOT NULL, wealth NUMERIC NOT NULL DEFAULT 0,
  reputation NUMERIC NOT NULL DEFAULT 0, tier INT NOT NULL DEFAULT 1,
  created_day INT NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY, citizen_id TEXT NOT NULL REFERENCES citizens(id),
  kind TEXT NOT NULL, description TEXT NOT NULL,
  progress NUMERIC NOT NULL DEFAULT 0, active BOOLEAN NOT NULL DEFAULT TRUE
);

CREATE TABLE IF NOT EXISTS relationships (
  citizen_id TEXT NOT NULL REFERENCES citizens(id),
  other_id TEXT NOT NULL,
  trust NUMERIC NOT NULL, friendship NUMERIC NOT NULL, influence NUMERIC NOT NULL,
  PRIMARY KEY (citizen_id, other_id)
);

CREATE TABLE IF NOT EXISTS memories (
  id TEXT PRIMARY KEY, citizen_id TEXT NOT NULL REFERENCES citizens(id),
  day INT NOT NULL, type TEXT NOT NULL, importance INT NOT NULL,
  summary TEXT NOT NULL, embedding vector(64),
  zg_root_hash TEXT, zg_tx_hash TEXT
);
CREATE INDEX IF NOT EXISTS memories_citizen_idx ON memories (citizen_id);

CREATE TABLE IF NOT EXISTS beliefs (
  id TEXT PRIMARY KEY, citizen_id TEXT NOT NULL REFERENCES citizens(id),
  statement TEXT NOT NULL, confidence NUMERIC NOT NULL,
  source_memory_ids JSONB NOT NULL DEFAULT '[]', updated_day INT NOT NULL
);

CREATE TABLE IF NOT EXISTS decisions (
  id TEXT PRIMARY KEY, citizen_id TEXT NOT NULL REFERENCES citizens(id),
  goal_id TEXT, day INT NOT NULL, reasoning TEXT NOT NULL, action TEXT NOT NULL,
  target_id TEXT, brain_provider TEXT NOT NULL, brain_model TEXT NOT NULL,
  meta JSONB
);

CREATE TABLE IF NOT EXISTS decision_memories (
  decision_id TEXT NOT NULL, memory_id TEXT NOT NULL, weight NUMERIC NOT NULL,
  PRIMARY KEY (decision_id, memory_id)
);
CREATE TABLE IF NOT EXISTS decision_beliefs (
  decision_id TEXT NOT NULL, belief_id TEXT NOT NULL, weight NUMERIC NOT NULL,
  PRIMARY KEY (decision_id, belief_id)
);

CREATE TABLE IF NOT EXISTS events (
  id TEXT PRIMARY KEY, day INT NOT NULL, type TEXT NOT NULL,
  actor_id TEXT NOT NULL, target_id TEXT, decision_id TEXT,
  payload JSONB NOT NULL DEFAULT '{}', zg_root_hash TEXT, zg_tx_hash TEXT
);
CREATE INDEX IF NOT EXISTS events_actor_idx ON events (actor_id);
CREATE INDEX IF NOT EXISTS events_day_idx ON events (day);

CREATE TABLE IF NOT EXISTS traces (
  id TEXT PRIMARY KEY, decision_id TEXT NOT NULL, trace JSONB NOT NULL,
  zg_root_hash TEXT, zg_tx_hash TEXT
);
```

- [ ] **Step 2: migration runner**

`packages/persistence/src/migrate.ts`:
```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { getPool } from "./pool";

export async function migrate(): Promise<void> {
  const here = dirname(fileURLToPath(import.meta.url));
  const sql = readFileSync(join(here, "schema.sql"), "utf8");
  await getPool().query(sql);
}
```

- [ ] **Step 3: failing integration test**

`packages/persistence/src/migrate.itest.ts`:
```ts
import { describe, it, expect, afterAll } from "vitest";
import { getPool, closePool } from "./pool";
import { migrate } from "./migrate";

afterAll(async () => { await closePool(); });

describe("migrate", () => {
  it("creates the world tables", async () => {
    await migrate();
    const { rows } = await getPool().query(
      "SELECT to_regclass('public.citizens') AS c, to_regclass('public.events') AS e",
    );
    expect(rows[0].c).toBe("citizens");
    expect(rows[0].e).toBe("events");
  });
});
```

- [ ] **Step 4: add an integration Vitest project**

Create `vitest.integration.config.ts` at repo root:
```ts
import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: { include: ["packages/**/*.itest.ts"], pool: "forks", fileParallelism: false },
});
```
Add script to root `package.json`: `"test:it": "dotenv -e .env -- vitest run --config vitest.integration.config.ts"` (install `dotenv-cli` as a root devDep).

- [ ] **Step 5: run it — expect PASS after DB is up**

Run: `cd /opt/civilization-0 && pnpm test:it packages/persistence/src/migrate.itest.ts`
Expected: PASS (tables exist).

- [ ] **Step 6: commit**

```bash
git add packages/persistence/src/schema.sql packages/persistence/src/migrate.ts \
        packages/persistence/src/migrate.itest.ts vitest.integration.config.ts package.json
git commit -m "feat(persistence): world schema + migration runner"
```

---

## Task 3: `WorldRepository.loadContext` (hydrate a sync store)

**Files:**
- Create: `packages/persistence/src/repository.ts`
- Test: `packages/persistence/src/repository.itest.ts`

**Interfaces:**
- Consumes: `getPool` (Task 1), schema (Task 2), `InMemoryWorldStore` (`@civ/store`).
- Produces:
  ```ts
  class WorldRepository {
    constructor(pool?: Pool);
    upsertCitizenRow(c: Citizen): Promise<void>;       // seed/test helper
    addMemoryRow(m: Memory): Promise<void>;            // seed/test helper
    setDay(day: number): Promise<void>;
    loadContext(citizenId: string): Promise<InMemoryWorldStore>; // citizen+goal+memories+beliefs+rels+worldState
  }
  ```

- [ ] **Step 1: failing test — loadContext round-trips a citizen + memory**

`packages/persistence/src/repository.itest.ts`:
```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { WorldRepository } from "./repository";

const repo = new WorldRepository();

beforeAll(async () => {
  await migrate();
  await getPool().query("DELETE FROM memories; DELETE FROM citizens;");
  await repo.upsertCitizenRow({ id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
  await repo.addMemoryRow({ id: "m1", citizenId: "ada", day: 1, type: "event",
    importance: 8, summary: "Lost job", embedding: new Array(64).fill(0).map((_, i) => (i === 0 ? 1 : 0)) });
});
afterAll(async () => { await closePool(); });

describe("WorldRepository.loadContext", () => {
  it("hydrates an InMemoryWorldStore with the citizen and memories", async () => {
    const store = await repo.loadContext("ada");
    expect(store.getCitizen("ada")?.name).toBe("Ada");
    expect(store.getMemories("ada")).toHaveLength(1);
    expect(store.getMemories("ada")[0].embedding).toHaveLength(64);
  });
});
```

- [ ] **Step 2: run — expect FAIL** (`WorldRepository` undefined). `pnpm test:it packages/persistence/src/repository.itest.ts`

- [ ] **Step 3: implement loadContext + helpers**

`packages/persistence/src/repository.ts`:
```ts
import type { Pool } from "pg";
import type { Citizen, Memory } from "@civ/shared";
import { InMemoryWorldStore } from "@civ/store";
import { getPool } from "./pool";

function toVector(v: number[]): string { return `[${v.join(",")}]`; }
function fromVector(s: string | null): number[] {
  return s ? s.replace(/[[\]]/g, "").split(",").filter(Boolean).map(Number) : [];
}

export class WorldRepository {
  constructor(private readonly pool: Pool = getPool()) {}

  async setDay(day: number): Promise<void> {
    await this.pool.query("UPDATE world_state SET day = $1 WHERE id = 1", [day]);
  }

  async upsertCitizenRow(c: Citizen): Promise<void> {
    await this.pool.query(
      `INSERT INTO citizens (id,name,occupation,age,traits,wealth,reputation,tier,created_day)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET name=$2,occupation=$3,age=$4,traits=$5,
         wealth=$6,reputation=$7,tier=$8,created_day=$9`,
      [c.id, c.name, c.occupation, c.age, JSON.stringify(c.traits), c.wealth, c.reputation, c.tier, c.createdDay],
    );
  }

  async addMemoryRow(m: Memory): Promise<void> {
    await this.pool.query(
      `INSERT INTO memories (id,citizen_id,day,type,importance,summary,embedding,zg_root_hash,zg_tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.citizenId, m.day, m.type, m.importance, m.summary,
       m.embedding.length ? toVector(m.embedding) : null, m.zgRootHash ?? null, m.zgTxHash ?? null],
    );
  }

  async loadContext(citizenId: string): Promise<InMemoryWorldStore> {
    const store = new InMemoryWorldStore();
    const ws = await this.pool.query("SELECT day, economy, headline FROM world_state WHERE id = 1");
    if (ws.rows[0]) store.setWorldState({ day: ws.rows[0].day, economy: ws.rows[0].economy, headline: ws.rows[0].headline });

    const c = await this.pool.query("SELECT * FROM citizens WHERE id = $1", [citizenId]);
    if (c.rows[0]) {
      const r = c.rows[0];
      store.upsertCitizen({ id: r.id, name: r.name, occupation: r.occupation, age: r.age,
        traits: r.traits, wealth: Number(r.wealth), reputation: Number(r.reputation),
        tier: r.tier, createdDay: r.created_day });
    }
    const goals = await this.pool.query("SELECT * FROM goals WHERE citizen_id = $1", [citizenId]);
    for (const g of goals.rows) store.upsertGoal({ id: g.id, citizenId: g.citizen_id, kind: g.kind,
      description: g.description, progress: Number(g.progress), active: g.active });

    const mems = await this.pool.query("SELECT * FROM memories WHERE citizen_id = $1", [citizenId]);
    for (const m of mems.rows) store.addMemory({ id: m.id, citizenId: m.citizen_id, day: m.day,
      type: m.type, importance: m.importance, summary: m.summary, embedding: fromVector(m.embedding),
      zgRootHash: m.zg_root_hash ?? undefined, zgTxHash: m.zg_tx_hash ?? undefined });

    const beliefs = await this.pool.query("SELECT * FROM beliefs WHERE citizen_id = $1", [citizenId]);
    for (const b of beliefs.rows) store.upsertBelief({ id: b.id, citizenId: b.citizen_id,
      statement: b.statement, confidence: Number(b.confidence), sourceMemoryIds: b.source_memory_ids,
      updatedDay: b.updated_day });

    const rels = await this.pool.query("SELECT * FROM relationships WHERE citizen_id = $1", [citizenId]);
    for (const rel of rels.rows) store.upsertRelationship({ citizenId: rel.citizen_id, otherId: rel.other_id,
      trust: Number(rel.trust), friendship: Number(rel.friendship), influence: Number(rel.influence) });

    return store;
  }
}
```

- [ ] **Step 4: run — expect PASS.** `pnpm test:it packages/persistence/src/repository.itest.ts`
- [ ] **Step 5: commit.** `git commit -am "feat(persistence): WorldRepository.loadContext hydrates a sync store"`

---

## Task 4: `WorldRepository.persistTick` (save tick output)

**Files:**
- Modify: `packages/persistence/src/repository.ts`
- Test: `packages/persistence/src/repository.itest.ts` (add cases)

**Interfaces:**
- Consumes: `TickResult` (`@civ/engine`), the post-tick `InMemoryWorldStore`.
- Produces:
  ```ts
  persistTick(store: InMemoryWorldStore, result: TickResult, citizenId: string): Promise<void>
  // writes decision, decision_memories, decision_beliefs, event, trace, the new
  // memory, any belief upserts, relationship upserts, and archive hashes; all in
  // one transaction.
  ```

- [ ] **Step 1: failing test — a persisted tick reloads with its decision + event**

Add to `repository.itest.ts`:
```ts
import { runCitizenTick, type TickDeps } from "@civ/engine";
import { FakeBrain } from "@civ/brain";
import { FakeStorage } from "@civ/storage";
import { FakeEmbedder, MemoryIndex } from "@civ/memory";
import { RuleBasedBeliefReviser } from "@civ/beliefs";
import { ExplainabilityService } from "@civ/explainability";

it("persists a tick so its event survives a reload", async () => {
  const store = await repo.loadContext("ada");
  let n = 0; const idgen = () => `t${n++}`;
  const embedder = new FakeEmbedder();
  const deps: TickDeps = { store, embedder, memoryIndex: new MemoryIndex(store, embedder),
    reviser: new RuleBasedBeliefReviser(), brain: new FakeBrain((ctx) => ({ action: "work", targetId: null,
      reasoning: "keep building", memoryWeights: {}, beliefWeights: {} })),
    storage: new FakeStorage(), explain: new ExplainabilityService(new FakeStorage()),
    clock: { day: 2 }, idgen };
  const result = await runCitizenTick(deps, "ada");
  await repo.persistTick(store, result, "ada");

  const { rows } = await getPool().query("SELECT COUNT(*)::int AS c FROM events WHERE actor_id = 'ada'");
  expect(rows[0].c).toBeGreaterThanOrEqual(1);
});
```
(`RuleBasedBeliefReviser` is deterministic and network-free, so it's used
directly in tests — no fake needed.)

- [ ] **Step 2: run — expect FAIL** (`persistTick` undefined).

- [ ] **Step 3: implement persistTick (transactional)**

Append to `WorldRepository`:
```ts
async persistTick(store: InMemoryWorldStore, result: TickResult, citizenId: string): Promise<void> {
  const client = await this.pool.connect();
  try {
    await client.query("BEGIN");
    const d = result.decision;
    await client.query(
      `INSERT INTO decisions (id,citizen_id,goal_id,day,reasoning,action,target_id,brain_provider,brain_model,meta)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
      [d.id, d.citizenId, d.goalId, d.day, d.reasoning, d.action, d.targetId, d.brainProvider, d.brainModel,
       d.meta ? JSON.stringify(d.meta) : null]);

    for (const dm of store.getDecisionMemories(d.id))
      await client.query(`INSERT INTO decision_memories VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [dm.decisionId, dm.memoryId, dm.weight]);
    for (const db of store.getDecisionBeliefs(d.id))
      await client.query(`INSERT INTO decision_beliefs VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
        [db.decisionId, db.beliefId, db.weight]);

    const e = result.event;
    await client.query(
      `INSERT INTO events (id,day,type,actor_id,target_id,decision_id,payload,zg_root_hash,zg_tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [e.id, e.day, e.type, e.actorId, e.targetId, e.decisionId, JSON.stringify(e.payload),
       e.zgRootHash ?? null, e.zgTxHash ?? null]);

    const t = result.trace;
    await client.query(
      `INSERT INTO traces (id,decision_id,trace,zg_root_hash,zg_tx_hash)
       VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [t.id, t.decisionId, JSON.stringify(t.trace), t.zgRootHash ?? null, t.zgTxHash ?? null]);

    if (result.storedMemory) await this.addMemoryRowOn(client, result.storedMemory);

    for (const b of store.getBeliefs(citizenId))
      await client.query(
        `INSERT INTO beliefs (id,citizen_id,statement,confidence,source_memory_ids,updated_day)
         VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET statement=$3,confidence=$4,
           source_memory_ids=$5,updated_day=$6`,
        [b.id, b.citizenId, b.statement, b.confidence, JSON.stringify(b.sourceMemoryIds), b.updatedDay]);

    for (const rel of store.getRelationships(citizenId))
      await client.query(
        `INSERT INTO relationships VALUES ($1,$2,$3,$4,$5)
         ON CONFLICT (citizen_id,other_id) DO UPDATE SET trust=$3,friendship=$4,influence=$5`,
        [rel.citizenId, rel.otherId, rel.trust, rel.friendship, rel.influence]);

    await client.query("COMMIT");
  } catch (err) { await client.query("ROLLBACK"); throw err; }
  finally { client.release(); }
}

private async addMemoryRowOn(client: import("pg").PoolClient, m: Memory): Promise<void> {
  await client.query(
    `INSERT INTO memories (id,citizen_id,day,type,importance,summary,embedding,zg_root_hash,zg_tx_hash)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
    [m.id, m.citizenId, m.day, m.type, m.importance, m.summary,
     m.embedding.length ? `[${m.embedding.join(",")}]` : null, m.zgRootHash ?? null, m.zgTxHash ?? null]);
}
```
Add `import type { TickResult } from "@civ/engine";` and `@civ/engine`,
`@civ/beliefs`, `@civ/explainability`, `@civ/brain`, `@civ/storage` to the
package's deps.

- [ ] **Step 4: run — expect PASS.**
- [ ] **Step 5: commit.** `git commit -am "feat(persistence): transactional persistTick"`

---

## Task 5: tier selection (pure unit logic)

**Files:**
- Create: `packages/scheduler/package.json`, `tsconfig.json`, `src/select.ts`
- Test: `packages/scheduler/src/select.test.ts`
- Modify: `tsconfig.base.json` (add `@civ/scheduler` path)

**Interfaces:**
- Produces:
  ```ts
  interface Ticker { id: string; tier: 1 | 2 | 3; }
  // tier-3 ticks every day, tier-2 every 3rd day, tier-1 every 7th day.
  function selectTickers(citizens: Ticker[], day: number): string[];
  ```

- [ ] **Step 1: failing unit test**

`packages/scheduler/src/select.test.ts`:
```ts
import { describe, it, expect } from "vitest";
import { selectTickers } from "./select";

const pop = [
  { id: "founder", tier: 3 as const },
  { id: "active", tier: 2 as const },
  { id: "extra", tier: 1 as const },
];

describe("selectTickers", () => {
  it("ticks tier-3 every day", () => {
    expect(selectTickers(pop, 1)).toContain("founder");
    expect(selectTickers(pop, 2)).toContain("founder");
  });
  it("ticks tier-2 every 3rd day and tier-1 every 7th", () => {
    expect(selectTickers(pop, 3)).toEqual(expect.arrayContaining(["founder", "active"]));
    expect(selectTickers(pop, 3)).not.toContain("extra");
    expect(selectTickers(pop, 7)).toEqual(expect.arrayContaining(["founder", "extra"]));
  });
});
```

- [ ] **Step 2: run — expect FAIL.** `pnpm vitest run packages/scheduler/src/select.test.ts`

- [ ] **Step 3: implement**

`packages/scheduler/src/select.ts`:
```ts
export interface Ticker { id: string; tier: 1 | 2 | 3; }
const CADENCE: Record<1 | 2 | 3, number> = { 3: 1, 2: 3, 1: 7 };

export function selectTickers(citizens: Ticker[], day: number): string[] {
  return citizens.filter((c) => day % CADENCE[c.tier] === 0).map((c) => c.id);
}
```
(Scaffold `package.json` name `@civ/scheduler`, deps `@civ/engine @civ/persistence
@civ/store @civ/memory @civ/beliefs @civ/explainability @civ/zerog @civ/shared`;
add path alias.)

- [ ] **Step 4: run — expect PASS.**
- [ ] **Step 5: commit.** `git commit -am "feat(scheduler): tier-based tick selection"`

---

## Task 6: day loop (`runDay`) wiring

**Files:**
- Create: `packages/scheduler/src/loop.ts`
- Test: `packages/scheduler/src/loop.itest.ts`

**Interfaces:**
- Produces:
  ```ts
  interface DayDeps {
    repo: WorldRepository;
    makeTickDeps: (store: InMemoryWorldStore, day: number) => TickDeps; // injects brain/storage/etc.
    citizens: Ticker[];
  }
  runDay(deps: DayDeps, day: number): Promise<{ ticked: string[] }>;
  ```

- [ ] **Step 1: failing integration test — runDay advances + persists for a fake-brain population**

`packages/scheduler/src/loop.itest.ts` (uses Fakes for brain/storage so it's
DB-only, no 0G): seed two citizens, `runDay(deps, 3)`, assert events row count
grew for the tier-3 citizen and the world day advanced to 3.

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { getPool, closePool, WorldRepository, migrate } from "@civ/persistence";
import { runDay } from "./loop";
import { FakeBrain } from "@civ/brain";
import { FakeStorage } from "@civ/storage";
import { FakeEmbedder, MemoryIndex } from "@civ/memory";
import { RuleBasedBeliefReviser } from "@civ/beliefs";
import { ExplainabilityService } from "@civ/explainability";

const repo = new WorldRepository();
beforeAll(async () => {
  await migrate();
  await getPool().query("DELETE FROM events; DELETE FROM memories; DELETE FROM citizens;");
  await repo.upsertCitizenRow({ id: "founder", name: "F", occupation: "Founder", age: 30,
    traits: { ambition: 90, empathy: 50, loyalty: 50, curiosity: 70, discipline: 70, riskTolerance: 60 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
});
afterAll(async () => { await closePool(); });

it("runDay ticks tier-3 and persists", async () => {
  let n = 0; const idgen = () => `r${n++}`;
  const makeTickDeps = (store, day) => {
    const embedder = new FakeEmbedder();
    return { store, embedder, memoryIndex: new MemoryIndex(store, embedder),
      reviser: new RuleBasedBeliefReviser(),
      brain: new FakeBrain(() => ({ action: "work", targetId: null, reasoning: "build", memoryWeights: {}, beliefWeights: {} })),
      storage: new FakeStorage(), explain: new ExplainabilityService(new FakeStorage()),
      clock: { day }, idgen };
  };
  const out = await runDay({ repo, makeTickDeps, citizens: [{ id: "founder", tier: 3 }] }, 3);
  expect(out.ticked).toContain("founder");
  const { rows } = await getPool().query("SELECT day FROM world_state WHERE id = 1");
  expect(rows[0].day).toBe(3);
});
```
(Requires `@civ/persistence/src/index.ts` to re-export `getPool, closePool,
WorldRepository, migrate` — add a barrel in Task 3/4 or here.)

- [ ] **Step 2: run — expect FAIL.**

- [ ] **Step 3: implement runDay**

`packages/scheduler/src/loop.ts`:
```ts
import type { InMemoryWorldStore } from "@civ/store";
import type { TickDeps } from "@civ/engine";
import { runCitizenTick } from "@civ/engine";
import type { WorldRepository } from "@civ/persistence";
import { selectTickers, type Ticker } from "./select";

export interface DayDeps {
  repo: WorldRepository;
  makeTickDeps: (store: InMemoryWorldStore, day: number) => TickDeps;
  citizens: Ticker[];
}

export async function runDay(deps: DayDeps, day: number): Promise<{ ticked: string[] }> {
  const ids = selectTickers(deps.citizens, day);
  for (const id of ids) {
    const store = await deps.repo.loadContext(id);
    const result = await runCitizenTick(deps.makeTickDeps(store, day), id);
    await deps.repo.persistTick(store, result, id);
  }
  await deps.repo.setDay(day);
  return { ticked: ids };
}
```

- [ ] **Step 4: run — expect PASS.**
- [ ] **Step 5: commit.** `git commit -am "feat(scheduler): runDay load→tick→persist loop"`

---

## Task 7: seed population script

**Files:**
- Create: `packages/scheduler/scripts/seed-world.ts`

**Interfaces:** consumes `WorldRepository` + `FakeEmbedder` (deterministic embeddings).

- [ ] **Step 1: write the seed script**

Insert 5–8 citizens across tiers (1× tier-3 founder, 2× tier-2, rest tier-1),
a couple of seed memories each (embedded via `FakeEmbedder`), a couple of
relationships, an active goal per active citizen, and `setDay(0)`. Use
`repo.upsertCitizenRow` / `addMemoryRow` and direct `getPool().query` for goals
and relationships. (Full citizen list spelled out in the script — no placeholder.)

- [ ] **Step 2: run it**

Run: `cd /opt/civilization-0 && pnpm dlx tsx --env-file=.env packages/scheduler/scripts/seed-world.ts`
Expected: prints inserted citizen ids; `SELECT COUNT(*) FROM citizens` ≥ 5.

- [ ] **Step 3: commit.** `git commit -am "feat(scheduler): seed starting population"`

---

## Task 8: dashboard selectors (pure unit logic)

**Files:**
- Create: `apps/web/lib/dashboard.ts`
- Test: `apps/web/lib/dashboard.test.ts`

**Interfaces:**
- Produces:
  ```ts
  interface WorldView { day: number; citizens: {id:string;name:string;tier:number;reputation:number}[];
    recentEvents: {id:string;day:number;type:string;actorId:string;targetId:string|null}[]; }
  function topCitizens(v: WorldView, k: number): WorldView["citizens"];     // by reputation
  function recent(v: WorldView, k: number): WorldView["recentEvents"];      // newest day first
  function population(v: WorldView): number;
  ```

- [ ] **Step 1: failing unit test** (network-free) asserting `topCitizens` sorts
by reputation desc and truncates to k; `recent` returns newest-first; `population`
counts citizens.
- [ ] **Step 2: run — FAIL.** `pnpm vitest run apps/web/lib/dashboard.test.ts`
- [ ] **Step 3: implement the three pure functions.**
- [ ] **Step 4: run — PASS.**
- [ ] **Step 5: commit.** `git commit -am "feat(web): world dashboard selectors"`

---

## Task 9: World Dashboard page + read query

**Files:**
- Create: `apps/web/app/world/page.tsx` (server component, `runtime=nodejs`, `dynamic=force-dynamic`)
- Modify: `packages/persistence/src/repository.ts` — add `readWorldView(limit:number): Promise<WorldView>`
- Modify: `apps/web/package.json` (add `@civ/persistence` dep) + `next.config.js` transpilePackages

**Interfaces:**
- Produces: `WorldRepository.readWorldView(limit)` → `{ day, citizens, recentEvents }` via 3 SELECTs.

- [ ] **Step 1: add `readWorldView`** — `SELECT day FROM world_state`, `SELECT
  id,name,tier,reputation FROM citizens`, `SELECT id,day,type,actor_id,target_id
  FROM events ORDER BY day DESC, id DESC LIMIT $1`.
- [ ] **Step 2: integration test** `repository.itest.ts`: after seeding, `readWorldView(10)` returns `day` and a non-empty `citizens` array.
- [ ] **Step 3: build the page** — server component calls `new WorldRepository().readWorldView(20)`, renders day counter, population, top citizens (`topCitizens`), recent events (`recent`); links citizens to `/citizens/:id` and events to their decision/verify. Reuse existing design-token CSS classes.
- [ ] **Step 4: build check** `pnpm -C apps/web build` → `/world` compiles.
- [ ] **Step 5: commit.** `git commit -am "feat(web): World Dashboard reads the persistent world"`

---

## Task 10: live scheduler runnable + systemd + cost gate

**Files:**
- Create: `packages/scheduler/scripts/run-scheduler.ts` (REAL 0G brain+storage, budget-capped)
- Create: `deploy/civ0-scheduler.service`

**Interfaces:** wires `createZeroGComputeBrain` + `createZeroGStorage` (real) into
`makeTickDeps`; advances N days per invocation; stops if a per-run OG budget is
exceeded or wallet balance < floor.

- [ ] **Step 1: write run-scheduler.ts** — load env; build a real `makeTickDeps`
  (real brain + storage, `FakeEmbedder` for embeddings, real `BeliefReviser`);
  read current day from `readWorldView`; loop `runDay(day+1..day+N)`; before each
  day, check wallet balance ≥ floor (skip + warn if not); log OG spent per day.
- [ ] **Step 2: measure cost — run ONE day live**

Run: `cd /opt/civilization-0/packages/zerog && set -a && . /opt/civilization-0/.env && set +a && pnpm exec tsx --conditions require /opt/civilization-0/packages/scheduler/scripts/run-scheduler.ts --days 1`
Expected: prints `ticked: [...]`, day advanced, and `OG spent ≈ X`. Record X/day.

- [ ] **Step 3: verify persistence across restart** — note day + `SELECT COUNT(*)
  FROM events`; run again `--days 1`; confirm day advanced and event count grew
  (the world survived the process exit). Open `/world` and confirm growth; open
  one decision's 0G chain and verify it.

- [ ] **Step 4: systemd unit (cadence + budget)**

`deploy/civ0-scheduler.service` (oneshot + timer, or a loop with sleep) running
`run-scheduler.ts --days 1` on a cadence, with `TELEGRAM`/alert on low balance.
Document install steps; do NOT enable continuous ticking until X/day is deemed
affordable on the current wallet.

- [ ] **Step 5: commit.** `git commit -am "feat(scheduler): live 0G runnable + systemd + cost gate"`

---

## Acceptance (Slice 1)

- `pnpm vitest run` (unit) green; `pnpm test:it` (integration, Docker DB) green.
- Seed → run scheduler for several days → **restart the process** → run more days
  → `/world` shows **more days, more events, new memories** that survived restart.
- At least one ticked decision's `Memory→Belief→0G Compute→Decision→Event→0G
  Storage` chain is viewable and keyless-verifiable.
- **Per-day OG burn measured and documented**; tier cadence tuned so a day is
  affordable on the current wallet before continuous ticking is enabled.

## Self-review notes

- **Roadmap correction:** the roadmap's "PostgresWorldStore implements WorldStore
  (same contract tests)" is replaced by the **load-save `WorldRepository`** here,
  because `WorldStore` is synchronous and the engine must stay unchanged. The
  equivalent guarantee is the round-trip integration tests (Tasks 3, 4, 6).
- **pgvector scope:** embeddings are persisted in a `vector(64)` column but Slice
  1 ranks in-process via the existing `MemoryIndex` (loaded per citizen). Moving
  ranking into a pgvector query is deferred to a scale-optimization slice.
- **Belief reviser:** verified — `@civ/beliefs` exports `RuleBasedBeliefReviser`
  (deterministic, network-free), used directly in tests; no fake needed.
