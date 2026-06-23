# Opik Tracing for Civilization-0 — Design

Date: 2026-06-23
Status: Approved

## Goal

Add LLM observability to Civilization-0 by sending agent-reasoning traces to
Opik (Comet cloud). Every citizen/org decision and every underlying LLM call
(including JSON-repair retries) should appear as a trace + nested spans, with
zero behavior change when Opik is not configured.

## Integration point

All reasoning funnels through one factory: `createZeroGComputeBrain()` in
`packages/zerog/src/real-chat.ts`. The engine tick
(`packages/engine/src/index.ts`), the provenance wrapper
(`packages/provenance/src/real.ts`), and the scripts all obtain their
`BrainProvider` from it. Instrumenting there covers every path.

## Components

New module `packages/zerog/src/opik-tracing.ts`. Pure decorators; existing
files barely change.

- `getOpikClient(): Opik | null` — lazily builds an Opik client from `OPIK_*`
  env, memoized. Returns `null` when `OPIK_API_KEY` is unset.
- `instrumentBrain(brain): BrainProvider` — wraps `decide()`. Opens **one trace
  per decision** (`decide: <citizen name>`), stores it in an
  `AsyncLocalStorage`, runs the real `decide()`, records the outcome, ends the
  trace. No-op pass-through when client is null.
- `instrumentChat(chat): Chat` — wraps `complete()`. For each LLM call it reads
  the active trace from ALS and adds a child `llm` span. If no trace is active
  it opens a standalone trace so nothing is lost. No-op pass-through when client
  is null.

The two decorators are linked by a module-level
`AsyncLocalStorage<OpikTrace>`.

## Captured data

- **Trace input:** citizen id/name/occupation, world day + headline, goal,
  available actions, counts of memories/beliefs/relationships.
- **Trace output:** chosen `action`, `targetId`, `reasoning`.
- **LLM span:** messages (input), raw content (output), `model`, token `usage`,
  and 0G-specific `verified` / `requestId` / `repair` flags as metadata.

## Supporting change

Extend `ChatResult` with an optional `usage?` field and populate it from
`data.usage` in `real-chat.ts`, so spans can log real token counts. Optional
field — no existing caller affected.

## Safety / opt-in

- When `OPIK_API_KEY` is unset, both decorators are exact pass-throughs — zero
  behavior change. (Live ticks are fragile; tracing must never be load-bearing.)
- Any error thrown by the Opik SDK inside a decorator is swallowed and logged to
  `console.warn`; tracing never breaks a tick.

## Config

- `pnpm add opik` in `@civ/zerog`.
- `.env`: `OPIK_API_KEY`, `OPIK_URL_OVERRIDE=https://www.comet.com/opik/api`,
  `OPIK_WORKSPACE`, `OPIK_PROJECT_NAME=civilization-0`.

## Testing

Vitest unit tests with a fake Opik client + `FakeBrain`:

1. Disabled (no client) = strict pass-through; `decide()` result unchanged.
2. Enabled = trace opened with correct input/output; child `llm` span nested
   with model/usage/verified metadata.
3. A thrown Opik error inside a decorator does not propagate.
