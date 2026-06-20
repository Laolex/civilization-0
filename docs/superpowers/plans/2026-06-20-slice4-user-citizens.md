# Slice 4 — User-created citizens + generalized Citizen page — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user create a citizen via a form that writes to Postgres (auto-enrolling it in the scheduler), and generalize the Ada profile into a DB-backed Citizen page (profile, timeline, relationships, goals, life story, explainability) that works for ANY citizen id.

**Architecture:** Extend the **pg-light read path** (`packages/persistence/src/read.ts`, imports ONLY `pg`) with citizen profile/relationship/goal/causal-chain reads so keyless Next pages can deep-import them. Citizen creation is a **keyless Postgres write** via a new pg-only `citizen-write.ts` (imports only `./pool`) behind `POST /api/citizens` — NOT a 0G write. The new citizen is auto-enrolled because `run-scheduler.ts` selects all citizens from the DB. The generalized `/citizens/[id]` page reuses the existing `<CausalChain>` + `<ZeroGBadges>` components by mapping pg-light reads into the existing `CausalChainView` shape. Engine (`packages/engine`) and WorldStore (`packages/store`) stay **byte-for-byte unchanged**.

**Tech Stack:** pnpm 9.15.4 / Node 20, TypeScript ESM monorepo, Vitest (unit `*.test.ts` + integration `*.itest.ts`), Postgres 16 + pgvector, Next.js 14.2.5 App Router, real 0G (testnet chainId 16602).

## Global Constraints

- **Engine + WorldStore UNCHANGED:** `git diff --stat <base>..HEAD -- packages/engine packages/store` EMPTY at every task. Never edit `packages/engine/src` or `packages/store/src`.
- **pg-light `read.ts`:** imports ONLY `pg` (`import type { Pool } from "pg"`). NO `@civ/*` imports. Define view interfaces inline. Verify: `grep -nE "^\s*import" packages/persistence/src/read.ts` → only `pg`.
- **pg-only write path:** `citizen-write.ts` imports ONLY `./pool` (like `narrative-repository.ts`). No `@civ/store`/`@civ/engine`.
- **Keyless web:** Next pages, components, AND API routes hold NO `ZG_PRIVATE_KEY` and NO 0G write path. They read/write Postgres only. Deep-import `@civ/persistence/src/{pool,read,citizen-write}` — never engine/store/memory/brain/scheduler.
- **Secrets:** NEVER print/echo/log/commit `ZG_PRIVATE_KEY` or `.env`. Live scripts log wallet ADDRESS + balances + root hashes only.
- **Tests:** unit `*.test.ts` network-free. DB tests `*.itest.ts`, run ONLY via `cd /opt/civilization-0 && pnpm test:it [path]`. NEVER `pnpm dlx`. itests use FK-safe `resetWorld()` in `beforeAll`.
- **Web test/build invocation:** there is NO `pnpm -C apps/web test` script. Unit tests run from repo root via `pnpm test [filter]`. Build runs via `pnpm -C apps/web build` (valid script).
- **Compute scripts:** `tsx --conditions require`. Live 0G runs spend OG — controller-only, cost-gated.
- **Commits:** NO `Co-Authored-By` trailer. Commit only the files a task touches. **Subagents' Bash git is sandbox-denied** — subagents do ALL work + gates but STAGE NOTHING; the controller verifies and commits.
- **Shell:** dev shell resets cwd between bash calls — always prefix `cd /opt/civilization-0 && `.
- **Ada page:** KEEP the static `apps/web/app/citizens/ada/page.tsx` (snapshot showcase). Do NOT delete or modify it. The new `/citizens/[id]` dynamic route serves all other ids; Next's exact-segment precedence routes `ada` to the static page.

---

## File Structure

- `packages/persistence/src/read.ts` — **modify:** add `CitizenProfileView`/`readCitizen`, `readRelationships`, `readGoals`, `RawDecisionChain`/`readDecisionChainRaw`.
- `packages/persistence/src/citizen-write.ts` — **create:** pg-only `createCitizen` (INSERT citizen + initial goal).
- `packages/persistence/src/index.ts` — **modify:** barrel re-export `citizen-write`.
- `apps/web/app/api/citizens/route.ts` — **create:** keyless `POST` handler.
- `apps/web/app/citizens/new/page.tsx` — **create:** creation form (client component).
- `apps/web/app/citizens/[id]/page.tsx` — **create:** generalized DB-backed profile.
- `apps/web/lib/citizen-db.ts` — **create:** pure `toCausalChain(raw)` shaping helper.
- `apps/web/app/world/page.tsx` — **modify:** add a "+ New citizen" CTA.

---

### Task 1: pg-light citizen profile reads

**Files:**
- Modify: `packages/persistence/src/read.ts` (append)
- Test: `packages/persistence/src/read-citizen.itest.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CitizenProfileView {
    id: string; name: string; occupation: string; age: number;
    traits: Record<string, number>; wealth: number; reputation: number; tier: number; createdDay: number;
  }
  export interface RelationshipView { otherId: string; trust: number; friendship: number; influence: number; }
  export interface GoalView { id: string; kind: string; description: string; progress: number; active: boolean; }
  export async function readCitizen(pool: Pool, id: string): Promise<CitizenProfileView | null>;
  export async function readRelationships(pool: Pool, id: string): Promise<RelationshipView[]>;
  export async function readGoals(pool: Pool, id: string): Promise<GoalView[]>;
  ```

- [ ] **Step 1: Write the failing test** — `packages/persistence/src/read-citizen.itest.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";
import { readCitizen, readRelationships, readGoals } from "./read";

beforeAll(async () => {
  await migrate(); await resetWorld();
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,wealth,reputation,tier,created_day)
    VALUES ('zoe','Zoe','Builder',28,'{"ambition":80}',100,55,2,3)`);
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits) VALUES ('kai','Kai','Trader',40,'{}')`);
  await getPool().query(`INSERT INTO relationships (citizen_id,other_id,trust,friendship,influence) VALUES ('zoe','kai',0.6,0.4,0.5)`);
  await getPool().query(`INSERT INTO goals (id,citizen_id,kind,description,progress,active) VALUES ('g1','zoe','wealth','get rich',0.2,true)`);
});
afterAll(async () => { await closePool(); });

describe("citizen profile reads", () => {
  it("readCitizen returns the profile or null", async () => {
    const c = await readCitizen(getPool(), "zoe");
    expect(c).toMatchObject({ id: "zoe", name: "Zoe", occupation: "Builder", tier: 2, createdDay: 3 });
    expect(c?.traits.ambition).toBe(80);
    expect(await readCitizen(getPool(), "nobody")).toBeNull();
  });
  it("readRelationships returns the citizen's edges", async () => {
    const r = await readRelationships(getPool(), "zoe");
    expect(r).toHaveLength(1);
    expect(r[0]).toMatchObject({ otherId: "kai", trust: 0.6 });
  });
  it("readGoals returns the citizen's goals", async () => {
    const g = await readGoals(getPool(), "zoe");
    expect(g[0]).toMatchObject({ id: "g1", kind: "wealth", description: "get rich", active: true });
  });
});
```

- [ ] **Step 2: Run it — expect FAIL** (`readCitizen is not a function`)

Run: `cd /opt/civilization-0 && pnpm test:it packages/persistence/src/read-citizen.itest.ts`

- [ ] **Step 3: Append to `packages/persistence/src/read.ts`**

```ts
export interface CitizenProfileView {
  id: string; name: string; occupation: string; age: number;
  traits: Record<string, number>; wealth: number; reputation: number; tier: number; createdDay: number;
}
export interface RelationshipView { otherId: string; trust: number; friendship: number; influence: number; }
export interface GoalView { id: string; kind: string; description: string; progress: number; active: boolean; }

export async function readCitizen(pool: Pool, id: string): Promise<CitizenProfileView | null> {
  const r = await pool.query("SELECT * FROM citizens WHERE id = $1", [id]);
  const x = r.rows[0];
  if (!x) return null;
  return { id: x.id, name: x.name, occupation: x.occupation, age: x.age,
    traits: (x.traits ?? {}) as Record<string, number>,
    wealth: Number(x.wealth), reputation: Number(x.reputation), tier: x.tier, createdDay: x.created_day };
}

export async function readRelationships(pool: Pool, id: string): Promise<RelationshipView[]> {
  const r = await pool.query(
    "SELECT other_id, trust, friendship, influence FROM relationships WHERE citizen_id = $1 ORDER BY other_id", [id]);
  return r.rows.map((x) => ({ otherId: x.other_id, trust: Number(x.trust), friendship: Number(x.friendship), influence: Number(x.influence) }));
}

export async function readGoals(pool: Pool, id: string): Promise<GoalView[]> {
  const r = await pool.query(
    "SELECT id, kind, description, progress, active FROM goals WHERE citizen_id = $1 ORDER BY id", [id]);
  return r.rows.map((x) => ({ id: x.id, kind: x.kind, description: x.description, progress: Number(x.progress), active: x.active }));
}
```

- [ ] **Step 4: Run it — expect PASS (all 3).** `cd /opt/civilization-0 && pnpm test:it packages/persistence/src/read-citizen.itest.ts`

- [ ] **Step 5: Gates.** `cd /opt/civilization-0 && grep -nE "^\s*import" packages/persistence/src/read.ts && pnpm test && pnpm typecheck` — read.ts only `pg`; unit green; typecheck clean.

- [ ] **Step 6: (Controller) commit** `feat(persistence): pg-light citizen profile reads` — files `read.ts`, `read-citizen.itest.ts`.

---

### Task 2: pg-light causal-chain read for a citizen's latest decision

**Files:**
- Modify: `packages/persistence/src/read.ts` (append)
- Test: `packages/persistence/src/read-chain.itest.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface RawChainMemory { id: string; summary: string; day: number; weight: number; }
  export interface RawChainBelief { id: string; statement: string; confidence: number; weight: number; }
  export interface RawDecisionChain {
    decisionId: string; action: string; targetId: string | null; reasoning: string;
    provider: string; model: string; verified: boolean;
    memories: RawChainMemory[]; beliefs: RawChainBelief[];
    event: { id: string; day: number; type: string; targetId: string | null } | null;
    rootHash: string | null; txHash: string | null;
  }
  export async function readDecisionChainRaw(pool: Pool, citizenId: string): Promise<RawDecisionChain | null>;
  ```
  Finds the citizen's NEWEST decision (`ORDER BY day DESC, id DESC LIMIT 1`); joins `decision_memories`→`memories`, `decision_beliefs`→`beliefs`, the `events` row (by `decision_id`), and the `traces` row (root/tx). `verified` from `decisions.meta->>'verified'`. Returns null if the citizen has no decisions.

- [ ] **Step 1: Write the failing test** — `packages/persistence/src/read-chain.itest.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";
import { readDecisionChainRaw } from "./read";

beforeAll(async () => {
  await migrate(); await resetWorld();
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits) VALUES ('zoe','Zoe','Builder',28,'{}')`);
  await getPool().query(`INSERT INTO memories (id,citizen_id,day,type,importance,summary) VALUES ('m1','zoe',1,'obs',5,'Met Kai')`);
  await getPool().query(`INSERT INTO beliefs (id,citizen_id,statement,confidence,updated_day) VALUES ('b1','zoe','Trust pays off',0.8,1)`);
  await getPool().query(`INSERT INTO decisions (id,citizen_id,goal_id,day,reasoning,action,target_id,brain_provider,brain_model,meta)
    VALUES ('d1','zoe',null,2,'Back Kai','invest','kai','0xprov','qwen','{"verified":true,"provider":"0xprov","model":"qwen"}')`);
  await getPool().query(`INSERT INTO decision_memories (decision_id,memory_id,weight) VALUES ('d1','m1',0.7)`);
  await getPool().query(`INSERT INTO decision_beliefs (decision_id,belief_id,weight) VALUES ('d1','b1',0.9)`);
  await getPool().query(`INSERT INTO events (id,day,type,actor_id,target_id,decision_id) VALUES ('e1',2,'invest','zoe','kai','d1')`);
  await getPool().query(`INSERT INTO traces (id,decision_id,trace,zg_root_hash,zg_tx_hash) VALUES ('t1','d1','{}','0xroot','0xtx')`);
});
afterAll(async () => { await closePool(); });

it("readDecisionChainRaw assembles the latest decision's full chain", async () => {
  const c = await readDecisionChainRaw(getPool(), "zoe");
  expect(c?.decisionId).toBe("d1");
  expect(c?.action).toBe("invest"); expect(c?.verified).toBe(true);
  expect(c?.memories).toEqual([{ id: "m1", summary: "Met Kai", day: 1, weight: 0.7 }]);
  expect(c?.beliefs[0]).toMatchObject({ id: "b1", weight: 0.9 });
  expect(c?.event).toMatchObject({ id: "e1", type: "invest" });
  expect(c?.rootHash).toBe("0xroot");
});
it("returns null for a citizen with no decisions", async () => {
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits) VALUES ('new','New','Idle',20,'{}')`);
  expect(await readDecisionChainRaw(getPool(), "new")).toBeNull();
});
```

- [ ] **Step 2: Run it — expect FAIL.** `cd /opt/civilization-0 && pnpm test:it packages/persistence/src/read-chain.itest.ts`

- [ ] **Step 3: Append to `packages/persistence/src/read.ts`**

```ts
export interface RawChainMemory { id: string; summary: string; day: number; weight: number; }
export interface RawChainBelief { id: string; statement: string; confidence: number; weight: number; }
export interface RawDecisionChain {
  decisionId: string; action: string; targetId: string | null; reasoning: string;
  provider: string; model: string; verified: boolean;
  memories: RawChainMemory[]; beliefs: RawChainBelief[];
  event: { id: string; day: number; type: string; targetId: string | null } | null;
  rootHash: string | null; txHash: string | null;
}

export async function readDecisionChainRaw(pool: Pool, citizenId: string): Promise<RawDecisionChain | null> {
  const d = await pool.query(
    "SELECT * FROM decisions WHERE citizen_id = $1 ORDER BY day DESC, id DESC LIMIT 1", [citizenId]);
  const dec = d.rows[0];
  if (!dec) return null;
  const mems = await pool.query(
    `SELECT m.id, m.summary, m.day, dm.weight FROM decision_memories dm
     JOIN memories m ON m.id = dm.memory_id WHERE dm.decision_id = $1 ORDER BY dm.weight DESC`, [dec.id]);
  const bels = await pool.query(
    `SELECT b.id, b.statement, b.confidence, db.weight FROM decision_beliefs db
     JOIN beliefs b ON b.id = db.belief_id WHERE db.decision_id = $1 ORDER BY db.weight DESC`, [dec.id]);
  const ev = await pool.query(
    "SELECT id, day, type, target_id FROM events WHERE decision_id = $1 ORDER BY id LIMIT 1", [dec.id]);
  const tr = await pool.query(
    "SELECT zg_root_hash, zg_tx_hash FROM traces WHERE decision_id = $1 ORDER BY id LIMIT 1", [dec.id]);
  const meta = (dec.meta ?? {}) as Record<string, unknown>;
  const e = ev.rows[0];
  return {
    decisionId: dec.id, action: dec.action, targetId: dec.target_id ?? null, reasoning: dec.reasoning,
    provider: (meta.provider as string) ?? dec.brain_provider, model: (meta.model as string) ?? dec.brain_model,
    verified: meta.verified === true,
    memories: mems.rows.map((r) => ({ id: r.id, summary: r.summary, day: r.day, weight: Number(r.weight) })),
    beliefs: bels.rows.map((r) => ({ id: r.id, statement: r.statement, confidence: Number(r.confidence), weight: Number(r.weight) })),
    event: e ? { id: e.id, day: e.day, type: e.type, targetId: e.target_id ?? null } : null,
    rootHash: tr.rows[0]?.zg_root_hash ?? null, txHash: tr.rows[0]?.zg_tx_hash ?? null,
  };
}
```

- [ ] **Step 4: Run it — expect PASS (both).**

- [ ] **Step 5: Gates** (read.ts pg-only; `pnpm test`; `pnpm typecheck`).

- [ ] **Step 6: (Controller) commit** `feat(persistence): pg-light decision causal-chain read` — files `read.ts`, `read-chain.itest.ts`.

---

### Task 3: pg-only `createCitizen` write path

**Files:**
- Create: `packages/persistence/src/citizen-write.ts`
- Modify: `packages/persistence/src/index.ts` (barrel)
- Test: `packages/persistence/src/citizen-write.itest.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface CreateCitizenInput {
    id: string; name: string; occupation: string; age: number;
    traits: Record<string, number>; tier: number; createdDay: number;
    backstory?: string; goal?: string;
  }
  export async function createCitizen(input: CreateCitizenInput): Promise<void>;
  ```
  INSERTs a `citizens` row (wealth 0, reputation 50 defaults). If `backstory` provided, inserts a `memories` row (`type='backstory'`, importance 8, summary=backstory, id=`${id}-backstory`). If `goal` provided, inserts a `goals` row (`id=${id}-goal`, kind='aspiration', description=goal, progress 0, active true). Idempotent via `ON CONFLICT (id) DO NOTHING` on each insert. Imports ONLY `./pool`.

- [ ] **Step 1: Write the failing test** — `packages/persistence/src/citizen-write.itest.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";
import { createCitizen } from "./citizen-write";
import { readCitizen, readGoals } from "./read";

beforeAll(async () => { await migrate(); await resetWorld(); });
afterAll(async () => { await closePool(); });

it("createCitizen inserts a citizen, a backstory memory, and a goal", async () => {
  await createCitizen({ id: "zoe", name: "Zoe", occupation: "Builder", age: 28,
    traits: { ambition: 80, empathy: 40, loyalty: 50, curiosity: 60, discipline: 70, riskTolerance: 55 },
    tier: 2, createdDay: 3, backstory: "Grew up fixing engines.", goal: "Build a workshop." });
  const c = await readCitizen(getPool(), "zoe");
  expect(c).toMatchObject({ id: "zoe", name: "Zoe", tier: 2, reputation: 50 });
  const g = await readGoals(getPool(), "zoe");
  expect(g[0]?.description).toBe("Build a workshop.");
  const m = await getPool().query("SELECT type, summary FROM memories WHERE citizen_id = 'zoe'");
  expect(m.rows[0]).toMatchObject({ type: "backstory", summary: "Grew up fixing engines." });
});
it("is idempotent on repeated id", async () => {
  await createCitizen({ id: "zoe", name: "Zoe2", occupation: "x", age: 1, traits: {}, tier: 1, createdDay: 0 });
  const c = await readCitizen(getPool(), "zoe");
  expect(c?.name).toBe("Zoe"); // original kept (ON CONFLICT DO NOTHING)
});
```

- [ ] **Step 2: Run it — expect FAIL.** `cd /opt/civilization-0 && pnpm test:it packages/persistence/src/citizen-write.itest.ts`

- [ ] **Step 3: Create `packages/persistence/src/citizen-write.ts`**

```ts
import { getPool } from "./pool";

export interface CreateCitizenInput {
  id: string; name: string; occupation: string; age: number;
  traits: Record<string, number>; tier: number; createdDay: number;
  backstory?: string; goal?: string;
}

export async function createCitizen(input: CreateCitizenInput): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO citizens (id,name,occupation,age,traits,wealth,reputation,tier,created_day)
     VALUES ($1,$2,$3,$4,$5,0,50,$6,$7) ON CONFLICT (id) DO NOTHING`,
    [input.id, input.name, input.occupation, input.age, JSON.stringify(input.traits), input.tier, input.createdDay]);
  if (input.backstory) {
    await pool.query(
      `INSERT INTO memories (id,citizen_id,day,type,importance,summary)
       VALUES ($1,$2,$3,'backstory',8,$4) ON CONFLICT (id) DO NOTHING`,
      [`${input.id}-backstory`, input.id, input.createdDay, input.backstory]);
  }
  if (input.goal) {
    await pool.query(
      `INSERT INTO goals (id,citizen_id,kind,description,progress,active)
       VALUES ($1,$2,'aspiration',$3,0,true) ON CONFLICT (id) DO NOTHING`,
      [`${input.id}-goal`, input.id, input.goal]);
  }
}
```

- [ ] **Step 4: Add to `packages/persistence/src/index.ts`:** `export * from "./citizen-write";`

- [ ] **Step 5: Run it — expect PASS (both).**

- [ ] **Step 6: Gates** (read.ts still pg-only; `pnpm test`; `pnpm typecheck`).

- [ ] **Step 7: (Controller) commit** `feat(persistence): pg-only createCitizen write path` — files `citizen-write.ts`, `index.ts`, `citizen-write.itest.ts`.

---

### Task 4: keyless `POST /api/citizens` route

**Files:**
- Create: `apps/web/app/api/citizens/route.ts`

**Interfaces:**
- Consumes: `createCitizen` from `@civ/persistence/src/citizen-write`.
- `POST` accepts JSON `{ name, occupation, age, backstory?, goal?, tier?, traits? }`. Derives `id` = slug of name + short suffix (`name.toLowerCase().replace(/[^a-z0-9]+/g,"-")` + `-` + `Date.now().toString(36).slice(-4)`). Reads the current world day from `world_state` for `createdDay`. Defaults: `tier=1`, `traits` = balanced 50s for any missing trait keys. Returns `{ id }` (201) or `{ error }` (400) on missing name/occupation.

- [ ] **Step 1: Create `apps/web/app/api/citizens/route.ts`**

```ts
import { NextResponse } from "next/server";
import { getPool } from "@civ/persistence/src/pool";
import { createCitizen } from "@civ/persistence/src/citizen-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TRAITS = { ambition: 50, empathy: 50, loyalty: 50, curiosity: 50, discipline: 50, riskTolerance: 50 };

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const occupation = typeof body.occupation === "string" ? body.occupation.trim() : "";
  if (!name || !occupation) return NextResponse.json({ error: "name and occupation are required" }, { status: 400 });

  const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${Date.now().toString(36).slice(-4)}`;
  const age = Number.isFinite(body.age) ? Number(body.age) : 25;
  const tier = body.tier === 1 || body.tier === 2 || body.tier === 3 ? body.tier : 1;
  const traits = { ...DEFAULT_TRAITS, ...(typeof body.traits === "object" && body.traits ? body.traits as Record<string, number> : {}) };
  const backstory = typeof body.backstory === "string" ? body.backstory.trim() : undefined;
  const goal = typeof body.goal === "string" ? body.goal.trim() : undefined;

  try {
    const ws = await getPool().query("SELECT day FROM world_state WHERE id = 1");
    const createdDay = ws.rows[0]?.day ?? 0;
    await createCitizen({ id, name, occupation, age, traits, tier, createdDay, backstory, goal });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Build + import gates.**

Run: `cd /opt/civilization-0 && pnpm -C apps/web build && grep -rE "@civ/(engine|store|memory|brain|beliefs|scheduler)" apps/web/app/api/citizens`
Expected: build SUCCESS, `/api/citizens` appears as a route; grep → NO matches.

- [ ] **Step 3: Typecheck.** `cd /opt/civilization-0 && pnpm typecheck` → clean.

- [ ] **Step 4: (Controller) commit** `feat(web): keyless POST /api/citizens` — file `route.ts`.

---

### Task 5: `/citizens/new` creation form + world CTA

**Files:**
- Create: `apps/web/app/citizens/new/page.tsx`
- Modify: `apps/web/app/world/page.tsx` (add "+ New citizen" CTA in the main footer)

**Interfaces:**
- Client component (`"use client"`). Controlled inputs (name, occupation, age, tier, backstory, goal). On submit, `fetch("/api/citizens", { method:"POST", body: JSON.stringify(...) })`; on 201, `router.push("/citizens/" + id)`; on error, show the message.

- [ ] **Step 1: Create `apps/web/app/citizens/new/page.tsx`**

```tsx
"use client";
import React, { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";

export default function NewCitizenPage() {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", occupation: "", age: "28", tier: "1", backstory: "", goal: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault(); setBusy(true); setError(null);
    try {
      const res = await fetch("/api/citizens", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, age: Number(form.age), tier: Number(form.tier) }) });
      const j = await res.json();
      if (!res.ok) { setError(j.error ?? "failed"); setBusy(false); return; }
      router.push("/citizens/" + j.id);
    } catch (err) { setError(err instanceof Error ? err.message : String(err)); setBusy(false); }
  }

  const field = { padding: "9px 11px", background: "#0d1424", border: "1px solid #2b3a5c", borderRadius: 6, color: "#cdd9f5", width: "100%" } as const;
  return (
    <main className="world-root" style={{ maxWidth: 560 }}>
      <p className="landing-eyebrow">Create a citizen · civilization-0</p>
      <h1 className="world-h1">New citizen</h1>
      <p className="world-empty" style={{ textAlign: "left" }}>They enter the world immediately and start reasoning on 0G when the scheduler next ticks.</p>
      <form onSubmit={submit} style={{ display: "grid", gap: 12, marginTop: 20 }}>
        <input style={field} placeholder="Name" value={form.name} onChange={set("name")} required />
        <input style={field} placeholder="Occupation" value={form.occupation} onChange={set("occupation")} required />
        <div style={{ display: "flex", gap: 12 }}>
          <input style={field} type="number" placeholder="Age" value={form.age} onChange={set("age")} />
          <select style={field} value={form.tier} onChange={set("tier")}>
            <option value="1">Tier 1 (ticks weekly)</option>
            <option value="2">Tier 2 (every 3rd day)</option>
            <option value="3">Tier 3 (daily)</option>
          </select>
        </div>
        <textarea style={{ ...field, minHeight: 70 }} placeholder="Backstory (becomes their first memory)" value={form.backstory} onChange={set("backstory")} />
        <textarea style={{ ...field, minHeight: 50 }} placeholder="Initial goal" value={form.goal} onChange={set("goal")} />
        {error && <p className="world-error-msg mono">{error}</p>}
        <div className="build-cta-row">
          <button type="submit" className="landing-cta" disabled={busy}>{busy ? "Creating…" : "Create citizen"}</button>
          <Link href="/world" className="build-link">← World</Link>
        </div>
      </form>
    </main>
  );
}
```

- [ ] **Step 2: Add a CTA to `apps/web/app/world/page.tsx`** main footer `build-cta-row` (before `← Home`):
```tsx
<Link href="/citizens/new" className="landing-cta">+ New citizen</Link>
```

- [ ] **Step 3: Build.** `cd /opt/civilization-0 && pnpm -C apps/web build` → SUCCESS; `/citizens/new` listed. `pnpm typecheck` clean.

- [ ] **Step 4: (Controller) commit** `feat(web): citizen creation form + world CTA` — files `citizens/new/page.tsx`, `world/page.tsx`.

---

### Task 6: `toCausalChain` shaping helper

**Files:**
- Create: `apps/web/lib/citizen-db.ts`
- Create: `apps/web/lib/citizen-db.test.ts`

**Interfaces:**
- Consumes: `RawDecisionChain` shape (define a structural local input type — do NOT import persistence into a unit lib). Produces: `import type { CausalChainView } from "./types"; export function toCausalChain(raw: RawChainInput): CausalChainView;` where the local `RawChainInput` mirrors `RawDecisionChain` (Task 2). Builds nodes in order memory…→belief…→compute→decision→event→storage, exactly like `lib/world.ts:getCausalChain`.

- [ ] **Step 1: Write the failing test** — `apps/web/lib/citizen-db.test.ts`

```ts
import { describe, it, expect } from "vitest";
import { toCausalChain } from "./citizen-db";

const raw = {
  decisionId: "d1", action: "invest", targetId: "kai", reasoning: "Back Kai",
  provider: "0xprov", model: "qwen", verified: true,
  memories: [{ id: "m1", summary: "Met Kai", day: 1, weight: 0.7 }],
  beliefs: [{ id: "b1", statement: "Trust pays off", confidence: 0.8, weight: 0.9 }],
  event: { id: "e1", day: 2, type: "invest", targetId: "kai" },
  rootHash: "0xroot", txHash: "0xtx",
};

describe("toCausalChain", () => {
  it("orders nodes memory→belief→compute→decision→event→storage", () => {
    const v = toCausalChain(raw);
    expect(v.nodes.map((n) => n.kind)).toEqual(["memory", "belief", "compute", "decision", "event", "storage"]);
    expect(v.rootHash).toBe("0xroot");
    expect(v.nodes[0].weight).toBe(0.7);
    expect(v.nodes[2].detail.verified).toBe("true");
  });
});
```

- [ ] **Step 2: Run it — expect FAIL.** `cd /opt/civilization-0 && pnpm test citizen-db`

- [ ] **Step 3: Create `apps/web/lib/citizen-db.ts`**

```ts
import type { CausalChainView, ChainNode } from "./types";

export interface RawChainInput {
  decisionId: string; action: string; targetId: string | null; reasoning: string;
  provider: string; model: string; verified: boolean;
  memories: { id: string; summary: string; day: number; weight: number }[];
  beliefs: { id: string; statement: string; confidence: number; weight: number }[];
  event: { id: string; day: number; type: string; targetId: string | null } | null;
  rootHash: string | null; txHash: string | null;
}

export function toCausalChain(raw: RawChainInput): CausalChainView {
  const nodes: ChainNode[] = [];
  for (const m of raw.memories)
    nodes.push({ kind: "memory", title: `Memory ${m.id}`, weight: m.weight, detail: { summary: m.summary, weight: m.weight.toFixed(2), day: String(m.day) } });
  for (const b of raw.beliefs)
    nodes.push({ kind: "belief", title: `Belief ${b.id}`, weight: b.weight, detail: { statement: b.statement, weight: b.weight.toFixed(2), confidence: b.confidence.toFixed(2) } });
  nodes.push({ kind: "compute", title: "0G Compute", detail: { provider: raw.provider, model: raw.model, verified: String(raw.verified) } });
  nodes.push({ kind: "decision", title: "Decision", detail: { action: raw.action, target: raw.targetId ?? "—", reasoning: raw.reasoning } });
  nodes.push({ kind: "event", title: "Event", detail: { type: raw.event?.type ?? "—", day: raw.event ? String(raw.event.day) : "—" } });
  nodes.push({ kind: "storage", title: "0G Storage", detail: { rootHash: raw.rootHash ?? "—", txHash: raw.txHash ?? "—" } });
  return { decisionId: raw.decisionId, nodes, rootHash: raw.rootHash ?? undefined, txHash: raw.txHash ?? undefined };
}
```

- [ ] **Step 4: Run it — expect PASS.** `cd /opt/civilization-0 && pnpm test citizen-db`

- [ ] **Step 5: (Controller) commit** `feat(web): toCausalChain shaping helper` — files `citizen-db.ts`, `citizen-db.test.ts`.

---

### Task 7: generalized `/citizens/[id]` DB-backed profile

**Files:**
- Create: `apps/web/app/citizens/[id]/page.tsx`

**Interfaces:**
- Consumes: `getPool` (`@civ/persistence/src/pool`); `readCitizen`, `readRelationships`, `readGoals`, `readDecisionChainRaw`, `searchEvents`, `readNarrative` (`@civ/persistence/src/read`); `toCausalChain` (`../../../lib/citizen-db`); `buildLifeStory` (`../../../lib/lifestory`); `CausalChain` (`../../../components/CausalChain`); `ZeroGBadges` (`../../../components/ZeroGBadges`).
- Keyless server component. `runtime="nodejs"`, `dynamic="force-dynamic"`. `{ params }: { params: { id: string } }`.

- [ ] **Step 1: Create `apps/web/app/citizens/[id]/page.tsx`**

```tsx
import React from "react";
import Link from "next/link";
import { getPool } from "@civ/persistence/src/pool";
import { readCitizen, readRelationships, readGoals, readDecisionChainRaw, searchEvents, readNarrative } from "@civ/persistence/src/read";
import { toCausalChain } from "../../../lib/citizen-db";
import { buildLifeStory } from "../../../lib/lifestory";
import { CausalChain } from "../../../components/CausalChain";
import { ZeroGBadges } from "../../../components/ZeroGBadges";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function CitizenPage({ params }: { params: { id: string } }) {
  const id = params.id;
  const citizen = await readCitizen(getPool(), id);
  if (!citizen) {
    return (
      <main className="world-root">
        <p className="landing-eyebrow">Citizen · civilization-0</p>
        <h1 className="world-h1">Citizen not found</h1>
        <p className="world-empty">No citizen with id <span className="mono">{id}</span>.</p>
        <div className="build-cta-row" style={{ marginTop: 24 }}>
          <Link href="/citizens/new" className="landing-cta">+ New citizen</Link>
          <Link href="/world" className="build-link">← World</Link>
        </div>
      </main>
    );
  }
  const [rels, goals, events, chainRaw, narrative] = await Promise.all([
    readRelationships(getPool(), id), readGoals(getPool(), id),
    searchEvents(getPool(), { actorId: id, limit: 50 }), readDecisionChainRaw(getPool(), id),
    readNarrative(getPool(), id, "life_story"),
  ]);
  const ownEvents = events.filter((e) => e.actorId === id);
  const story = buildLifeStory({ name: citizen.name, occupation: citizen.occupation,
    events: ownEvents.map((e) => ({ day: e.day, type: e.type, targetId: e.targetId, reasoning: e.reasoning })) });
  const chain = chainRaw ? toCausalChain(chainRaw) : null;

  return (
    <main className="world-root">
      <p className="landing-eyebrow">Citizen · civilization-0</p>
      <h1 className="world-h1">{citizen.name}</h1>
      <p className="mono" style={{ color: "#9db4e8" }}>{citizen.occupation} · age {citizen.age} · tier {citizen.tier}</p>

      <div className="world-stat-row">
        <div className="world-stat-card"><span className="label">Reputation</span><span className="world-stat-value mono">{citizen.reputation}</span></div>
        <div className="world-stat-card"><span className="label">Wealth</span><span className="world-stat-value mono">{citizen.wealth}</span></div>
        <div className="world-stat-card"><span className="label">Created day</span><span className="world-stat-value mono">{citizen.createdDay}</span></div>
      </div>

      <section className="world-section">
        <h2 className="world-section-h2">Life story</h2>
        {story.map((line, i) => <p key={i} className="world-empty" style={{ textAlign: "left", margin: "4px 0" }}>{line}</p>)}
        {narrative && (
          <div style={{ marginTop: 12 }}>
            <p className="landing-eyebrow">Narrated on 0G</p>
            <p className="mono" style={{ lineHeight: 1.6 }}>{narrative.text}</p>
            <ZeroGBadges rootHash={narrative.rootHash} verified />
          </div>
        )}
      </section>

      {chain && (
        <section className="world-section">
          <h2 className="world-section-h2">Why {citizen.name}'s latest decision happened</h2>
          <CausalChain chain={chain} />
        </section>
      )}

      <section className="world-section">
        <h2 className="world-section-h2">Goals</h2>
        {goals.length === 0 ? <p className="world-empty">No goals yet.</p> : (
          <ul className="world-event-list">
            {goals.map((g) => <li key={g.id} className="world-event-item"><span className="world-event-type mono">{g.kind}</span><span>{g.description}</span><span className="world-event-id mono">{Math.round(g.progress * 100)}%</span></li>)}
          </ul>
        )}
      </section>

      <section className="world-section">
        <h2 className="world-section-h2">Relationships</h2>
        {rels.length === 0 ? <p className="world-empty">No relationships yet.</p> : (
          <ul className="world-event-list">
            {rels.map((r) => <li key={r.otherId} className="world-event-item">
              <Link href={`/citizens/${r.otherId}`} className="world-id-link mono">{r.otherId}</Link>
              <span className="world-event-id mono">trust {r.trust.toFixed(2)} · friendship {r.friendship.toFixed(2)}</span>
            </li>)}
          </ul>
        )}
      </section>

      <section className="world-section">
        <h2 className="world-section-h2">Timeline</h2>
        {ownEvents.length === 0 ? <p className="world-empty">No events yet — wait for the scheduler to tick.</p> : (
          <ul className="world-event-list">
            {ownEvents.map((e) => <li key={e.id} className="world-event-item">
              <span className="world-event-day label">Day {e.day}</span>
              <span className="world-event-type mono">{e.type}</span>
              {e.targetId && <span className="world-event-actors mono">→ <Link href={`/citizens/${e.targetId}`} className="world-id-link">{e.targetId}</Link></span>}
              <ZeroGBadges rootHash={e.rootHash} verified />
            </li>)}
          </ul>
        )}
      </section>

      <div className="build-cta-row" style={{ marginTop: 40 }}>
        <Link href="/history" className="landing-cta">History →</Link>
        <Link href="/world" className="build-link">← World</Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 2: Build + import gates.**

Run: `cd /opt/civilization-0 && pnpm -C apps/web build && grep -rE "@civ/(engine|store|memory|brain|beliefs|scheduler)" "apps/web/app/citizens/[id]"`
Expected: build SUCCESS, `/citizens/[id]` dynamic route at the ~94 kB baseline; the static `/citizens/ada` ALSO still builds (exact-segment precedence); grep → NO matches.

- [ ] **Step 3: Typecheck + unit.** `cd /opt/civilization-0 && pnpm typecheck && pnpm test` → clean + green.

- [ ] **Step 4: (Controller) commit** `feat(web): generalized DB-backed /citizens/[id] profile` — file `citizens/[id]/page.tsx`.

---

### Task 8: LIVE acceptance — create a citizen, tick, accrue a 0G decision (controller-run)

**Files:** none (verification task; optionally a tiny `packages/scheduler/scripts/` note). The web dev server is not needed — exercise the API path via a direct `createCitizen` + scheduler day, then verify the DB + page render.

- [ ] **Step 1 (Controller): create a citizen via the pg-only write path** (proves the same code the API route calls)

Run: `cd /opt/civilization-0 && pnpm -C packages/persistence exec tsx --env-file=/opt/civilization-0/.env -e "import('./src/citizen-write.ts').then(async m=>{await m.createCitizen({id:'zoe-demo',name:'Zoe',occupation:'Builder',age:28,traits:{ambition:85,empathy:40,loyalty:50,curiosity:65,discipline:70,riskTolerance:60},tier:3,createdDay:(await (await import('./src/pool.ts')).getPool().query('SELECT day FROM world_state WHERE id=1')).rows[0].day,backstory:'Grew up fixing engines in a coastal town.',goal:'Build a workshop that outlasts her.'});console.log('created zoe-demo');process.exit(0)})"`
Expected: prints `created zoe-demo`. (If inline import is awkward, instead briefly add a one-off `scripts/create-demo-citizen.ts` and run it — but do not commit that script.)

- [ ] **Step 2 (Controller): run one live scheduler day** (spends OG; zoe-demo is tier-3 so ticks daily)

Run: `cd /opt/civilization-0/packages/scheduler && set -a && . /opt/civilization-0/.env && set +a && pnpm exec tsx --conditions require scripts/run-scheduler.ts --days 1`
Expected: `Day N ticked: [… zoe-demo …]`, OG spent recorded.

- [ ] **Step 3 (Controller): verify acceptance in the DB**

Run: `cd /opt/civilization-0 && PGPASSWORD=civ-local psql -h 127.0.0.1 -U civ -d civ0 -tAc "SELECT (SELECT count(*) FROM decisions WHERE citizen_id='zoe-demo') decisions, (SELECT count(*) FROM events WHERE actor_id='zoe-demo') events, (SELECT meta->>'verified' FROM decisions WHERE citizen_id='zoe-demo' ORDER BY day DESC LIMIT 1) verified;"`
Expected: `decisions ≥ 1`, `events ≥ 1`, `verified = true` (a 0G-reasoned, verified decision accrued). The `/citizens/zoe-demo` page now renders the profile, timeline, life story, and the causal chain for that decision.

- [ ] **Step 4: Record** the OG spent + the verified decision in the Task 8 report. No commit (no new tracked files).

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- Citizen creation form (name, traits, occupation, backstory, goal) → Task 5 form + Task 4 API + Task 3 write path. ✓ (traits default balanced; tier selectable.)
- API route inserts into the persistent store → Task 4 (`POST /api/citizens` → `createCitizen`). ✓
- Enrolls in the scheduler → automatic: `run-scheduler.ts` selects all citizens from the DB (no extra code). Noted in Task 8. ✓
- Generalized Citizen Profile for any id (profile, timeline, relationships, goals, life story, explainability) → Task 7 page using Tasks 1/2/6 + Slice-3 `buildLifeStory`/`readNarrative` + reused `<CausalChain>`/`<ZeroGBadges>`. ✓
- Acceptance (create → appears → after days accrues memories/relationships/≥1 0G decision) → Task 8 live proof. ✓ (memories: backstory seeded at create + scheduler-accrued; ≥1 verified 0G decision asserted.)

**2. Placeholder scan:** none — every step has concrete code/commands.

**3. Type consistency:** `RawDecisionChain` (Task 2) is mirrored field-for-field by `RawChainInput` (Task 6) and consumed by Task 7. `CitizenProfileView`/`RelationshipView`/`GoalView` (Task 1) consumed in Task 7. `CreateCitizenInput`/`createCitizen` (Task 3) consumed by Task 4. `toCausalChain → CausalChainView` (Task 6) feeds the existing `<CausalChain chain=…>` (verified prop name in `apps/web/components/CausalChain.tsx`).

**Decisions (non-destructive):** (a) the static `/citizens/ada` snapshot showcase is preserved; `/citizens/[id]` serves all other ids via Next exact-segment precedence. (b) Citizen creation is a keyless Postgres write (no 0G key in web); scheduler auto-enrolls. (c) Explainability on the DB page reuses the Slice-4A `<CausalChain>` component fed by pg-light reads.

## Execution Handoff

Subagent-driven (same as Slices 1–3): fresh implementer per task; controller verifies + commits (subagent git is sandbox-denied). Tasks 1, 2, 3 touch `read.ts`/persistence sequentially; Task 6 (web lib) is independent and may run parallel to Task 4/5. Controller runs the Task 8 live OG step. Final: whole-branch review → finishing-a-development-branch (merge to master) → memory update.
