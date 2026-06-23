# Offline Experiment Harness for Decision Quality — Design

Date: 2026-06-23
Status: Approved

## Goal

Turn the live in-character/goal-alignment scores into a tool for *improving*
agent quality: run a curated set of decision scenarios through a brain variant,
grade each with the 0G judge, and log an Opik **experiment** with aggregated
scores — so two runs (e.g. prompt v1 vs v2) render as a side-by-side comparison.

## Decisions (locked)

- **In-run prompt A/B** — compare two decision-prompt variants. Requires
  parameterizing the prompt builder in `ZeroGComputeBrain` (backward-compatible).
- **Curated seed scenarios now**, harvest from real decisions later.
- Dataset name: `civ-decisions-seed`.
- Judge = the existing `ZeroGJudge` (0G), reused as the scoring metric.

## Module layout

New folder `packages/zerog/src/eval/`, deliberately **not** re-exported from the
package `index.ts`. The eval code imports the Opik SDK statically; keeping it out
of the index preserves the core path's lazy-Opik loading (web app / engine never
pull in the SDK). The experiment script and tests import the eval modules by
relative path.

## Components

### 1. Prompt-builder injection — `brain.ts`
- `export type PromptBuilder = (ctx: DecisionContext) => ChatMessage[]`.
- `buildMessages` stays the default builder.
- `ZeroGComputeBrain` constructor gains optional
  `promptBuilder: PromptBuilder = buildMessages`, used in `decide()`. Existing
  `new ZeroGComputeBrain(chat, model)` is unchanged.

### 2. Seed scenarios — `eval/scenarios.ts`
- `interface DecisionScenario { id: string; context: DecisionContext }`.
- `SEED_SCENARIOS`: ~5 curated situations probing different traits/goals.
  Pure data, deterministic.

### 3. Prompt variants — `eval/prompt-variants.ts`
- `promptV1` = current `buildMessages`.
- `promptV2` = a hypothesis with stronger trait-consistency framing.
  Both are `PromptBuilder`s, individually unit-testable.

### 4. Judge-as-metric — `eval/judge-metric.ts`
- `InCharacterMetric extends BaseMetric` (Opik scoring interface), wrapping a
  `DecisionJudge`.
- `validationSchema` (zod, permissive): `{ context, decision }`.
- `score({context, decision})` → `judge.grade(context, decision)`:
  - on a result: returns two `EvaluationScoreResult`s — `in_character` and
    `goal_alignment` (value + the judge's reasoning as `reason`);
  - on `null` (ungradeable): returns `[]` so the item is omitted, not scored 0.

### 5. Harness — `eval/experiment.ts`
- `runDecisionExperiment(opts, deps?)` where
  `opts = { scenarios, brain, judge, experimentName, experimentConfig?, datasetName? }`.
  - get-or-create the dataset; `insert` `{ scenarioId, context }` per scenario
    (idempotent — Opik dedups by content);
  - `task = (item) => ({ decision: await brain.decide(item.context) })`;
  - `scoringMetrics = [new InCharacterMetric(judge)]`;
  - call `evaluate({ dataset, task, scoringMetrics, experimentName,
    experimentConfig, client })`; return the `EvaluationResult`.
- `deps = { client, evaluate }` defaults to the real Opik client + SDK
  `evaluate`, and is injected with fakes in tests (no network, no spend).

### 6. CLI — `scripts/run-experiment.ts`
- Builds the real 0G chat + `ZeroGJudge`, then runs `SEED_SCENARIOS` under
  `promptV1` and `promptV2` as two named experiments; prints both Opik URLs and
  aggregate scores. Guarded on Opik + 0G config; warns about 0G spend.

## Cost

A real run ≈ 2 variants × ~5 scenarios × (1 decision + 1 judge) ≈ 20 0G calls.
Fine for occasional evals. The harness is brain/judge-agnostic, so tests and
dry-runs use fakes for zero spend.

## Error handling

- Judge failure on an item → metric returns `[]` (item omitted), never throws.
- The harness surfaces SDK/network errors from `evaluate` to the caller (an
  experiment run is an explicit, foreground action — unlike live tracing, it
  should fail loudly rather than silently).

## Testing (TDD)

1. `ZeroGComputeBrain` calls the injected `promptBuilder` (variant messages reach
   the chat); default still uses `buildMessages`.
2. `promptV2` differs from `promptV1` and still yields a valid system+user pair
   containing the citizen and the action schema.
3. `InCharacterMetric.score` → two correctly-named results from a fake judge;
   `[]` when the judge returns null.
4. `runDecisionExperiment` with injected fake `evaluate` + fake client: the task
   runs `brain.decide` per scenario, the metric is wired in, and experiment
   name/config pass through. No network.
