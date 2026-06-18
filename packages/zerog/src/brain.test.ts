import { describe, it, expect } from "vitest";
import type { DecisionContext } from "@civ/brain";
import { ZeroGComputeBrain, tryParseDecision, type Chat, type ChatMessage, type ChatResult } from "./brain";
import { ZeroGBrainError } from "./errors";

function ctxOf(): DecisionContext {
  return {
    citizen: { id: "ada", name: "Ada", occupation: "Engineer", age: 29,
      traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
      wealth: 0, reputation: 50, tier: 3, createdDay: 0 },
    goal: { id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true },
    memories: [{ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job", embedding: [] }],
    beliefs: [{ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.8, sourceMemoryIds: ["m0"], updatedDay: 2 }],
    relationships: [], worldState: { day: 3, economy: {}, headline: "Recession" },
    availableActions: ["work", "start_company"],
  };
}

class FakeChat implements Chat {
  calls = 0;
  constructor(private replies: string[], private meta: Partial<ChatResult> = {}) {}
  async complete(_messages: ChatMessage[]): Promise<ChatResult> {
    const content = this.replies[Math.min(this.calls, this.replies.length - 1)];
    this.calls++;
    return { content, provider: this.meta.provider ?? "0xprov", model: this.meta.model ?? "llama-x", verified: this.meta.verified ?? true, requestId: "req1" };
  }
}

describe("tryParseDecision", () => {
  it("parses valid JSON", () => {
    const d = tryParseDecision('{"action":"start_company","targetId":"marcus","reasoning":"r","memoryWeights":{"m1":1},"beliefWeights":{"b1":0.8}}', ctxOf());
    expect(d?.action).toBe("start_company");
    expect(d?.memoryWeights).toEqual({ m1: 1 });
    expect(d?.beliefWeights).toEqual({ b1: 0.8 });
  });
  it("strips markdown fences", () => {
    const d = tryParseDecision('```json\n{"action":"work"}\n```', ctxOf());
    expect(d?.action).toBe("work");
  });
  it("coerces missing optional fields to defaults", () => {
    const d = tryParseDecision('{"action":"work"}', ctxOf());
    expect(d).toMatchObject({ action: "work", targetId: null, reasoning: "", memoryWeights: {}, beliefWeights: {} });
  });
  it("drops hallucinated memory/belief ids (hard subset invariant)", () => {
    const d = tryParseDecision('{"action":"work","memoryWeights":{"m1":1,"m999":1},"beliefWeights":{"b1":0.5,"b999":0.9}}', ctxOf());
    expect(Object.keys(d!.memoryWeights)).toEqual(["m1"]);
    expect(Object.keys(d!.beliefWeights)).toEqual(["b1"]);
  });
  it("clamps weights to [0,1] and drops non-numeric", () => {
    const d = tryParseDecision('{"action":"work","memoryWeights":{"m1":5},"beliefWeights":{"b1":"high"}}', ctxOf());
    expect(d!.memoryWeights).toEqual({ m1: 1 });
    expect(d!.beliefWeights).toEqual({});
  });
  it("returns null for an action not in availableActions", () => {
    expect(tryParseDecision('{"action":"teleport"}', ctxOf())).toBeNull();
  });
  it("returns null for unparseable content", () => {
    expect(tryParseDecision("not json at all", ctxOf())).toBeNull();
  });
});

describe("ZeroGComputeBrain.decide", () => {
  it("returns the decision and attaches execution meta", async () => {
    const brain = new ZeroGComputeBrain(new FakeChat(['{"action":"start_company","targetId":"marcus","reasoning":"r","memoryWeights":{"m1":1},"beliefWeights":{}}']), "llama-x");
    const d = await brain.decide(ctxOf());
    expect(d.action).toBe("start_company");
    expect(d.meta).toMatchObject({ provider: "0xprov", model: "llama-x", verified: true });
  });
  it("retries once with a repair prompt, then succeeds", async () => {
    const chat = new FakeChat(["garbage", '{"action":"work"}']);
    const brain = new ZeroGComputeBrain(chat, "llama-x");
    const d = await brain.decide(ctxOf());
    expect(d.action).toBe("work");
    expect(chat.calls).toBe(2);
  });
  it("throws ZeroGBrainError when still invalid after repair", async () => {
    const brain = new ZeroGComputeBrain(new FakeChat(["garbage", "still garbage"]), "llama-x");
    await expect(brain.decide(ctxOf())).rejects.toBeInstanceOf(ZeroGBrainError);
  });
});
