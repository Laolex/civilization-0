# Civilization-0 V1 — Design Spec

> **Status:** approved direction (2026-06-19). Supersedes the "AI civilization
> demo" framing. Decisions locked with Ola: (1) **nest `@civ/provenance` under
> the OS** — Civilization-0 is the product, provenance is the Explainability
> pillar + Research/API tier; (2) keep **0G Compute as the production reasoning
> layer and 0G Storage as the permanent history layer** (Brief 2).

---

## 1. Positioning

**Civilization-0 — the operating system for persistent agent societies.**

> Tagline: *"Create citizens. Build societies. Watch history emerge."*

The fundable unit is **persistence + emergence**, not "we use agents" or "we use
0G". The core promise:

> **Every agent has a past, and that past changes its future.**

### 1.1 Two pitches, one architecture (Brief 2)

| Context | Lead with | 0G is… |
|---|---|---|
| **Hackathon** | "Citizens think on 0G Compute. History lives on 0G Storage." | the product |
| **Startup / fundraising** | "Persistent, explainable AI societies that evolve on their own." | the enabling infrastructure underneath |

Nothing in the architecture changes between the two — only the order of the
sentences. We do **not** move reasoning off 0G; that is the mistake that makes
0G optional. `BrainProvider` is abstract (fakes for dev/test); `ZeroGComputeBrain`
is the production implementation. As the society grows, **more** entities reason
on 0G, not fewer (citizens → organizations → world-level agents).

### 1.2 Where provenance nests

`@civ/provenance` (already shipped) is **not** a separate company. It is:
- the **Explainability pillar** ("every action is explainable"), and
- the **Research / API monetization tier** ("API access, export datasets").

The causal chain `Memory → Belief → 0G Compute → Decision → Event → 0G Storage`
remains the hero and the moat.

---

## 2. Users

| Type | Creates / does | Goal |
|---|---|---|
| **Creator** | citizens, organizations, worlds | "I want to see what happens." |
| **Explorer** | reads stories, histories, relationships | "I want to discover interesting civilizations." |
| **Researcher** | simulations, experiments, dataset export (provenance API) | "I want to understand agent behavior." |

---

## 3. The North Star

> If someone creates a citizen today, leaves, and returns 7 days later, they
> should discover **new relationships, memories, opportunities, conflicts,
> organizations, and history** — without having done anything.

When that holds, Civilization-0 stops being a demo and becomes a living system.
This single test drives the V1 architecture: it **forces autonomous scheduling
and durable persistence** (the in-memory store cannot survive the wait).

---

## 4. V1 Pillars

1. **Persistent Citizens** — never reset; carry memories, beliefs, goals,
   relationships, organizations, reputation, wealth, life story.
2. **Persistent Memory** — memories are *causal inputs* to decisions, not logs.
   Hot retrieval via pgvector; permanent archive via 0G Storage. (Architecture
   already supports this; persistence backend changes from in-memory to Postgres.)
3. **Organizations** — the biggest addition. Companies/universities/guilds/media
   are long-lived actors. An organization can itself become an **agent** that
   hires, allocates a treasury, pursues goals, and makes strategic decisions
   **reasoned on 0G Compute** — higher-order emergence.
4. **World History** — every civilization generates searchable `HistoricalEvent`s
   ("Ada founded Nexus Labs", "Marcus became CEO"). Wikipedia-meets-Bloomberg.
5. **User-Created Citizens** — users author name/traits/occupation/backstory/goal;
   the citizen enters the world and the world keeps evolving around them.

**Explainability is the hero across all five.** Every decision surface shows the
0G-reasoned causal chain.

---

## 5. Social systems (V1 scope only)

Included: **Relationships** (trust, friendship, influence, rivalry),
**Careers** (work, hire, quit, promote), **Organizations** (join, leave, create,
lead). **Nothing more.**

**Non-goals (V2):** wars, elections, religion, governments, world-level
governance agents. Keep V1 to citizens + organizations.

---

## 6. Architecture

### 6.1 Existing (keep)

`packages/*`: `shared`, `storage`, `brain`, `store`, `memory`, `beliefs`,
`explainability`, `engine`, `zerog`, `provenance`. `apps/web` (Next 14 App
Router). The causal tick (`runCitizenTick`) already does observe → retrieve →
decide (0G) → record causality → archive (0G) → form memory → revise beliefs.
`ZeroGComputeBrain` + `ZeroGStorage` are live. Relationships and career actions
(`hire`/`quit_job`/`invest`/`partner`/`start_company`) already exist in
`ALL_ACTIONS` / the engine.

### 6.2 New for V1

| Concern | Approach |
|---|---|
| **Durable persistence** | `PostgresWorldStore implements WorldStore` (same interface — engine unchanged). pgvector for memory embeddings (replaces in-memory `MemoryIndex` retrieval). **Mandatory** — the north star depends on it. |
| **Organizations** | New `Organization` + `Membership` types in `@civ/shared`; store methods; engine support for org-scoped actions and an **org-as-agent tick** that reasons on 0G. |
| **Autonomous scheduler** | New `@civ/scheduler`: advances world days, selects who ticks by **agent tier**, runs ticks against the persistent store, archives to 0G. Runs as a systemd service (like vera-board). |
| **World History** | `HistoricalEvent` projection over `WorldEvent`s + DB-backed search. |
| **User-created citizens** | API route + creation form → insert into persistent store. |
| **Provenance nesting** | Citizen/decision/org/event pages render `@civ/provenance` chains + "0G Compute ✓ / 0G Storage ✓" badges. Research tier = `createVerifier` / record export. |

### 6.3 Agent tiers (cost control)

| Tier | Role | Cadence |
|---|---|---|
| **1** | background population | rarely reasons (cheap; mostly scripted/stochastic) |
| **2** | active citizens | reasons occasionally |
| **3** | influencers / founders / org heads | reasons frequently on 0G |

The scheduler enforces tier cadence so 0G inference cost scales sub-linearly with
population. See §9.

### 6.4 Data model additions (sketch)

```
Organization { id, name, type: company|university|guild|media,
               treasury, reputation, foundedDay, headId|null }
Membership   { citizenId, orgId, role, joinedDay, leftDay|null }
HistoricalEvent (projection) { id, day, kind, actorId, orgId|null,
               targetId|null, summary, decisionId|null, zgRootHash|null }
```

(Citizens already carry `tier`, `reputation`, `wealth`. `WorldEvent` already
carries `decisionId` + archive hashes.)

---

## 7. Screens

1. **World Dashboard** — population, organizations, recent events, top citizens.
   (Wikipedia × Bloomberg.)
2. **Citizen Profile** — generalize the Ada page: profile, timeline,
   relationships, goals, life story, explainability.
3. **Organization Profile** — members, history, treasury, major decisions
   (each org decision shows its 0G chain).
4. **History Explorer** — search citizens/events/organizations ("show all events
   involving Ada").
5. **Explainability Graph** — unchanged hero; front and center everywhere.

Plus **0G-visible badges** on every decision/event/org surface.

---

## 8. Monetization

| Tier | Includes |
|---|---|
| **Free** | create citizens, explore public worlds |
| **Pro** | private worlds, higher population limits, advanced analytics, custom organizations |
| **Research** | **`@civ/provenance` API**, bulk simulations, dataset export, scenario testing |

The Research tier is exactly the provenance SDK exposed — the moat as revenue.

---

## 9. Risks & constraints (carry into every slice)

1. **Persistence is now load-bearing**, not deferred. The north star requires a
   world that survives between sessions and accumulates. `PostgresWorldStore`
   is the foundation slice.
2. **0G cost scales with the world.** A populated society ticking daily —
   citizens *and* organizations reasoning on 0G — burns real OG. Wallet is at
   ~0.49 OG (compute ledger open). Mitigations: agent tiers (§6.3), decision
   caching/deduping, configurable tick budget per day, top-up alerting. **Model
   the per-day OG burn before scaling population.**
3. **Emergence quality is a product risk.** "Explorers discover *interesting*
   civilizations" only holds if small-model stories stay coherent. Gate on a
   qualitative bar before promising it externally.
4. **Narrative discipline.** Pitch the society OS; keep provenance as a pillar,
   not a competing company. Don't pitch two companies at once.
5. **Never** print/commit `ZG_PRIVATE_KEY`. Scheduler holds the key (write path);
   public read/verify stays keyless.

---

## 10. Tech stack (locked)

Next.js 14 App Router + React 18 + Server Components (Tailwind optional — current
app uses design-token CSS; keep consistent). TypeScript ESM, pnpm 9.15.4
workspaces, Node 20. Vitest, TDD, testability seam (pure logic + thin network
clients never imported by `*.test.ts`). Postgres + pgvector. 0G testnet
(chainId 16602), SDKs `@0gfoundation/0g-storage-ts-sdk@1.2.10` +
`@0gfoundation/0g-compute-ts-sdk@0.8.4` (compute ESM broken → `tsx --conditions
require`).

---

## 11. Open decisions (resolve as slices land)

- **Postgres hosting** for the persistent world (local docker vs managed) — the
  scheduler service needs a durable DB on the VPS.
- **Tick cadence in real time** (1 sim-day = N real minutes/hours) and the
  per-day 0G budget.
- **Auth** for Creator/Pro (deferred to the monetization slice).
- **World multi-tenancy** (one shared public world first; private worlds later).
