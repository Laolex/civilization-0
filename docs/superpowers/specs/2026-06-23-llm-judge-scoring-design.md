# LLM-as-Judge Scoring for Citizen Decisions — Design

Date: 2026-06-23
Status: Approved

## Goal

Automatically grade every citizen/org decision for quality and attach the
scores to the Opik trace we already create, so each decision in the dashboard
carries an objective signal of whether the agent stayed in character and acted
toward its goal.

## Decisions (locked)

- **Online live scoring** — grade as the sim ticks; attach feedback scores to
  the live decision trace. (Offline experiment harness is a possible follow-on.)
- **Judge model = 0G compute** — grade with the same on-network LLM the citizens
  think on. Self-contained, no new key, judgments are 0G-verifiable.
- **Two dimensions** — `in_character` (did the action fit traits/occupation/goal
  rather than the generic optimal move) and `goal_alignment` (does it plausibly
  advance the stated goal). Each scored 0..1.
- **Synchronous grading** — awaited before the tick returns, so the score is on
  the trace before it flushes.

## Components

New module `packages/zerog/src/judge.ts` — grading is a domain concern, kept
separate from observability (`opik-tracing.ts`).

- `interface DecisionJudge { grade(ctx, decision): Promise<JudgeResult | null> }`
- `JudgeResult = { scores: { inCharacter: number; goalAlignment: number };
  reasoning: string; raw: ChatResult; prompt: ChatMessage[] }`
- `class ZeroGJudge implements DecisionJudge` — wraps a `Chat`; builds a compact
  grading prompt, calls the LLM, parses tolerant JSON, clamps scores to [0,1].
  Returns `null` on any parse failure (no score beats a wrong score).
- Pure helpers `buildJudgePrompt(ctx, decision)` and `parseJudgeResult(content)`
  for isolated unit testing.

## Integration

Extend `instrumentBrain` to accept an optional judge:
`instrumentBrain(brain, client?, judge?)`.

After `decide()` returns, still inside the trace's `AsyncLocalStorage` scope:
1. `judge.grade(ctx, result)`.
2. On a non-null result: record a child `judge` span (prompt as input; scores +
   reasoning + model + token usage + 0G `verified` as output), then attach two
   trace feedback scores — `in_character` and `goal_alignment` — each with the
   judge's reasoning as the `reason`.

All best-effort: any judge or Opik error is swallowed. Grading can never break a
tick.

`OpikTraceLike` gains a `score(s: { name; value; reason? })` method.

## Factory wiring

In `createZeroGComputeBrain()`:

```
const chat = await RealChat.create(config);
const judge = new ZeroGJudge(chat);            // raw chat: its call surfaces only as the "judge" span
const brain = new ZeroGComputeBrain(instrumentChat(chat), chat.modelName);
return instrumentBrain(brain, getOpikClient(), judge);
```

The `Chat` is shared (stateless per call); the citizen brain uses the
instrumented wrapper, the judge uses the raw one — no double-tracing.

## Behavior / cost

- Grading runs only when Opik is configured (scores need a trace to land on) and
  a judge is present. No `OPIK_API_KEY` ⇒ no judge call ⇒ zero added cost.
- When on, each decision makes one extra 0G call (the judge), awaited before
  flush. Roughly doubles per-tick 0G spend; acceptable at the current tick rate.

## Testing (TDD)

1. `buildJudgePrompt` includes the chosen action and the citizen's traits, and
   asks for both score fields.
2. `parseJudgeResult`: valid JSON → clamped scores; out-of-range clamped;
   markdown fences stripped; missing field → null; non-JSON → null.
3. `ZeroGJudge.grade`: valid JSON → scores + raw + prompt; garbage → null.
4. `instrumentBrain` with a judge: trace gets `in_character` + `goal_alignment`
   feedback scores and a `judge` span; decision result unchanged.
5. A judge that throws still returns the decision (best-effort).
