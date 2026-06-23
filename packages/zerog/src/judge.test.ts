import { describe, it, expect } from "vitest";
import type { DecisionContext, DecisionResult } from "@civ/brain";
import { type Chat, type ChatMessage, type ChatResult } from "./brain";
import { ZeroGJudge, buildJudgePrompt, parseJudgeResult } from "./judge";

function ctxOf(): DecisionContext {
  return {
    citizen: { id: "ada", name: "Ada", occupation: "Engineer", age: 29,
      traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
      wealth: 0, reputation: 50, tier: 3, createdDay: 0 },
    goal: { id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true },
    memories: [{ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job", embedding: [] }],
    beliefs: [{ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.8, sourceMemoryIds: ["m1"], updatedDay: 2 }],
    relationships: [], worldState: { day: 3, economy: {}, headline: "Recession" },
    availableActions: ["work", "start_company"],
  };
}

const decision: DecisionResult = {
  action: "start_company", targetId: "marcus", reasoning: "take the funding and build",
  memoryWeights: { m1: 0.9 }, beliefWeights: { b1: 0.8 },
};

class FakeChat implements Chat {
  lastMessages?: ChatMessage[];
  constructor(private reply: string) {}
  async complete(messages: ChatMessage[]): Promise<ChatResult> {
    this.lastMessages = messages;
    return { content: this.reply, provider: "0xprov", model: "llama-x", requestId: "req1", verified: true,
      usage: { total_tokens: 42 } };
  }
}

describe("buildJudgePrompt", () => {
  it("presents the chosen action, the citizen traits, and asks for both score fields", () => {
    const msgs = buildJudgePrompt(ctxOf(), decision);
    const text = msgs.map((m) => m.content).join("\n");
    expect(text).toContain("start_company");
    expect(text).toContain("Engineer");
    expect(text).toContain("ambition");
    expect(text).toContain("inCharacter");
    expect(text).toContain("goalAlignment");
  });
});

describe("parseJudgeResult", () => {
  it("parses valid JSON into clamped scores plus reasoning", () => {
    const r = parseJudgeResult('{"inCharacter":0.9,"goalAlignment":0.7,"reasoning":"fits an ambitious engineer"}');
    expect(r).toEqual({ scores: { inCharacter: 0.9, goalAlignment: 0.7 }, reasoning: "fits an ambitious engineer" });
  });
  it("clamps out-of-range scores to [0,1]", () => {
    const r = parseJudgeResult('{"inCharacter":1.8,"goalAlignment":-0.4}');
    expect(r?.scores).toEqual({ inCharacter: 1, goalAlignment: 0 });
  });
  it("strips markdown fences", () => {
    const r = parseJudgeResult('```json\n{"inCharacter":0.5,"goalAlignment":0.5}\n```');
    expect(r?.scores).toEqual({ inCharacter: 0.5, goalAlignment: 0.5 });
  });
  it("returns null when a score field is missing", () => {
    expect(parseJudgeResult('{"inCharacter":0.9}')).toBeNull();
  });
  it("returns null for non-numeric scores", () => {
    expect(parseJudgeResult('{"inCharacter":"high","goalAlignment":0.5}')).toBeNull();
  });
  it("returns null for unparseable content", () => {
    expect(parseJudgeResult("no json here")).toBeNull();
  });
});

describe("ZeroGJudge.grade", () => {
  it("returns scores, reasoning, the raw chat result and the prompt on valid JSON", async () => {
    const chat = new FakeChat('{"inCharacter":0.8,"goalAlignment":0.6,"reasoning":"on brand"}');
    const judge = new ZeroGJudge(chat);
    const r = await judge.grade(ctxOf(), decision);
    expect(r?.scores).toEqual({ inCharacter: 0.8, goalAlignment: 0.6 });
    expect(r?.reasoning).toBe("on brand");
    expect(r?.raw.model).toBe("llama-x");
    expect(r?.prompt).toEqual(chat.lastMessages);
  });
  it("returns null (graceful) when the judge LLM returns garbage", async () => {
    const judge = new ZeroGJudge(new FakeChat("not json at all"));
    expect(await judge.grade(ctxOf(), decision)).toBeNull();
  });
});
