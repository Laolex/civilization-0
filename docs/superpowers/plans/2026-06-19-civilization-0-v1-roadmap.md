# Civilization-0 V1 — Sliced Roadmap

> **For agentic workers:** this is the slice-level roadmap. Each slice gets its
> own bite-sized TDD task plan (via superpowers:writing-plans) **when we reach
> it** — we do NOT pre-write placeholder task plans for distant slices.
> Spec: `docs/superpowers/specs/2026-06-19-civilization-0-v1-design.md`.

**Goal:** evolve the shipped explainability demo into the V1 "OS for persistent
agent societies" — a world that ticks autonomously, persists, accumulates
history, grows organizations, and accepts user-created citizens, with every
decision reasoned and archived on 0G.

**Sequencing principle:** the **north star** ("leave, come back in 7 days, the
world changed") drives ordering. Persistence + an autonomous scheduler are the
foundation; everything else stacks on top. Each slice ends with working,
demoable, tested software.

## Global Constraints (apply to every slice)

- Keep `WorldStore` interface stable; the engine must not change when the
  persistence backend changes. New backends pass the **same contract tests** as
  `InMemoryWorldStore`.
- `BrainProvider` abstract; `ZeroGComputeBrain` is production. Unit suites stay
  network-free (pure logic + fakes). Real clients are smoke-tested, never
  imported by `*.test.ts`.
- 0G stays load-bearing: citizens **and** organizations reason on 0G Compute;
  all major events archive to 0G Storage. Surface "0G Compute ✓ / 0G Storage ✓".
- Never print/commit `ZG_PRIVATE_KEY`. Public read/verify stays keyless.
- pnpm 9.15.4 / Node 20. TDD, frequent commits. Compute scripts run with
  `tsx --conditions require`.

---

## Dependency graph

```
Slice 1 (Persistence + Scheduler + Dashboard)   ← north-star vertical, foundation
   ├─> Slice 2 (Organizations + org-as-agent)
   │       └─> Slice 3 (World History + Explorer + 0G badges)
   ├─> Slice 4 (User-created citizens + generalized Citizen page)
   └─> Slice 5 (Monetization: auth, private worlds, tiers, Research/provenance API)
```

Slices 2 and 4 both depend only on Slice 1 and can proceed in parallel after it.
Slice 3 depends on Slice 2 (it needs org events to be interesting). Slice 5 is
last (commercial layer).

---

## Slice 1 — Persistent world + autonomous scheduler + dashboard  *(north-star vertical)*

**Why first:** proves the north star with the least surface area, and lays the
mandatory persistence + scheduling foundation every later slice needs.

**Builds:**
1. **`PostgresWorldStore implements WorldStore`** — durable backend. Reuse the
   existing `InMemoryWorldStore` test suite as a **shared contract test** both
   backends must pass. pgvector for memory retrieval (replaces in-memory
   `MemoryIndex` for the persistent path).
2. **`@civ/scheduler`** — advances the world day, selects who ticks by agent
   tier, runs `runCitizenTick` for a small multi-citizen population against the
   persistent store, archives to 0G. Pure tier-selection logic is unit-tested;
   the loop is a thin runnable.
3. **Seed** a small starting population (e.g., 5–8 citizens across tiers, a few
   relationships) into Postgres.
4. **World Dashboard** screen (`/`, or `/world`): day counter, population, recent
   events, top citizens — reading the persistent store.
5. **Run-as-service:** systemd unit on the VPS ticking on a cadence (cron/loop),
   with a per-day 0G budget cap + low-balance alert.

**Acceptance:** start the scheduler, record day N + event count; restart the
process; advance days; the dashboard shows **more days, more events, new
memories** that survived the restart — with at least one decision's 0G chain
viewable and verifiable. Per-day OG burn measured and documented.

**Cost gate:** measure OG/day for the seed population before enabling continuous
ticking. Tune tier cadence so a day is affordable on the current wallet.

---

## Slice 2 — Organizations + organization-as-agent

**Depends on:** Slice 1.

**Builds:** `Organization` + `Membership` types in `@civ/shared`; store methods
(both backends + contract tests); engine support for org actions
(`create_org`/`join`/`leave`/`lead`/`hire` into an org) and an **org-as-agent
tick** that reasons on 0G Compute (treasury allocation, hiring, strategy);
Organization Profile screen (members, history, treasury, major decisions — each
with its 0G chain).

**Acceptance:** a citizen founds an org; other citizens join; the org itself
makes a strategic decision **reasoned on 0G** (verifiable chain); the org page
renders members + history + that decision.

---

## Slice 3 — World History explorer + 0G-visible everywhere

**Depends on:** Slice 2.

**Builds:** `HistoricalEvent` projection over `WorldEvent`s; DB-backed search
(by citizen, org, event type); History Explorer screen ("show all events
involving Ada"); "0G Compute ✓ / 0G Storage ✓" badges on every decision/event/
org surface; life-story generation on the Citizen page.

**Acceptance:** search returns a citizen's full event history with working
links; every event/decision surface shows its 0G provenance; a coherent life
story renders for a tier-3 citizen.

---

## Slice 4 — User-created citizens + generalized Citizen page

**Depends on:** Slice 1 (parallelizable with Slice 2).

**Builds:** citizen creation form (name, traits, occupation, backstory, initial
goal) + API route that inserts into the persistent store and enrolls the citizen
in the scheduler; generalize the Ada page into the full Citizen Profile
(profile, timeline, relationships, goals, life story, explainability) for any id.

**Acceptance:** a user creates a citizen via the form; it appears in the world;
after the scheduler advances days, the new citizen has accrued memories,
relationships, and at least one 0G-reasoned decision.

---

## Slice 5 — Monetization scaffolding

**Depends on:** Slices 1–4.

**Builds:** auth; world ownership (public vs private worlds); plan tiers with
population/analytics limits (Free/Pro); **Research tier = `@civ/provenance` API**
exposed (keyless verify + record export + bulk/scenario endpoints).

**Acceptance:** a Pro user creates a private world with a higher population cap;
a Research user pulls provenance records / exports a dataset via API.

---

## Execution note

Slice 1 is the next thing to build. Its detailed bite-sized TDD task plan will
be written (writing-plans) immediately before implementation, after a short
codebase pass over `@civ/store`, `@civ/memory`, and the engine's `TickDeps`
wiring so the task steps carry real signatures and code (no placeholders).
