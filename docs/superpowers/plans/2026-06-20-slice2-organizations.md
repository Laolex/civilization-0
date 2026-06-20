# Slice 2 — Organizations + Organization-as-Agent Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking. Each task = fresh implementer + reviewer. The controller writes a detailed per-task brief (with exact code) at dispatch time, grounded in this plan.

**Goal:** Add first-class Organizations that citizens found and join, and an
**organization-as-agent** that reasons on real 0G Compute (strategy/treasury)
with a verifiable causal chain archived to 0G Storage — surfaced on an
Organization Profile screen.

**Architecture:** Organizations are a new persisted entity (`organizations` +
`memberships` tables). The **engine and `WorldStore` interface stay UNCHANGED**
(same guarantee as Slice 1). An org reasons via a **synthesized-citizen persona
adapter**: `runOrgTick` maps an `Organization` into the `DecisionContext.citizen`
shape the brain already expects (`You are <OrgName>, a <kind> organization…`),
calls `brain.decide` on 0G, then records the strategic decision as an `events`
row (`actor_id = orgId`, no FK) + a `traces` row (no FK) archived to 0G — reusing
`ExplainabilityService.buildAndArchive` with an **ephemeral** `Decision`
(`citizenId = orgId`, never written to the FK-constrained `decisions` table).
Org founding/joining are explicit repository operations, seeded for a reliable
demo and optionally driven emergently by citizen `create_org`/`join` decisions
via a thin scheduler effects step.

**Tech Stack:** TypeScript ESM monorepo (pnpm 9.15.4 / Node 20), `@civ/shared`,
`@civ/scheduler`, `@civ/persistence` (Postgres 16 + pgvector via `pg`),
`@civ/zerog` (real 0G Compute/Storage), Next.js 14.2.5 App Router, Vitest
(unit `*.test.ts` + integration `*.itest.ts`).

## Global Constraints

- pnpm 9.15.4 / Node 20. TDD (RED→GREEN), frequent commits, NO `Co-Authored-By` trailer.
- Engine (`packages/engine/src`) and `WorldStore` (`packages/store/src`) MUST stay
  byte-for-byte unchanged. Verify with `git diff --stat <base>..HEAD -- packages/engine packages/store` (empty).
- Unit suites stay network-free (pure logic + Fakes). DB tests are `*.itest.ts`
  run ONLY via `pnpm test:it <path>` (loads `.env` `DATABASE_URL`); NEVER `pnpm dlx`.
  Use `resetWorld()` for itest cleanup (extend it to truncate the new tables).
- 0G stays load-bearing: the org reasons on 0G Compute; its decision archives to
  0G Storage; surface "0G Compute ✓ / 0G Storage ✓". Live compute runs with
  `tsx --conditions require` (broken compute-SDK ESM).
- Web stays KEYLESS: org pages read Postgres via the pg-light path
  (`@civ/persistence/src/{pool,read}`); NO `ZG_PRIVATE_KEY`, no 0G write path.
- NEVER print/log/commit `ZG_PRIVATE_KEY` or `.env`. Log only wallet address + balances.
- Only the live org-tick runnable spends OG; gate with a wallet-balance floor.

---

## Verified codebase facts (ground truth for all tasks)

- `ActionType` = `"meet"|"friend"|"argue"|"hire"|"quit_job"|"start_company"|"partner"|"betray"|"invest"|"work"`; `ALL_ACTIONS` lists them; `MAJOR_ACTIONS` (in `@civ/engine`) = start_company/partner/betray/hire/quit_job/invest. Nothing switches *exhaustively* on `ActionType` (engine uses `.includes`), so adding members is safe.
- `DecisionContext` (`@civ/brain`) = `{ citizen: Citizen; goal: Goal|null; memories: Memory[]; beliefs: Belief[]; relationships: Relationship[]; worldState: WorldState; availableActions: ActionType[] }`. `DecisionResult` = `{ action, targetId, reasoning, memoryWeights, beliefWeights, meta? }`. `BrainProvider.decide(ctx)`; `FakeBrain((ctx)=>DecisionResult)`.
- 0G brain prompt (`packages/zerog/src/brain.ts`): `system = "You are ${ctx.citizen.name}, a ${ctx.citizen.occupation}…"`, also uses `ctx.citizen.age` + `ctx.citizen.traits`. So a synthesized Citizen persona reasons naturally.
- `ExplainabilityService(storage).buildAndArchive({ id, decision, goal, memories, beliefs, event }): Promise<DecisionTrace>` — archives `trace/<decision.id>` to 0G; sets `zgRootHash`/`zgTxHash`. Reads only `decision.{id,action,reasoning,meta}`, goal.description, memory/belief ids/statements, event.id.
- `Decision` = `{ id, citizenId, goalId, day, reasoning, action, targetId, brainProvider, brainModel, meta? }`. `WorldEvent` = `{ id, day, type, actorId, targetId, decisionId, payload, zgRootHash?, zgTxHash? }`. `DecisionTrace` = `{ id, decisionId, trace{…}, zgRootHash?, zgTxHash? }`.
- Schema FKs: `goals/relationships/memories/beliefs/decisions.citizen_id REFERENCES citizens(id)`. `events.actor_id` and `traces.decision_id` have NO FK. → org events/traces reuse these tables; org "decisions" are NOT written to the `decisions` table.
- Persistence: `WorldRepository` (`packages/persistence/src/repository.ts`), light read path `read.ts` (pg-only, used by web), `resetWorld()` (`testutil.ts`), barrel `index.ts`. `getPool()`/`closePool()` (`pool.ts`). Schema applied by `migrate()` reading `schema.sql`.
- Scheduler: `selectTickers(citizens, day)` (`select.ts`), `runDay(deps, day)` (`loop.ts`), seed `scripts/seed-world.ts`, live `scripts/run-scheduler.ts`, `getBalanceOG`/`getWalletAddress` (`@civ/zerog/src/wallet`), real factories `loadZeroGConfig`/`createZeroGStorage`/`createZeroGComputeBrain`.
- Web: server components use `runtime="nodejs"` + `dynamic="force-dynamic"`; `next.config.js` has `transpilePackages:[…,"@civ/persistence"]` + `experimental.serverComponentsExternalPackages:["pg"]`. Citizen page at `apps/web/app/citizens/ada`. Dashboard selectors `apps/web/lib/dashboard.ts`; CSS tokens in `globals.css` (`--bg #0a0b0d`, `--panel`, `--slate`, `--accent #4f7ef8`, `--mono`).

---

## Task list (10 tasks)

### Task 1 — `Organization` + `Membership` types (`@civ/shared`)
**Files:** Modify `packages/shared/src/index.ts`; Test `packages/shared/src/organization.test.ts`.
**Produces:**
```ts
export type OrgKind = "guild" | "company" | "council";
export type OrgRole = "founder" | "leader" | "member";
export interface Organization {
  id: string; name: string; kind: OrgKind; founderId: string;
  treasury: number; reputation: number; goal: string; createdDay: number;
}
export interface Membership { orgId: string; citizenId: string; role: OrgRole; joinedDay: number; }
```
Add `"create_org" | "join" | "leave"` to `ActionType` and to `ALL_ACTIONS`.
**Test:** assert `ALL_ACTIONS` includes the 3 new actions and that an `Organization`/`Membership` object literal typechecks (a trivial runtime assertion on a constructed object). Pure unit. Commit `feat(shared): Organization + Membership types + org actions`.

### Task 2 — org schema + resetWorld extension (`@civ/persistence`)
**Files:** Modify `packages/persistence/src/schema.sql`, `testutil.ts`; Test `packages/persistence/src/org-schema.itest.ts`.
Append idempotent tables:
```sql
CREATE TABLE IF NOT EXISTS organizations (
  id TEXT PRIMARY KEY, name TEXT NOT NULL, kind TEXT NOT NULL,
  founder_id TEXT NOT NULL, treasury NUMERIC NOT NULL DEFAULT 0,
  reputation NUMERIC NOT NULL DEFAULT 0, goal TEXT NOT NULL DEFAULT '',
  created_day INT NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS memberships (
  org_id TEXT NOT NULL REFERENCES organizations(id),
  citizen_id TEXT NOT NULL,
  role TEXT NOT NULL, joined_day INT NOT NULL DEFAULT 0,
  PRIMARY KEY (org_id, citizen_id)
);
CREATE INDEX IF NOT EXISTS memberships_citizen_idx ON memberships (citizen_id);
```
Extend `resetWorld`'s `WORLD_TABLES` to include `organizations`, `memberships`
(CASCADE order handled by TRUNCATE…CASCADE). Integration test: `migrate()` then
`to_regclass('organizations')`/`('memberships')` non-null. Commit
`feat(persistence): organizations + memberships schema`.

### Task 3 — repository org ops (`@civ/persistence`)
**Files:** Create `packages/persistence/src/org-repository.ts`; Modify barrel `index.ts`; Test `packages/persistence/src/org-repository.itest.ts`.
**Produces** (a small class or functions taking a `Pool`; mirror `WorldRepository` style):
```ts
export interface OrgContext { org: Organization; members: Membership[]; }
export class OrgRepository {
  constructor(pool?: Pool);
  createOrg(o: Organization): Promise<void>;                 // INSERT … ON CONFLICT(id) DO UPDATE
  addMembership(m: Membership): Promise<void>;               // INSERT … ON CONFLICT(org_id,citizen_id) DO UPDATE role/joined_day
  getOrg(orgId: string): Promise<Organization | null>;
  listMemberships(orgId: string): Promise<Membership[]>;
  loadOrgContext(orgId: string): Promise<OrgContext | null>; // org + members
  persistOrgTick(orgId: string, event: WorldEvent, trace: DecisionTrace, treasuryDelta?: number): Promise<void>;
  // persistOrgTick: INSERT event (actor_id=orgId) + trace, both ON CONFLICT DO NOTHING,
  // and UPDATE organizations SET treasury = treasury + $delta WHERE id=$orgId — in ONE transaction.
}
```
Reuse column mappings from `WorldRepository` (snake_case, `Number()` coercions,
JSONB stringify for `payload`/`trace`). Integration tests: createOrg+addMembership
round-trip via loadOrgContext; persistOrgTick writes an event with `actor_id=orgId`
and bumps treasury. Use `resetWorld()` in beforeAll. Commit
`feat(persistence): OrgRepository load/persist org context`.

### Task 4 — `runOrgTick` persona adapter (`@civ/scheduler`, pure/unit)
**Files:** Create `packages/scheduler/src/org-tick.ts`; Test `packages/scheduler/src/org-tick.test.ts`.
**Consumes:** `OrgContext` (Task 3), `BrainProvider`/`DecisionContext` (`@civ/brain`), `ExplainabilityService` (`@civ/explainability`), `StorageProvider` (`@civ/storage`), shared types.
**Produces:**
```ts
export interface OrgTickDeps {
  brain: BrainProvider; storage: StorageProvider; explain: ExplainabilityService;
  clock: { day: number }; idgen: () => string;
  availableActions?: ActionType[]; // default ["hire","invest","partner","work"]
}
export interface OrgTickResult { event: WorldEvent; trace: DecisionTrace; reasoning: string; action: ActionType; targetId: string|null; }
export function orgPersona(org: Organization): Citizen; // synthesize: id=org.id, name=org.name,
  // occupation=`${org.kind} organization`, age=clock-independent (use a fixed/age-from-createdDay),
  // traits=leadership profile, wealth=org.treasury, reputation=org.reputation, tier=2, createdDay=org.createdDay
export async function runOrgTick(ctx: OrgContext, deps: OrgTickDeps): Promise<OrgTickResult>;
```
`runOrgTick`: build `DecisionContext` = `{ citizen: orgPersona(org), goal: {…strategic goal from org.goal…}, memories: [], beliefs: [], relationships: [], worldState, availableActions }`; `brain.decide(ctx)`; build ephemeral `Decision` (`id=idgen()`, `citizenId=org.id`, `goalId=null`, action/reasoning/targetId/meta, brainProvider/Model from brain); build `WorldEvent` (`id=idgen()`, `actorId=org.id`, `type=action`, `decisionId=decision.id`, payload `{ orgTick: true, reasoning, action, targetId }` — so the pg-light `readOrg` can read reasoning directly without parsing trace JSONB); `trace = await explain.buildAndArchive({ id: idgen(), decision, goal, memories: [], beliefs: [], event })`; archive the event too via `storage.archive('event/'+event.id, event)` and set `event.zgRootHash/zgTxHash`. Return result.
**Test (network-free):** `FakeBrain(()=>({action:"hire",targetId:"lena",reasoning:"grow",memoryWeights:{},beliefWeights:{}}))` + `FakeStorage()` + `ExplainabilityService(new FakeStorage())`; assert `result.event.actorId===org.id`, `result.action==="hire"`, `result.trace.zgRootHash` set (Fake returns a hash), `orgPersona(org).name===org.name`. Commit `feat(scheduler): runOrgTick org-as-agent persona adapter`.

### Task 5 — scheduler org integration (`@civ/scheduler`, itest)
**Files:** Create `packages/scheduler/src/org-loop.ts`; Test `packages/scheduler/src/org-loop.itest.ts`.
**Produces:**
```ts
export interface OrgDayDeps { repo: OrgRepository; makeOrgTickDeps: (day:number)=>OrgTickDeps; orgIds: string[]; worldState: WorldState; }
export async function runOrgDay(deps: OrgDayDeps, day: number): Promise<{ ticked: string[] }>;
// for each orgId: loadOrgContext → runOrgTick → persistOrgTick; returns ticked org ids.
```
Integration test (DB + Fakes, no 0G): seed a citizen `ada` + an org via
`OrgRepository.createOrg` + `addMembership`; `runOrgDay` with a FakeBrain; assert
an `events` row with `actor_id=<orgId>` exists and treasury changed if a delta was
applied. Use `resetWorld()`. Commit `feat(scheduler): runOrgDay ticks orgs on 0G path`.

### Task 6 — emergent founding effects + seed orgs
**Files:** Create `packages/scheduler/scripts/seed-orgs.ts`; Modify `packages/scheduler/src/loop.ts` (thin effects step) + `loop.itest.ts`.
1. **Effects step in `runDay`:** after `persistTick` for a citizen, inspect `result.decision.action`: if `create_org` → `await foundOrg(orgRepo, founder, day, idgen)` (a thin helper added here = `createOrg(org)` + `addMembership({orgId, citizenId: founderId, role:"founder", joinedDay:day})`, org named for the founder); if `join` and `result.decision.targetId` names an existing org → `addMembership(member)`. Inject an `OrgRepository` (+ a `now`/day) via `DayDeps` as an OPTIONAL `orgEffects?` collaborator so existing `runDay` callers/tests still pass. Add an itest asserting a scripted `create_org` citizen decision creates an org row.
2. **`seed-orgs.ts`:** deterministic — founder `ada` founds org "Ada Collective" (guild), `marcus` + `lena` join as members; prints org id + member count; `closePool()`. Run via `pnpm -C packages/scheduler exec tsx --env-file=/opt/civilization-0/.env scripts/seed-orgs.ts`.
Commit `feat(scheduler): emergent org founding + org seed`.

### Task 7 — org read projections (`@civ/persistence/src/read.ts`, pg-light)
**Files:** Modify `packages/persistence/src/read.ts`; Test add to `org-repository.itest.ts` (or a new `read-orgs.itest.ts`).
**Produces** (pg-only, no @civ/engine/store imports — keeps web bundle light):
```ts
export interface OrgView { id:string; name:string; kind:string; founderId:string; treasury:number; reputation:number; goal:string; createdDay:number;
  members: { citizenId:string; role:string; joinedDay:number }[];
  decisions: { eventId:string; day:number; action:string; targetId:string|null; reasoning:string; rootHash:string|null }[]; }
export async function readOrg(pool: Pool, orgId: string): Promise<OrgView | null>;
export async function readOrgList(pool: Pool): Promise<{ id:string; name:string; kind:string; treasury:number; memberCount:number }[]>;
```
`readOrg`: SELECT org; SELECT memberships; SELECT events (actor_id=orgId) LEFT
JOIN traces ON traces.decision_id = events.decision_id — read `reasoning`/`action`/
`targetId` from `events.payload` (JSONB, set by `runOrgTick`) and `rootHash` from
`traces.zg_root_hash` (the archived 0G trace).
Integration test: after seed-orgs + one org tick, `readOrg` returns members≥3 and
≥0 decisions; `readOrgList` non-empty. Commit `feat(persistence): readOrg/readOrgList projections`.

### Task 8 — Organization Profile + index pages (`apps/web`)
**Files:** Create `apps/web/app/orgs/page.tsx` (index) + `apps/web/app/orgs/[id]/page.tsx`; Modify `apps/web/app/globals.css` (`org-*` classes); maybe `apps/web/lib/` selector if useful.
Server components (`runtime=nodejs`, `dynamic=force-dynamic`), deep-import the
LIGHT path `@civ/persistence/src/{pool,read}` ONLY. `/orgs` lists orgs
(`readOrgList`); `/orgs/[id]` renders org header (name/kind/treasury/reputation/goal),
members (link to `/citizens/:id`), and the org's strategic decisions — each showing
the action + reasoning + a "0G Compute ✓ / 0G Storage ✓" badge + a link to
`/verify/<rootHash>` when present. Graceful "org not found"/"not connected" states.
Aesthetic matches the forensic dark theme. Verify `pnpm -C apps/web build`
compiles `/orgs` + `/orgs/[id]` (dynamic). Commit `feat(web): Organization Profile + index`.

### Task 9 — org tick read-back integration + dashboard link
**Files:** Modify `apps/web/app/world/page.tsx` (add an "Organizations" link/section); Test `packages/scheduler/src/org-loop.itest.ts` (extend) OR a small read itest.
Add a top-level link from `/world` to `/orgs`. Extend an itest to assert the
full chain: seed org → runOrgDay (FakeBrain) → `readOrg` shows the new decision
with the (fake) root hash. Build check. Commit `feat(web): link world → orgs; org chain read-back`.

### Task 10 — LIVE org reasoning on 0G + cost gate
**Files:** Create `packages/scheduler/scripts/run-org-tick.ts`; (optional) extend `deploy/` doc.
**Live runnable** (mirrors `run-scheduler.ts`): load `.env`, real `createZeroGStorage`
+ `createZeroGComputeBrain` (ONCE), real `ExplainabilityService(storage)`,
`OrgRepository`; balance floor gate (`ZG_BALANCE_FLOOR_OG`); unique idgen; load one
org context; `runOrgTick` on real 0G; `persistOrgTick`; print wallet address,
org id, action, `verified`, archived root hash, OG spent. NEVER print the key.
**Procedure:** seed-orgs first; run with
`cd /opt/civilization-0/packages/scheduler && set -a && . /opt/civilization-0/.env && set +a && pnpm exec tsx --conditions require scripts/run-org-tick.ts`.
Acceptance: org made a strategic decision **reasoned on 0G** (`meta.verified===true`
ideally), archived to 0G Storage (root hash), keyless-verifiable at `/verify/<root>`,
and `/orgs/<id>` renders it. Record OG spent. Commit
`feat(scheduler): live org-as-agent 0G reasoning + cost gate`.

---

## Acceptance (Slice 2)

- A citizen founds an org and others join (seed-orgs, and emergently via
  `create_org`/`join` citizen decisions in `runDay`).
- The **org itself makes a strategic decision reasoned on 0G Compute** with a
  verifiable causal chain archived to 0G Storage (live proof via `run-org-tick.ts`).
- `/orgs` and `/orgs/<id>` render members + history + that 0G-reasoned decision,
  with a working `/verify/<root>` link.
- Engine + `WorldStore` unchanged. Unit suite network-free & green; DB itests green.
- Per-org-tick OG burn measured; live runnable cost-gated.

## Self-review notes

- **Engine-unchanged guarantee preserved:** org reasoning lives entirely in
  `@civ/scheduler` (`org-tick.ts`/`org-loop.ts`) + `@civ/persistence`
  (`org-repository.ts`), reusing `@civ/brain`/`@civ/explainability`/`@civ/storage`
  through their existing interfaces. No edits to `packages/engine` or `packages/store`.
- **FK-aware persistence:** org decisions are events+traces (FK-free tables) + an
  ephemeral `Decision` for trace construction; the `decisions` table (FK to
  citizens) is untouched by org ticks. `memberships.citizen_id` is intentionally
  NOT FK-constrained (a member id is validated at write time by the seed/effects).
- **Persona adapter** trades a tiny bit of prompt-grammar awkwardness for full
  reuse of the proven 0G reasoning + explainability path — the moat (drivers →
  trace → 0G) applies to orgs identically.
- **Emergent vs seeded founding:** both supported; the seed guarantees a reliable
  demo independent of live-brain RNG, while the effects step makes founding
  emergent from citizen decisions.
- **Deferred (Slice 3+):** org-specific persistent memories/beliefs (org reasons
  from state + strategic goal for now, memories `[]`); richer treasury economics;
  org→org relationships; leave/role-change lifecycle beyond basic `leave`.
