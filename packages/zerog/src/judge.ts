import type { DecisionContext, DecisionResult } from "@civ/brain";
import type { Chat, ChatMessage, ChatResult } from "./brain";

export interface JudgeScores {
  inCharacter: number;
  goalAlignment: number;
}

export interface JudgeResult {
  scores: JudgeScores;
  reasoning: string;
  raw: ChatResult;
  prompt: ChatMessage[];
}

/** Grades a single decision. Returns null when grading can't be trusted. */
export interface DecisionJudge {
  grade(ctx: DecisionContext, decision: DecisionResult): Promise<JudgeResult | null>;
}

const JUDGE_SCHEMA = `Return ONLY a JSON object, no prose, no markdown fences:
{"inCharacter": <0..1>, "goalAlignment": <0..1>, "reasoning": <short string>}
- inCharacter: how well the action fits THIS person's traits, occupation and goal
  (a high score means in-character, NOT objectively optimal).
- goalAlignment: how plausibly the action advances their stated goal.`;

export function buildJudgePrompt(ctx: DecisionContext, decision: DecisionResult): ChatMessage[] {
  const traits = Object.entries(ctx.citizen.traits).map(([k, v]) => `${k} ${v}`).join(", ");
  const system = `You are an impartial evaluator of in-character role-play decisions. Grade the decision on two 0..1 scales.
${JUDGE_SCHEMA}`;
  const user = `Citizen: ${ctx.citizen.name}, a ${ctx.citizen.occupation}, age ${ctx.citizen.age}. Traits: ${traits}.
Goal: ${ctx.goal?.description ?? "(none)"}.
World: day ${ctx.worldState.day}. ${ctx.worldState.headline}.
Allowed actions were: ${ctx.availableActions.join(", ")}.

Decision to grade:
- action: ${decision.action}
- target: ${decision.targetId ?? "(none)"}
- reasoning: ${decision.reasoning || "(none given)"}

Score this decision and return ONLY the JSON.`;
  return [{ role: "system", content: system }, { role: "user", content: user }];
}

function clamp01(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : null;
}

function extractJson(content: string): Record<string, unknown> | null {
  const cleaned = content.replace(/```(?:json)?/gi, "").trim();
  const tryParse = (s: string): Record<string, unknown> | null => {
    try { const v = JSON.parse(s); return v && typeof v === "object" ? (v as Record<string, unknown>) : null; }
    catch { return null; }
  };
  const direct = tryParse(cleaned);
  if (direct) return direct;
  const start = cleaned.indexOf("{");
  const end = cleaned.lastIndexOf("}");
  if (start >= 0 && end > start) return tryParse(cleaned.slice(start, end + 1));
  return null;
}

export function parseJudgeResult(content: string): { scores: JudgeScores; reasoning: string } | null {
  const obj = extractJson(content);
  if (!obj) return null;
  const inCharacter = clamp01(obj.inCharacter);
  const goalAlignment = clamp01(obj.goalAlignment);
  if (inCharacter === null || goalAlignment === null) return null;
  return { scores: { inCharacter, goalAlignment }, reasoning: typeof obj.reasoning === "string" ? obj.reasoning : "" };
}

export class ZeroGJudge implements DecisionJudge {
  constructor(private readonly chat: Chat) {}

  async grade(ctx: DecisionContext, decision: DecisionResult): Promise<JudgeResult | null> {
    const prompt = buildJudgePrompt(ctx, decision);
    const raw = await this.chat.complete(prompt);
    const parsed = parseJudgeResult(raw.content);
    if (!parsed) return null;
    return { scores: parsed.scores, reasoning: parsed.reasoning, raw, prompt };
  }
}
