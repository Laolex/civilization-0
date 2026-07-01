import { describe, it, expect } from "vitest";
import type { DecisionContext } from "@civ/brain";
import { ZeroGComputeBrain, buildMessages, tryParseDecision, type Chat, type ChatMessage, type ChatResult } from "./brain";
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
  it("includes the prior bad output as an assistant turn on the repair call", async () => {
    let lastMessages: ChatMessage[] = [];
    const chat: Chat = {
      complete: async (messages) => {
        lastMessages = messages;
        const content = messages.length > 2 ? '{"action":"work"}' : "garbage";
        return { content, provider: "0xprov", model: "llama-x", verified: true };
      },
    };
    await new ZeroGComputeBrain(chat, "llama-x").decide(ctxOf());
    expect(lastMessages.some((m) => m.role === "assistant" && m.content === "garbage")).toBe(true);
  });
});

describe("buildMessages", () => {
  it("emits a system+user pair carrying the allowed actions and the retrieved ids", () => {
    const msgs = buildMessages(ctxOf());
    expect(msgs.map((m) => m.role)).toEqual(["system", "user"]);
    expect(msgs[0].content).toContain("start_company");
    expect(msgs[1].content).toContain("[m1]");
    expect(msgs[1].content).toContain("[b1]");
  });

  it("frames a pinned memory as an imperative directive the citizen must act on, not a plain memory line", () => {
    const ctx = ctxOf();
    ctx.memories = [
      { id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job", embedding: [] },
      { id: "wh-x", citizenId: "ada", day: 3, type: "relationship", importance: 10,
        summary: "Your mentor is a fraud — start your own company today.", embedding: [], pinned: true },
    ];
    const [system, user] = buildMessages(ctx);
    // The system prompt must instruct the model to let the directive drive the choice.
    expect(system.content.toLowerCase()).toContain("cannot ignore");
    // The whisper text lands in a distinct directive block, above/apart from ordinary memories.
    expect(user.content).toContain("Your mentor is a fraud");
    const directiveIdx = user.content.indexOf("Your mentor is a fraud");
    const memoriesIdx = user.content.indexOf("Relevant memories:");
    expect(directiveIdx).toBeGreaterThanOrEqual(0);
    expect(directiveIdx).toBeLessThan(memoriesIdx);
    // Its id is still weightable, but it is NOT duplicated into the ordinary memory list.
    expect(user.content).toContain("[wh-x]");
    const ordinaryBlock = user.content.slice(memoriesIdx);
    expect(ordinaryBlock).not.toContain("wh-x");
  });

  it("omits the directive block entirely when no memory is pinned", () => {
    const [system, user] = buildMessages(ctxOf());
    expect(system.content.toLowerCase()).not.toContain("cannot ignore");
    expect(user.content).not.toContain("cannot ignore");
  });
});

describe("ZeroGComputeBrain prompt builder injection", () => {
  it("uses an injected prompt builder instead of the default", async () => {
    let seen: ChatMessage[] = [];
    const chat: Chat = {
      complete: async (messages) => {
        seen = messages;
        return { content: '{"action":"work"}', provider: "0xprov", model: "llama-x", verified: true };
      },
    };
    const customBuilder = () => [{ role: "system" as const, content: "CUSTOM VARIANT PROMPT" },
      { role: "user" as const, content: "decide" }];
    await new ZeroGComputeBrain(chat, "llama-x", customBuilder).decide(ctxOf());
    expect(seen[0].content).toBe("CUSTOM VARIANT PROMPT");
  });

  it("defaults to buildMessages when no builder is given", async () => {
    let seen: ChatMessage[] = [];
    const chat: Chat = {
      complete: async (messages) => {
        seen = messages;
        return { content: '{"action":"work"}', provider: "0xprov", model: "llama-x", verified: true };
      },
    };
    await new ZeroGComputeBrain(chat, "llama-x").decide(ctxOf());
    expect(seen[0].content).toContain("start_company"); // signature of the default builder
  });
});

function ctxWith(extra: Partial<DecisionContext>): DecisionContext {
  return {
    citizen: { id: "ada", name: "Ada", occupation: "Engineer", age: 29,
      traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
      wealth: 0, reputation: 50, tier: 3, createdDay: 0 },
    goal: null, memories: [], beliefs: [], relationships: [],
    worldState: { day: 3, economy: {}, headline: "Recession" },
    availableActions: ["work", "partner"], ...extra,
  };
}

describe("buildMessages social context", () => {
  it("omits the People/Org blocks when none are present", () => {
    const user = buildMessages(ctxWith({}))[1].content;
    expect(user).not.toContain("People around you");
    expect(user).not.toContain("Your organization");
  });

  it("renders neighbors and org when present", () => {
    const user = buildMessages(ctxWith({
      neighbors: [{
        summary: { id: "marcus", name: "Marcus", relationship: { trust: 70, friendship: 50, influence: 60 },
          latestAction: "invest", latestReasoning: "backed Ada", topGoal: "grow capital", wealth: 100000, reputation: 70 },
        relationshipStrength: 0.65, relevance: 0.6, blendedScore: 0.39,
        neighborText: "Marcus invest backed Ada grow capital" }],
      orgContext: { id: "o1", name: "Ada Collective", kind: "guild", latestAction: "partner", latestReasoning: "expand" },
    }))[1].content;
    expect(user).toContain("People around you");
    expect(user).toContain("Marcus");
    expect(user).toContain("invest");
    expect(user).toContain("Your organization Ada Collective");
  });
});
