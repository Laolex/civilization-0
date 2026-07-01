import { type ActionType } from "@civ/shared";
import type { BrainProvider, DecisionContext, DecisionResult } from "@civ/brain";
import { ZeroGBrainError } from "./errors";

export interface ChatMessage { role: "system" | "user" | "assistant"; content: string; }
export interface ChatResult {
  content: string; provider: string; model: string;
  requestId?: string; verified?: boolean; verification?: unknown;
  usage?: Record<string, number>;
}
export interface Chat { complete(messages: ChatMessage[]): Promise<ChatResult>; }

const SCHEMA = `Return ONLY a JSON object, no prose, no markdown fences:
{"action": <one of the allowed actions>, "targetId": <citizen id or null>, "reasoning": <short string>,
 "memoryWeights": {<memory id>: <0..1>}, "beliefWeights": {<belief id>: <0..1>}}
Only weight memory/belief ids that appear in the lists below.`;

export function buildMessages(ctx: DecisionContext): ChatMessage[] {
  const traits = Object.entries(ctx.citizen.traits).map(([k, v]) => `${k} ${v}`).join(", ");
  // Pinned memories are player interventions (a whisper or a dilemma's framing).
  // They must not read as one bland memory among many — a small model buries them
  // under the citizen's standing goal. Split them into an imperative directive
  // block that the system prompt tells the model to obey THIS turn.
  const pinnedMems = ctx.memories.filter((m) => m.pinned);
  const ordinaryMems = ctx.memories.filter((m) => !m.pinned);
  const directives = pinnedMems.map((m) => `- [${m.id}] ${m.summary}`).join("\n");
  const mems = ordinaryMems.map((m) => `- [${m.id}] (importance ${m.importance}) ${m.summary}`).join("\n") || "- (none)";
  const beliefs = ctx.beliefs.map((b) => `- [${b.id}] ${b.statement} (confidence ${b.confidence})`).join("\n") || "- (none)";
  const rels = ctx.relationships.map((r) => `- ${r.otherId}: trust ${r.trust}, friendship ${r.friendship}`).join("\n") || "- (none)";
  const people = (ctx.neighbors ?? []).map((n) => {
    const s = n.summary;
    const move = s.latestAction
      ? `${s.latestAction}${s.latestReasoning ? ` (${s.latestReasoning})` : ""}`
      : "no recent move";
    const drive = s.topGoal ?? s.strongestBelief ?? "unknown drive";
    return `- ${s.name}: trust ${s.relationship.trust}, influence ${s.relationship.influence}; recently ${move}; pursuing ${drive}; wealth ${s.wealth}, reputation ${s.reputation}`;
  }).join("\n");
  const org = ctx.orgContext
    ? `Your organization ${ctx.orgContext.name} (${ctx.orgContext.kind})` +
      (ctx.orgContext.latestAction
        ? ` recently chose to ${ctx.orgContext.latestAction}${ctx.orgContext.latestReasoning ? `: ${ctx.orgContext.latestReasoning}` : ""}.`
        : ".")
    : "";
  const system = `You are ${ctx.citizen.name}, a ${ctx.citizen.occupation}. Decide what THIS person would actually do, in character — not the objectively optimal move.${directives ? `
A sudden, intrusive compulsion has seized you this turn — you CANNOT ignore it (see "Compelling you right now"). Let it decisively drive your choice, even if it breaks from your usual habits or your standing goal.` : ""}
Allowed actions: ${ctx.availableActions.join(", ")}.
${SCHEMA}`;
  const user = `Identity: ${ctx.citizen.name}, age ${ctx.citizen.age}. Traits: ${traits}.
Goal: ${ctx.goal?.description ?? "(none)"}.
World: day ${ctx.worldState.day}. ${ctx.worldState.headline}.
${directives ? `Compelling you right now (you cannot ignore this — act on it this turn):
${directives}
` : ""}Relevant memories:
${mems}
Beliefs:
${beliefs}
Relationships:
${rels}
${people ? `People around you:\n${people}\n` : ""}${org ? `${org}\n` : ""}Choose ONE action and return the JSON.`;
  return [{ role: "system", content: system }, { role: "user", content: user }];
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

function filterWeights(raw: unknown, allowedIds: string[]): Record<string, number> {
  const out: Record<string, number> = {};
  if (raw && typeof raw === "object") {
    const obj = raw as Record<string, unknown>;
    for (const id of allowedIds) {
      const v = obj[id];
      if (typeof v === "number" && Number.isFinite(v)) out[id] = Math.max(0, Math.min(1, v));
    }
  }
  return out;
}

export function tryParseDecision(content: string, ctx: DecisionContext): DecisionResult | null {
  const obj = extractJson(content);
  if (!obj) return null;
  const action = obj.action;
  if (typeof action !== "string" || !ctx.availableActions.includes(action as ActionType)) return null;
  return {
    action: action as ActionType,
    targetId: typeof obj.targetId === "string" ? obj.targetId : null,
    reasoning: typeof obj.reasoning === "string" ? obj.reasoning : "",
    memoryWeights: filterWeights(obj.memoryWeights, ctx.memories.map((m) => m.id)),
    beliefWeights: filterWeights(obj.beliefWeights, ctx.beliefs.map((b) => b.id)),
  };
}

/** Builds the chat messages for a decision. Swappable to A/B prompt variants. */
export type PromptBuilder = (ctx: DecisionContext) => ChatMessage[];

export class ZeroGComputeBrain implements BrainProvider {
  readonly name = "0g-compute";
  constructor(
    private readonly chat: Chat,
    readonly model: string,
    private readonly promptBuilder: PromptBuilder = buildMessages,
  ) {}

  async decide(ctx: DecisionContext): Promise<DecisionResult> {
    const messages = this.promptBuilder(ctx);
    let result = await this.chat.complete(messages);
    let decision = tryParseDecision(result.content, ctx);
    if (!decision) {
      const badOutput: ChatMessage = { role: "assistant", content: result.content };
      const repair: ChatMessage = { role: "user", content: "Your previous output was not valid JSON matching the schema. Return ONLY the JSON object." };
      result = await this.chat.complete([...messages, badOutput, repair]);
      decision = tryParseDecision(result.content, ctx);
    }
    if (!decision) throw new ZeroGBrainError("0G Compute returned no valid decision after one repair attempt");
    decision.meta = {
      provider: result.provider, model: result.model,
      requestId: result.requestId, verified: result.verified, verification: result.verification,
    };
    return decision;
  }
}
