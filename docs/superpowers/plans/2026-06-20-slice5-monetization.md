# Slice 5 — Monetization scaffolding (auth + worlds + tiers + Research API) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add user accounts, public/private world ownership, Free/Pro/Research plan tiers with population limits, and a Research-tier provenance API that exports the 0G-reasoned decision dataset — completing V1.

**Architecture:** Auth + ownership live entirely in **pg-only write paths** (`auth-write.ts`, `world-write.ts`, imports only `./pool` + Node `crypto`) and the **pg-light read path** (`read.ts`, imports only `pg`), so keyless Next routes/pages can deep-import them without pulling the engine/store graph or the 0G key into the bundle. Passwords use Node `crypto.scryptSync`; sessions are a random token in a `sessions` table + an httpOnly cookie; Research API keys are sha256-hashed on `users`. The single existing simulation becomes the seeded public **`genesis`** world; `citizens.world_id` (default `'genesis'`, NO FK) scopes ownership/caps without the frozen engine ever seeing it (`loadContext` selects named columns). Engine (`packages/engine`) and WorldStore (`packages/store`) stay **byte-for-byte unchanged**.

**Tech Stack:** pnpm 9.15.4 / Node 20 (`crypto` builtin), TypeScript ESM monorepo, Vitest (`*.test.ts` + `*.itest.ts`), Postgres 16 + pgvector, Next.js 14.2.5 App Router (`next/headers` cookies, Route Handlers), real 0G.

## Global Constraints

- **Engine + WorldStore UNCHANGED:** `git diff --stat <base>..HEAD -- packages/engine packages/store` EMPTY at every task. Never edit `packages/engine/src` or `packages/store/src`.
- **pg-light `read.ts`:** imports ONLY `pg`. NO `@civ/*` imports. Inline view interfaces. Verify: `grep -nE "^\s*import" packages/persistence/src/read.ts` → only `pg`.
- **pg-only write paths:** `auth-write.ts` / `world-write.ts` import ONLY `./pool` and Node builtins (`crypto`). No `@civ/store`/`@civ/engine`/`@civ/memory`.
- **Keyless web:** Next pages, components, API routes hold NO `ZG_PRIVATE_KEY` and NO 0G write path. Deep-import `@civ/persistence/src/{pool,read,auth-write,world-write,citizen-write}` only — never engine/store/memory/brain/scheduler.
- **Secrets:** NEVER print/echo/log/commit `ZG_PRIVATE_KEY`, `.env`, passwords, raw API keys, or session tokens beyond what a response must return once. Live scripts log wallet ADDRESS + balances + root hashes only.
- **Cookies:** session cookie name `civ_session`; flags `{ httpOnly: true, sameSite: "lax", path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60*60*24*7 }`. (Demo runs over http on the tailnet, so `secure` must be env-gated, NOT hardcoded true.)
- **Tests:** unit `*.test.ts` network-free; DB tests `*.itest.ts` via `cd /opt/civilization-0 && pnpm test:it [path]` only (NEVER `pnpm dlx`). Auth/world itests clean their OWN rows in `beforeAll` (`DELETE FROM sessions; DELETE FROM api… ; DELETE FROM users WHERE email LIKE 'itest-%'`) — do NOT add users/sessions/worlds to `resetWorld`'s `WORLD_TABLES` (the seeded `genesis` world must survive `resetWorld`).
- **Web test/build:** NO `pnpm -C apps/web test` script — unit tests run from repo root via `pnpm test [filter]`; build via `pnpm -C apps/web build`. Build writes the shared `.next` dir, so build-gated tasks run SEQUENTIALLY (never two concurrent builds).
- **Compute scripts:** `tsx --conditions require`. Live 0G runs spend OG — controller-only, cost-gated.
- **Commits:** NO `Co-Authored-By`. Commit only a task's files. **Subagents' Bash git is sandbox-denied** — they do ALL work + gates, STAGE NOTHING; the controller verifies + commits.
- **Shell:** cwd resets between bash calls — always prefix `cd /opt/civilization-0 && `.
- **Backward-compat:** the anon `/citizens/new` → genesis flow from Slice 4 keeps working (genesis is public, no auth needed to add to it). Auth gates only PRIVATE world creation + the Research API.

---

## File Structure

- `packages/persistence/src/schema.sql` — **modify:** add `users`, `sessions`, `worlds` tables; `citizens.world_id` column; seed `genesis` world.
- `packages/persistence/src/auth-write.ts` — **create:** `createUser`, `verifyLogin`, `createSession`, `readSession`, `deleteSession`, `setPlan`, `mintApiKey`, `userByApiKey` (pg-only + crypto).
- `packages/persistence/src/world-write.ts` — **create:** `PLAN_LIMITS`, `createWorld`, `worldPopulation`.
- `packages/persistence/src/read.ts` — **modify:** `readWorlds`, `readWorld`, `exportProvenance`.
- `packages/persistence/src/index.ts` — **modify:** barrel exports.
- `apps/web/lib/auth.ts` — **create:** `getCurrentUser()` (reads cookie → session → user).
- `apps/web/app/api/auth/{signup,login,logout}/route.ts` — **create.**
- `apps/web/app/api/worlds/route.ts` — **create:** POST create world.
- `apps/web/app/api/citizens/route.ts` — **modify:** worldId + ownership + cap gating.
- `apps/web/app/api/provenance/records/route.ts` — **create:** Research API-key-gated export.
- `apps/web/app/{signup,login,account,worlds,pricing}/page.tsx` — **create.**
- `apps/web/app/world/page.tsx` — **modify:** nav links (Account/Pricing).

---

### Task 1: schema — users, sessions, worlds, citizens.world_id, genesis seed

**Files:** Modify `packages/persistence/src/schema.sql`; Test `packages/persistence/src/auth-schema.itest.ts`.

**Interfaces — Produces:**
- `users (id TEXT PK, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL, plan TEXT NOT NULL DEFAULT 'free', api_key_hash TEXT, created_at TIMESTAMPTZ DEFAULT now())`
- `sessions (token TEXT PK, user_id TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL)`
- `worlds (id TEXT PK, name TEXT NOT NULL, owner_id TEXT, visibility TEXT NOT NULL DEFAULT 'public', population_cap INT NOT NULL DEFAULT 100, created_at TIMESTAMPTZ DEFAULT now())`
- `citizens.world_id TEXT NOT NULL DEFAULT 'genesis'` (no FK)
- seeded row `worlds('genesis','Genesis',NULL,'public',1000)`

- [ ] **Step 1: Write the failing test** — `packages/persistence/src/auth-schema.itest.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";

beforeAll(async () => { await migrate(); });
afterAll(async () => { await closePool(); });

describe("auth/world schema", () => {
  it("has a seeded public genesis world and a world_id column on citizens", async () => {
    const w = await getPool().query("SELECT id, visibility, population_cap FROM worlds WHERE id = 'genesis'");
    expect(w.rows[0]).toMatchObject({ id: "genesis", visibility: "public", population_cap: 1000 });
    const col = await getPool().query("SELECT column_default FROM information_schema.columns WHERE table_name='citizens' AND column_name='world_id'");
    expect(col.rows[0].column_default).toContain("genesis");
  });
  it("enforces unique user email", async () => {
    await getPool().query("DELETE FROM users WHERE email = 'itest-uniq@x.io'");
    await getPool().query("INSERT INTO users (id,email,password_hash) VALUES ('u1','itest-uniq@x.io','h')");
    await expect(getPool().query("INSERT INTO users (id,email,password_hash) VALUES ('u2','itest-uniq@x.io','h')")).rejects.toThrow();
    await getPool().query("DELETE FROM users WHERE email = 'itest-uniq@x.io'");
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (`relation "worlds" does not exist`). `cd /opt/civilization-0 && pnpm test:it packages/persistence/src/auth-schema.itest.ts`

- [ ] **Step 3: Append to `packages/persistence/src/schema.sql`** (after the `narratives` block)

```sql
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY, email TEXT UNIQUE NOT NULL, password_hash TEXT NOT NULL,
  plan TEXT NOT NULL DEFAULT 'free', api_key_hash TEXT, created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE TABLE IF NOT EXISTS sessions (
  token TEXT PRIMARY KEY, user_id TEXT NOT NULL, expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS sessions_user_idx ON sessions (user_id);
CREATE TABLE IF NOT EXISTS worlds (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, owner_id TEXT,
  visibility TEXT NOT NULL DEFAULT 'public', population_cap INT NOT NULL DEFAULT 100,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO worlds (id,name,owner_id,visibility,population_cap)
  VALUES ('genesis','Genesis',NULL,'public',1000) ON CONFLICT (id) DO NOTHING;
ALTER TABLE citizens ADD COLUMN IF NOT EXISTS world_id TEXT NOT NULL DEFAULT 'genesis';
CREATE INDEX IF NOT EXISTS citizens_world_idx ON citizens (world_id);
```

- [ ] **Step 4: Run — expect PASS (both).**

- [ ] **Step 5: Gates** — `pnpm test`, `pnpm typecheck`, engine/store diff empty. (Do NOT touch `testutil.ts` — auth tables stay out of `resetWorld`.)

- [ ] **Step 6: (Controller) commit** `feat(persistence): auth + worlds schema + genesis seed` — files `schema.sql`, `auth-schema.itest.ts`.

---

### Task 2: auth write path (scrypt, sessions, API keys)

**Files:** Create `packages/persistence/src/auth-write.ts`; Modify `index.ts`; Test `packages/persistence/src/auth-write.itest.ts`.

**Interfaces — Produces:**
```ts
export type Plan = "free" | "pro" | "research";
export interface User { id: string; email: string; plan: Plan; hasApiKey: boolean; }
export async function createUser(email: string, password: string): Promise<User>; // throws if email taken
export async function verifyLogin(email: string, password: string): Promise<User | null>;
export async function createSession(userId: string): Promise<string>; // returns token
export async function readSession(token: string): Promise<User | null>; // null if missing/expired
export async function deleteSession(token: string): Promise<void>;
export async function setPlan(userId: string, plan: Plan): Promise<void>;
export async function mintApiKey(userId: string): Promise<string>; // returns RAW key once; stores sha256
export async function userByApiKey(rawKey: string): Promise<User | null>;
```
Implementation notes: `id` = `randomBytes(8).toString("hex")`; password hash `"${salt}:${scryptSync(pw,salt,64).toString('hex')}"` with `salt=randomBytes(16).toString('hex')`; verify with `timingSafeEqual`; session token `randomBytes(32).toString("hex")`, `expires_at = now()+7d`; API key `"civ_"+randomBytes(24).toString("hex")`, stored as `sha256(rawKey)`; `userByApiKey` hashes input and looks up `api_key_hash`. Imports ONLY `./pool` + `node:crypto`.

- [ ] **Step 1: Write the failing test** — `packages/persistence/src/auth-write.itest.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { createUser, verifyLogin, createSession, readSession, deleteSession, setPlan, mintApiKey, userByApiKey } from "./auth-write";

beforeAll(async () => { await migrate(); await getPool().query("DELETE FROM sessions"); await getPool().query("DELETE FROM users WHERE email LIKE 'itest-%'"); });
afterAll(async () => { await getPool().query("DELETE FROM sessions"); await getPool().query("DELETE FROM users WHERE email LIKE 'itest-%'"); await closePool(); });

describe("auth-write", () => {
  it("creates a user, verifies password, rejects wrong password and dup email", async () => {
    const u = await createUser("itest-a@x.io", "s3cret!");
    expect(u).toMatchObject({ email: "itest-a@x.io", plan: "free", hasApiKey: false });
    expect(await verifyLogin("itest-a@x.io", "s3cret!")).toMatchObject({ id: u.id });
    expect(await verifyLogin("itest-a@x.io", "wrong")).toBeNull();
    await expect(createUser("itest-a@x.io", "x")).rejects.toThrow();
  });
  it("sessions round-trip and expire on delete", async () => {
    const u = await createUser("itest-b@x.io", "pw");
    const t = await createSession(u.id);
    expect((await readSession(t))?.id).toBe(u.id);
    await deleteSession(t);
    expect(await readSession(t)).toBeNull();
    expect(await readSession("nope")).toBeNull();
  });
  it("plan + API key: research key resolves to the user", async () => {
    const u = await createUser("itest-c@x.io", "pw");
    await setPlan(u.id, "research");
    const key = await mintApiKey(u.id);
    expect(key.startsWith("civ_")).toBe(true);
    const back = await userByApiKey(key);
    expect(back).toMatchObject({ id: u.id, plan: "research", hasApiKey: true });
    expect(await userByApiKey("civ_bogus")).toBeNull();
  });
});
```

- [ ] **Step 2: Run — expect FAIL.** `cd /opt/civilization-0 && pnpm test:it packages/persistence/src/auth-write.itest.ts`

- [ ] **Step 3: Create `packages/persistence/src/auth-write.ts`**

```ts
import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { getPool } from "./pool";

export type Plan = "free" | "pro" | "research";
export interface User { id: string; email: string; plan: Plan; hasApiKey: boolean; }

function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}
function checkPassword(pw: string, stored: string): boolean {
  const [salt, h] = stored.split(":");
  if (!salt || !h) return false;
  const expected = Buffer.from(h, "hex");
  const actual = scryptSync(pw, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const toUser = (r: any): User => ({ id: r.id, email: r.email, plan: r.plan as Plan, hasApiKey: !!r.api_key_hash });

export async function createUser(email: string, password: string): Promise<User> {
  const id = randomBytes(8).toString("hex");
  const r = await getPool().query(
    "INSERT INTO users (id,email,password_hash) VALUES ($1,$2,$3) RETURNING id,email,plan,api_key_hash",
    [id, email.toLowerCase().trim(), hashPassword(password)]);
  return toUser(r.rows[0]);
}
export async function verifyLogin(email: string, password: string): Promise<User | null> {
  const r = await getPool().query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
  const u = r.rows[0];
  if (!u || !checkPassword(password, u.password_hash)) return null;
  return toUser(u);
}
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await getPool().query("INSERT INTO sessions (token,user_id,expires_at) VALUES ($1,$2, now() + interval '7 days')", [token, userId]);
  return token;
}
export async function readSession(token: string): Promise<User | null> {
  const r = await getPool().query(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1 AND s.expires_at > now()`, [token]);
  return r.rows[0] ? toUser(r.rows[0]) : null;
}
export async function deleteSession(token: string): Promise<void> {
  await getPool().query("DELETE FROM sessions WHERE token = $1", [token]);
}
export async function setPlan(userId: string, plan: Plan): Promise<void> {
  await getPool().query("UPDATE users SET plan = $2 WHERE id = $1", [userId, plan]);
}
export async function mintApiKey(userId: string): Promise<string> {
  const raw = "civ_" + randomBytes(24).toString("hex");
  await getPool().query("UPDATE users SET api_key_hash = $2 WHERE id = $1", [userId, sha256(raw)]);
  return raw;
}
export async function userByApiKey(rawKey: string): Promise<User | null> {
  const r = await getPool().query("SELECT * FROM users WHERE api_key_hash = $1", [sha256(rawKey)]);
  return r.rows[0] ? toUser(r.rows[0]) : null;
}
```

- [ ] **Step 4: Add to `index.ts`:** `export * from "./auth-write";`

- [ ] **Step 5: Run — expect PASS (all 3).** Gates: read.ts still pg-only; `pnpm test`; `pnpm typecheck`.

- [ ] **Step 6: (Controller) commit** `feat(persistence): auth write path (scrypt + sessions + api keys)` — files `auth-write.ts`, `index.ts`, `auth-write.itest.ts`.

---

### Task 3: world write path + plan limits

**Files:** Create `packages/persistence/src/world-write.ts`; Modify `index.ts`; Test `packages/persistence/src/world-write.itest.ts`.

**Interfaces — Produces:**
```ts
export interface PlanLimit { populationCap: number; allowPrivate: boolean; maxWorlds: number; api: boolean; }
export const PLAN_LIMITS: Record<"free"|"pro"|"research", PlanLimit>;
export interface CreateWorldInput { ownerId: string; ownerPlan: "free"|"pro"|"research"; name: string; visibility: "public"|"private"; }
export async function createWorld(input: CreateWorldInput): Promise<{ id: string }>; // throws on limit violations
export async function worldPopulation(worldId: string): Promise<number>;
```
Limits: `free {cap 10, allowPrivate false, maxWorlds 1, api false}`, `pro {cap 100, allowPrivate true, maxWorlds 10, api false}`, `research {cap 100, allowPrivate true, maxWorlds 25, api true}`. `createWorld` rejects: private when `!allowPrivate`; creating beyond `maxWorlds` owned. id = `randomBytes(6).toString("hex")`; population_cap = the plan cap. `worldPopulation` = `COUNT(*) FROM citizens WHERE world_id=$1`. Imports ONLY `./pool` + `node:crypto`.

- [ ] **Step 1: Write the failing test** — `packages/persistence/src/world-write.itest.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { createWorld, worldPopulation, PLAN_LIMITS } from "./world-write";

beforeAll(async () => { await migrate(); await getPool().query("DELETE FROM worlds WHERE owner_id LIKE 'itest-%'"); });
afterAll(async () => { await getPool().query("DELETE FROM worlds WHERE owner_id LIKE 'itest-%'"); await closePool(); });

describe("world-write", () => {
  it("a free user cannot create a private world", async () => {
    await expect(createWorld({ ownerId: "itest-free", ownerPlan: "free", name: "W", visibility: "private" })).rejects.toThrow();
  });
  it("a pro user creates a private world with the pro population cap", async () => {
    const { id } = await createWorld({ ownerId: "itest-pro", ownerPlan: "pro", name: "Atlas", visibility: "private" });
    const r = await getPool().query("SELECT visibility, population_cap FROM worlds WHERE id = $1", [id]);
    expect(r.rows[0]).toMatchObject({ visibility: "private", population_cap: PLAN_LIMITS.pro.populationCap });
    expect(await worldPopulation(id)).toBe(0);
  });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Create `packages/persistence/src/world-write.ts`**

```ts
import { randomBytes } from "node:crypto";
import { getPool } from "./pool";

export interface PlanLimit { populationCap: number; allowPrivate: boolean; maxWorlds: number; api: boolean; }
export const PLAN_LIMITS: Record<"free" | "pro" | "research", PlanLimit> = {
  free: { populationCap: 10, allowPrivate: false, maxWorlds: 1, api: false },
  pro: { populationCap: 100, allowPrivate: true, maxWorlds: 10, api: false },
  research: { populationCap: 100, allowPrivate: true, maxWorlds: 25, api: true },
};

export interface CreateWorldInput { ownerId: string; ownerPlan: "free" | "pro" | "research"; name: string; visibility: "public" | "private"; }

export async function createWorld(input: CreateWorldInput): Promise<{ id: string }> {
  const limit = PLAN_LIMITS[input.ownerPlan];
  if (input.visibility === "private" && !limit.allowPrivate) throw new Error("Your plan does not allow private worlds. Upgrade to Pro.");
  const owned = await getPool().query("SELECT COUNT(*)::int c FROM worlds WHERE owner_id = $1", [input.ownerId]);
  if (owned.rows[0].c >= limit.maxWorlds) throw new Error(`Plan limit reached (${limit.maxWorlds} worlds).`);
  const id = randomBytes(6).toString("hex");
  await getPool().query(
    "INSERT INTO worlds (id,name,owner_id,visibility,population_cap) VALUES ($1,$2,$3,$4,$5)",
    [id, input.name, input.ownerId, input.visibility, limit.populationCap]);
  return { id };
}
export async function worldPopulation(worldId: string): Promise<number> {
  const r = await getPool().query("SELECT COUNT(*)::int c FROM citizens WHERE world_id = $1", [worldId]);
  return r.rows[0].c;
}
```

- [ ] **Step 4: Add to `index.ts`:** `export * from "./world-write";`

- [ ] **Step 5: Run — expect PASS (both).** Gates: `pnpm test`; `pnpm typecheck`; engine/store empty.

- [ ] **Step 6: (Controller) commit** `feat(persistence): world write path + plan limits` — files `world-write.ts`, `index.ts`, `world-write.itest.ts`.

---

### Task 4: provenance export read (pg-light) + world reads

**Files:** Modify `packages/persistence/src/read.ts` (append); Test `packages/persistence/src/read-provenance.itest.ts`.

**Interfaces — Produces:**
```ts
export interface WorldRow { id: string; name: string; ownerId: string | null; visibility: string; populationCap: number; population: number; }
export async function readWorlds(pool: Pool, ownerId?: string): Promise<WorldRow[]>; // public worlds + (if ownerId) that owner's private worlds
export async function readWorld(pool: Pool, id: string): Promise<WorldRow | null>;
export interface ProvenanceExportRecord {
  decisionId: string; agent: string; worldId: string; day: number;
  decision: { action: string; targetId: string | null; reasoning: string };
  drivers: { memories: { id: string; weight: number }[]; beliefs: { id: string; weight: number }[] };
  verified: boolean; rootHash: string | null; verifyUrl: string | null;
}
export async function exportProvenance(pool: Pool, filters: { worldId?: string; citizenId?: string; limit?: number }): Promise<ProvenanceExportRecord[]>;
```
`exportProvenance` joins `decisions` ← `citizens.world_id`, gathers `decision_memories`/`decision_beliefs` weights and the `traces.zg_root_hash`; `verified` from `decisions.meta->>'verified'`; `verifyUrl` = `rootHash ? "/verify/"+rootHash : null`. Ordered `day DESC, id DESC`, default limit 100.

- [ ] **Step 1: Write the failing test** — `packages/persistence/src/read-provenance.itest.ts`

```ts
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";
import { readWorlds, exportProvenance } from "./read";

beforeAll(async () => {
  await migrate(); await resetWorld();
  await getPool().query("DELETE FROM worlds WHERE id = 'w-it'");
  await getPool().query("INSERT INTO worlds (id,name,owner_id,visibility,population_cap) VALUES ('w-it','It','o1','private',100)");
  await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,world_id) VALUES ('zoe','Zoe','Builder',28,'{}','w-it')`);
  await getPool().query(`INSERT INTO decisions (id,citizen_id,goal_id,day,reasoning,action,target_id,brain_provider,brain_model,meta)
    VALUES ('d1','zoe',null,2,'Back Kai','invest','kai','p','m','{"verified":true}')`);
  await getPool().query(`INSERT INTO decision_memories (decision_id,memory_id,weight) VALUES ('d1','m1',0.7)`);
  await getPool().query(`INSERT INTO traces (id,decision_id,trace,zg_root_hash) VALUES ('t1','d1','{}','0xabc')`);
});
afterAll(async () => { await getPool().query("DELETE FROM worlds WHERE id = 'w-it'"); await closePool(); });

it("readWorlds returns public worlds plus the owner's private worlds with population", async () => {
  const pub = await readWorlds(getPool());
  expect(pub.find((w) => w.id === "genesis")).toBeTruthy();
  expect(pub.find((w) => w.id === "w-it")).toBeFalsy(); // private, not owned in this call
  const owned = await readWorlds(getPool(), "o1");
  const mine = owned.find((w) => w.id === "w-it");
  expect(mine).toMatchObject({ visibility: "private", population: 1 });
});
it("exportProvenance returns 0G-reasoned records with drivers + verifyUrl", async () => {
  const recs = await exportProvenance(getPool(), { worldId: "w-it" });
  expect(recs[0]).toMatchObject({ decisionId: "d1", agent: "zoe", verified: true, rootHash: "0xabc", verifyUrl: "/verify/0xabc" });
  expect(recs[0].decision.action).toBe("invest");
  expect(recs[0].drivers.memories[0]).toMatchObject({ id: "m1", weight: 0.7 });
});
```

- [ ] **Step 2: Run — expect FAIL.**

- [ ] **Step 3: Append to `packages/persistence/src/read.ts`**

```ts
export interface WorldRow { id: string; name: string; ownerId: string | null; visibility: string; populationCap: number; population: number; }

export async function readWorlds(pool: Pool, ownerId?: string): Promise<WorldRow[]> {
  const r = await pool.query(
    `SELECT w.id, w.name, w.owner_id, w.visibility, w.population_cap,
       (SELECT COUNT(*)::int FROM citizens c WHERE c.world_id = w.id) AS population
     FROM worlds w
     WHERE w.visibility = 'public' OR w.owner_id = $1
     ORDER BY (w.id = 'genesis') DESC, w.created_at`, [ownerId ?? null]);
  return r.rows.map((x) => ({ id: x.id, name: x.name, ownerId: x.owner_id ?? null, visibility: x.visibility, populationCap: x.population_cap, population: x.population }));
}
export async function readWorld(pool: Pool, id: string): Promise<WorldRow | null> {
  const r = await pool.query(
    `SELECT w.*, (SELECT COUNT(*)::int FROM citizens c WHERE c.world_id = w.id) AS population FROM worlds w WHERE w.id = $1`, [id]);
  const x = r.rows[0];
  return x ? { id: x.id, name: x.name, ownerId: x.owner_id ?? null, visibility: x.visibility, populationCap: x.population_cap, population: x.population } : null;
}

export interface ProvenanceExportRecord {
  decisionId: string; agent: string; worldId: string; day: number;
  decision: { action: string; targetId: string | null; reasoning: string };
  drivers: { memories: { id: string; weight: number }[]; beliefs: { id: string; weight: number }[] };
  verified: boolean; rootHash: string | null; verifyUrl: string | null;
}
export async function exportProvenance(pool: Pool, filters: { worldId?: string; citizenId?: string; limit?: number }): Promise<ProvenanceExportRecord[]> {
  const where: string[] = []; const params: unknown[] = [];
  if (filters.worldId) { params.push(filters.worldId); where.push(`c.world_id = $${params.length}`); }
  if (filters.citizenId) { params.push(filters.citizenId); where.push(`d.citizen_id = $${params.length}`); }
  params.push(filters.limit ?? 100); const lim = params.length;
  const r = await pool.query(
    `SELECT d.id, d.citizen_id, c.world_id, d.day, d.action, d.target_id, d.reasoning, d.meta, t.zg_root_hash
     FROM decisions d JOIN citizens c ON c.id = d.citizen_id
     LEFT JOIN traces t ON t.decision_id = d.id
     ${where.length ? "WHERE " + where.join(" AND ") : ""}
     ORDER BY d.day DESC, d.id DESC LIMIT $${lim}`, params);
  const out: ProvenanceExportRecord[] = [];
  for (const x of r.rows) {
    const mems = await pool.query("SELECT memory_id, weight FROM decision_memories WHERE decision_id = $1 ORDER BY weight DESC", [x.id]);
    const bels = await pool.query("SELECT belief_id, weight FROM decision_beliefs WHERE decision_id = $1 ORDER BY weight DESC", [x.id]);
    const root = x.zg_root_hash ?? null;
    out.push({
      decisionId: x.id, agent: x.citizen_id, worldId: x.world_id, day: x.day,
      decision: { action: x.action, targetId: x.target_id ?? null, reasoning: x.reasoning },
      drivers: { memories: mems.rows.map((m) => ({ id: m.memory_id, weight: Number(m.weight) })), beliefs: bels.rows.map((b) => ({ id: b.belief_id, weight: Number(b.weight) })) },
      verified: (x.meta ?? {}).verified === true, rootHash: root, verifyUrl: root ? "/verify/" + root : null,
    });
  }
  return out;
}
```

- [ ] **Step 4: Run — expect PASS (both).** Gates: read.ts pg-only; `pnpm test`; `pnpm typecheck`.

- [ ] **Step 5: (Controller) commit** `feat(persistence): world reads + provenance export projection` — files `read.ts`, `read-provenance.itest.ts`.

---

### Task 5: auth API routes + getCurrentUser helper

**Files:** Create `apps/web/lib/auth.ts`, `apps/web/app/api/auth/signup/route.ts`, `.../login/route.ts`, `.../logout/route.ts`.

**Interfaces:** `apps/web/lib/auth.ts` exports `getCurrentUser(): Promise<User | null>` (reads `cookies().get("civ_session")` via `next/headers`, calls `readSession`). Each route deep-imports `@civ/persistence/src/auth-write`. Signup/login set the `civ_session` cookie (flags per Global Constraints) on the `NextResponse` and return `{ user }`; logout clears it.

- [ ] **Step 1: Create `apps/web/lib/auth.ts`**

```ts
import { cookies } from "next/headers";
import { readSession, type User } from "@civ/persistence/src/auth-write";

export async function getCurrentUser(): Promise<User | null> {
  const token = cookies().get("civ_session")?.value;
  if (!token) return null;
  return readSession(token);
}
```

- [ ] **Step 2: Create the three routes.** Common cookie opts:
`const COOKIE = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60*60*24*7 };`

`apps/web/app/api/auth/signup/route.ts`:
```ts
import { NextResponse } from "next/server";
import { createUser, createSession } from "@civ/persistence/src/auth-write";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
const COOKIE = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.NODE_ENV === "production", maxAge: 60 * 60 * 24 * 7 };
export async function POST(req: Request) {
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const email = typeof b.email === "string" ? b.email.trim() : ""; const password = typeof b.password === "string" ? b.password : "";
  if (!email || password.length < 6) return NextResponse.json({ error: "email and a 6+ char password are required" }, { status: 400 });
  try {
    const user = await createUser(email, password);
    const token = await createSession(user.id);
    const res = NextResponse.json({ user }, { status: 201 });
    res.cookies.set("civ_session", token, COOKIE);
    return res;
  } catch (e: any) {
    if (String(e?.message ?? e).includes("duplicate")) return NextResponse.json({ error: "email already registered" }, { status: 409 });
    return NextResponse.json({ error: "signup failed" }, { status: 500 });
  }
}
```
`apps/web/app/api/auth/login/route.ts`: same imports plus `verifyLogin`; on success set cookie + `{ user }`, else 401 `{ error: "invalid credentials" }`.
`apps/web/app/api/auth/logout/route.ts`:
```ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession } from "@civ/persistence/src/auth-write";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST() {
  const t = cookies().get("civ_session")?.value;
  if (t) await deleteSession(t);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("civ_session", "", { path: "/", maxAge: 0 });
  return res;
}
```

- [ ] **Step 3: Gates** — `pnpm -C apps/web build` SUCCESS (routes listed); `grep -rE "@civ/(engine|store|memory|brain|beliefs|scheduler)" apps/web/app/api/auth apps/web/lib/auth.ts` → NONE; `pnpm typecheck` clean.

- [ ] **Step 4: (Controller) commit** `feat(web): auth API routes + getCurrentUser` — files `lib/auth.ts` + the 3 routes.

---

### Task 6: auth UI — signup / login / account

**Files:** Create `apps/web/app/signup/page.tsx`, `.../login/page.tsx`, `.../account/page.tsx`.

**Interfaces:** signup/login are `"use client"` forms → POST the auth routes → `router.push("/account")`. `account` is a server component using `getCurrentUser()`; if null, prompt to log in; else show email + plan, owned worlds (`readWorlds(getPool(), user.id)`), and (client child) buttons to upgrade plan + mint an API key (call Task 7/8 routes — but plan-upgrade + key-mint endpoints are added in Task 8; for THIS task, render the account shell + worlds; wire the buttons in Task 8). Reuse `world-*`/`landing-cta`/`build-link` CSS.

- [ ] **Step 1: Create the signup form** (`apps/web/app/signup/page.tsx`) — client form (email, password) → `fetch("/api/auth/signup", …)` → on ok `router.push("/account")`, on error show `j.error`. Mirror the `/citizens/new` form structure (Slice 4) for inputs/styles.

- [ ] **Step 2: Create the login form** (`apps/web/app/login/page.tsx`) — same, POST `/api/auth/login`.

- [ ] **Step 3: Create `apps/web/app/account/page.tsx`** (server component):
```tsx
import React from "react";
import Link from "next/link";
import { getCurrentUser } from "../../lib/auth";
import { getPool } from "@civ/persistence/src/pool";
import { readWorlds } from "@civ/persistence/src/read";

export const runtime = "nodejs"; export const dynamic = "force-dynamic";

export default async function AccountPage() {
  const user = await getCurrentUser();
  if (!user) {
    return (<main className="world-root"><p className="landing-eyebrow">Account</p><h1 className="world-h1">Not signed in</h1>
      <div className="build-cta-row" style={{ marginTop: 24 }}><Link href="/login" className="landing-cta">Log in</Link><Link href="/signup" className="build-link">Sign up</Link></div></main>);
  }
  const worlds = await readWorlds(getPool(), user.id);
  const owned = worlds.filter((w) => w.ownerId === user.id);
  return (
    <main className="world-root">
      <p className="landing-eyebrow">Account · civilization-0</p>
      <h1 className="world-h1">{user.email}</h1>
      <div className="world-stat-row">
        <div className="world-stat-card"><span className="label">Plan</span><span className="world-stat-value mono">{user.plan}</span></div>
        <div className="world-stat-card"><span className="label">Worlds</span><span className="world-stat-value mono">{owned.length}</span></div>
        <div className="world-stat-card"><span className="label">API key</span><span className="world-stat-value mono">{user.hasApiKey ? "active" : "—"}</span></div>
      </div>
      <section className="world-section">
        <h2 className="world-section-h2">Your worlds</h2>
        {owned.length === 0 ? <p className="world-empty">No worlds yet.</p> : (
          <ul className="world-event-list">{owned.map((w) => <li key={w.id} className="world-event-item">
            <Link href={`/worlds`} className="world-id-link mono">{w.name}</Link>
            <span className="world-event-id mono">{w.visibility} · {w.population}/{w.populationCap}</span></li>)}</ul>)}
      </section>
      <div className="build-cta-row" style={{ marginTop: 32 }}>
        <Link href="/pricing" className="landing-cta">Plans & API →</Link>
        <Link href="/worlds" className="build-link">Worlds</Link>
        <Link href="/world" className="build-link">← World</Link>
      </div>
    </main>
  );
}
```

- [ ] **Step 4: Gates** — `pnpm -C apps/web build` SUCCESS (`/signup`,`/login`,`/account` listed); no heavy imports in those dirs; `pnpm typecheck` clean.

- [ ] **Step 5: (Controller) commit** `feat(web): signup / login / account pages` — the 3 page files.

---

### Task 7: world API + citizen create gating + /worlds page

**Files:** Create `apps/web/app/api/worlds/route.ts`, `apps/web/app/worlds/page.tsx`; Modify `apps/web/app/api/citizens/route.ts`.

**Interfaces:** `POST /api/worlds` — requires `getCurrentUser()`; body `{ name, visibility }`; calls `createWorld({ ownerId: user.id, ownerPlan: user.plan, name, visibility })`; 401 if unauth, 403 with the limit error message on plan violation, 201 `{ id }`. Modify `POST /api/citizens` — accept `worldId` (default `"genesis"`); if `worldId !== "genesis"`, require auth AND `world.ownerId === user.id` (else 403); enforce `worldPopulation(worldId) < world.populationCap` (else 409); pass `world_id` into the citizen. `/worlds` server page lists `readWorlds(getPool(), currentUser?.id)` with population bars + a "create world" client widget (POST /api/worlds).

- [ ] **Step 1: Modify `createCitizen`/its call site for `world_id`.** `createCitizen` (Task 3 of Slice 4) inserts citizens; add an optional `worldId` to `CreateCitizenInput` (default `"genesis"`) and include it in the INSERT (`world_id` column). Update `packages/persistence/src/citizen-write.ts`. (Re-run `pnpm test:it packages/persistence/src/citizen-write.itest.ts` → still green.)

- [ ] **Step 2: Create `apps/web/app/api/worlds/route.ts`**
```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { createWorld } from "@civ/persistence/src/world-write";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const visibility = b.visibility === "private" ? "private" : "public";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  try { const { id } = await createWorld({ ownerId: user.id, ownerPlan: user.plan, name, visibility }); return NextResponse.json({ id }, { status: 201 }); }
  catch (e: any) { return NextResponse.json({ error: e?.message ?? "failed" }, { status: 403 }); }
}
```

- [ ] **Step 3: Modify `apps/web/app/api/citizens/route.ts`** — import `getCurrentUser`, `getPool`, `readWorld` (`@civ/persistence/src/read`), `worldPopulation` (`@civ/persistence/src/world-write`). After parsing body, resolve `worldId = body.worldId || "genesis"`; load `world = await readWorld(getPool(), worldId)` (404 if null); if `worldId !== "genesis"`: `user = await getCurrentUser()`; 401 if none; 403 if `world.ownerId !== user.id`. Enforce `await worldPopulation(worldId) >= world.populationCap` → 409 `{ error: "world population cap reached" }`. Pass `worldId` to `createCitizen`.

- [ ] **Step 4: Create `apps/web/app/worlds/page.tsx`** — server component: `getCurrentUser()` + `readWorlds(getPool(), user?.id)`; render a `world-table` (Name | Visibility | Population | Owner-ish) with genesis linking to `/world`; a `"use client"` create-world widget (name + visibility select + button → POST `/api/worlds` → `router.refresh()`), shown only when signed in. Reuse existing CSS.

- [ ] **Step 5: Gates** — `pnpm test:it packages/persistence/src/citizen-write.itest.ts` green; `pnpm -C apps/web build` SUCCESS (`/api/worlds`, `/worlds` listed); no heavy imports; `pnpm typecheck`; `pnpm test`; engine/store empty.

- [ ] **Step 6: (Controller) commit** `feat(web): world creation API + citizen world-scoping + /worlds` — files `api/worlds/route.ts`, `worlds/page.tsx`, `api/citizens/route.ts`, `citizen-write.ts`.

---

### Task 8: Research API (keys + provenance records endpoint) + account wiring

**Files:** Create `apps/web/app/api/keys/route.ts`, `apps/web/app/api/plan/route.ts`, `apps/web/app/api/provenance/records/route.ts`; Create `apps/web/components/AccountActions.tsx`; Modify `apps/web/app/account/page.tsx` to mount it.

**Interfaces:**
- `POST /api/plan` — `getCurrentUser` required; body `{ plan }`; calls `setPlan` (mock upgrade, no payment). Returns `{ ok: true }`.
- `POST /api/keys` — `getCurrentUser` required AND `PLAN_LIMITS[user.plan].api` true (else 403); calls `mintApiKey`; returns `{ key }` ONCE.
- `GET /api/provenance/records?world=&citizen=&limit=` — reads `Authorization: Bearer <key>` (or `x-api-key`); `user = userByApiKey(key)`; 401 if none; 403 if `!PLAN_LIMITS[user.plan].api`; returns `{ records: exportProvenance(...) }`. This is the **Research product**.
- `AccountActions` (`"use client"`) — plan upgrade buttons (POST /api/plan → refresh) + "Mint API key" button (POST /api/keys → show the raw key once) shown when `apiEligible`.

- [ ] **Step 1: Create `apps/web/app/api/plan/route.ts`** (validate plan ∈ {free,pro,research}; setPlan; 401 if unauth).

- [ ] **Step 2: Create `apps/web/app/api/keys/route.ts`**
```ts
import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { mintApiKey } from "@civ/persistence/src/auth-write";
import { PLAN_LIMITS } from "@civ/persistence/src/world-write";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  if (!PLAN_LIMITS[user.plan].api) return NextResponse.json({ error: "API access requires the Research plan" }, { status: 403 });
  const key = await mintApiKey(user.id);
  return NextResponse.json({ key });
}
```

- [ ] **Step 3: Create `apps/web/app/api/provenance/records/route.ts`**
```ts
import { NextResponse } from "next/server";
import { getPool } from "@civ/persistence/src/pool";
import { userByApiKey } from "@civ/persistence/src/auth-write";
import { PLAN_LIMITS } from "@civ/persistence/src/world-write";
import { exportProvenance } from "@civ/persistence/src/read";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const key = auth?.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-api-key");
  if (!key) return NextResponse.json({ error: "missing API key" }, { status: 401 });
  const user = await userByApiKey(key);
  if (!user) return NextResponse.json({ error: "invalid API key" }, { status: 401 });
  if (!PLAN_LIMITS[user.plan].api) return NextResponse.json({ error: "Research plan required" }, { status: 403 });
  const url = new URL(req.url);
  const records = await exportProvenance(getPool(), {
    worldId: url.searchParams.get("world") ?? undefined,
    citizenId: url.searchParams.get("citizen") ?? undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
  });
  return NextResponse.json({ count: records.length, records });
}
```

- [ ] **Step 4: Create `apps/web/components/AccountActions.tsx`** (`"use client"`) — props `{ plan: string; apiEligible: boolean }`. Plan buttons (Free/Pro/Research) → `POST /api/plan` → `location.reload()`. "Mint API key" (when `apiEligible`) → `POST /api/keys` → set local state to show the returned key in a `mono` box with a "copy" note. Mount in `account/page.tsx` under the stat row: `<AccountActions plan={user.plan} apiEligible={PLAN_LIMITS[user.plan].api} />` (import `PLAN_LIMITS` from `@civ/persistence/src/world-write` in the server component).

- [ ] **Step 5: Gates** — `pnpm -C apps/web build` SUCCESS (`/api/plan`, `/api/keys`, `/api/provenance/records` listed); no heavy imports in `apps/web/app/api`; `pnpm typecheck`; `pnpm test`.

- [ ] **Step 6: (Controller) commit** `feat(web): Research provenance API + key minting + account actions` — the 3 routes + `AccountActions.tsx` + `account/page.tsx`.

---

### Task 9: /pricing page + nav wiring

**Files:** Create `apps/web/app/pricing/page.tsx`; Modify `apps/web/app/world/page.tsx` (Account/Pricing links).

- [ ] **Step 1: Create `apps/web/app/pricing/page.tsx`** — a static server component rendering three plan cards (Free / Pro / Research) from the same limits as `PLAN_LIMITS` (hardcode the display copy; reference cap/private/api per the constants). Research card highlights the provenance API with a `mono` `curl` snippet: `curl -H "Authorization: Bearer civ_…" <host>/api/provenance/records`. CTAs link to `/signup` and `/account`. Reuse `world-stat-card`/`world-section`/`landing-cta` CSS.

- [ ] **Step 2: Add nav to `apps/web/app/world/page.tsx`** main footer: `<Link href="/account" className="build-link">Account</Link>` and `<Link href="/pricing" className="build-link">Pricing</Link>`.

- [ ] **Step 3: Gates** — `pnpm -C apps/web build` SUCCESS (`/pricing` listed); `pnpm typecheck`; `pnpm test`; engine/store empty.

- [ ] **Step 4: (Controller) commit** `feat(web): pricing page + nav` — files `pricing/page.tsx`, `world/page.tsx`.

---

### Task 10: LIVE acceptance — Pro private world ticks on 0G; Research API exports records (controller-run)

**Files:** none (verification). The web dev server IS needed for the HTTP acceptance — start it, exercise the real routes with `curl` (cookie jar), then a live scheduler day.

- [ ] **Step 1 (Controller): start the web server** (background): `cd /opt/civilization-0 && pnpm -C apps/web build && pnpm -C apps/web start -p 8799` (or `dev`). Confirm it serves on :8799 (localhost only).

- [ ] **Step 2 (Controller): Pro user flow via curl (cookie jar):**
  1. `curl -sc /tmp/civ.cookies -X POST localhost:8799/api/auth/signup -H 'Content-Type: application/json' -d '{"email":"pro@demo.io","password":"hunter2"}'` → `{user:{plan:"free"}}`.
  2. `curl -sb /tmp/civ.cookies -X POST localhost:8799/api/plan -H 'Content-Type: application/json' -d '{"plan":"pro"}'` → `{ok:true}`.
  3. `curl -sb /tmp/civ.cookies -X POST localhost:8799/api/worlds -H 'Content-Type: application/json' -d '{"name":"Atlas","visibility":"private"}'` → `{id:"<wid>"}` (proves Pro can create a PRIVATE world with cap 100).
  4. `curl -sb /tmp/civ.cookies -X POST localhost:8799/api/citizens -H 'Content-Type: application/json' -d '{"name":"Atlas Zoe","occupation":"Builder","tier":3,"worldId":"<wid>","backstory":"Born in Atlas.","goal":"Lead Atlas."}'` → `{id:"<cid>"}`.

- [ ] **Step 2b (Controller): one live scheduler day** (spends OG) so the Atlas citizen reasons on 0G: `cd /opt/civilization-0/packages/scheduler && set -a && . /opt/civilization-0/.env && set +a && pnpm exec tsx --conditions require scripts/run-scheduler.ts --days 1`. Expect the new citizen in the ticked list; OG spent recorded.

- [ ] **Step 3 (Controller): Research user flow:**
  1. signup `research@demo.io` → `POST /api/plan {"plan":"research"}` → `POST /api/keys` → capture `{key:"civ_…"}` (do NOT commit it).
  2. `curl -s -H "Authorization: Bearer civ_…" "localhost:8799/api/provenance/records?world=<wid>"` → `{count: ≥1, records:[{decisionId, agent, decision:{action}, drivers, verified:true, rootHash:"0x…", verifyUrl:"/verify/0x…"}]}` — proves the Research API exports the real 0G-reasoned dataset.
  3. Negative check: the same curl WITHOUT the key → 401; with a Free user's key context → 403.

- [ ] **Step 4: Record** in the Task 10 report: the Pro private-world id + cap, the ticked citizen + `verified=true`, OG spent, and the Research API response (record count + a sample record incl. rootHash/verifyUrl). Stop the web server. No commit (no new tracked files).

---

## Self-Review (completed by plan author)

**1. Spec coverage:**
- Auth (signup/login/sessions) → Tasks 2 (write path) + 5 (routes + getCurrentUser) + 6 (UI). ✓
- World ownership (public vs private) → Tasks 1 (schema + genesis) + 3 (createWorld visibility) + 4 (readWorlds public+owned) + 7 (API + /worlds). ✓
- Plan tiers with population/analytics limits → Task 3 (`PLAN_LIMITS`, cap/private/maxWorlds/api) enforced in Tasks 7 (world create + citizen cap) + 8 (API gating). ✓
- Research tier = `@civ/provenance` API exposed (keyless verify already exists at `/verify` + `/api/verify`; record export) → Tasks 4 (`exportProvenance`) + 8 (`/api/provenance/records`, API-key + research-gated). ✓
- Acceptance (Pro creates private world w/ higher cap; Research pulls records/exports dataset via API) → Task 10 live, end-to-end over HTTP + real 0G. ✓

**2. Placeholder scan:** Tasks 6 (signup/login forms), 7 (/worlds widget), 9 (pricing copy) describe UI to mirror existing committed forms (`/citizens/new`) rather than re-pasting every input — acceptable since the pattern is concrete and in-repo; all NON-trivial logic (auth, gating, API, SQL) has exact code. No "TODO/handle errors" placeholders in logic.

**3. Type consistency:** `User`/`Plan` (Task 2) consumed by `getCurrentUser` (5), account (6), all gated routes (7,8). `PLAN_LIMITS` (Task 3) consumed in 7,8,9. `ProvenanceExportRecord`/`exportProvenance` (Task 4) consumed by the records route (8) + acceptance (10). `createWorld`/`worldPopulation` (Task 3) consumed in 7. `CreateCitizenInput.worldId` (Task 7 Step 1) flows to the citizens INSERT.

**Decisions:** (a) genesis world stays public + anon-writable so the Slice-4 `/citizens/new` flow is unbroken; auth gates only private worlds + Research API. (b) `citizens.world_id` (default genesis, no FK) is invisible to the frozen engine (`loadContext` selects named columns). (c) passwords via Node `crypto.scryptSync`, sessions via httpOnly cookie + `sessions` table, API keys sha256-hashed — no external deps, bundle stays light. (d) plan "upgrade" is a mock `setPlan` (no real payments) — scaffolding, per the slice name.

## Execution Handoff

Subagent-driven (as Slices 1–4): fresh implementer per task; controller verifies + commits (subagent git sandbox-denied). Persistence tasks 1→2→3→4 are sequential (shared `read.ts`/`index.ts`/`schema.sql`). Web tasks 5,6,7,8,9 each run a `next build` → SEQUENTIAL (shared `.next`). Controller runs the Task 10 live HTTP + OG acceptance. Final: whole-branch review → finishing-a-development-branch (merge to master) → memory update → V1 COMPLETE.
