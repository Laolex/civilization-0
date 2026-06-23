import { describe, it, expect } from "vitest";
import type { DecisionContext, BrainProvider } from "@civ/brain";
import { FakeBrain } from "@civ/brain";
import { ZeroGComputeBrain, type Chat, type ChatMessage, type ChatResult } from "./brain";
import { instrumentBrain, instrumentChat, getOpikClient, __resetOpikClient, type OpikClientLike } from "./opik-tracing";

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

// --- Recording fake conforming to OpikClientLike ---
class FakeSpan {
  ended = false;
  updates: Record<string, unknown>[] = [];
  constructor(public data: Record<string, unknown>) {}
  update(u: Record<string, unknown>) { this.updates.push(u); return this; }
  end() { this.ended = true; return this; }
}
class FakeTrace {
  ended = false;
  updates: Record<string, unknown>[] = [];
  spans: FakeSpan[] = [];
  constructor(public data: Record<string, unknown>) {}
  span(d: Record<string, unknown>) { const s = new FakeSpan(d); this.spans.push(s); return s; }
  update(u: Record<string, unknown>) { this.updates.push(u); return this; }
  end() { this.ended = true; return this; }
}
class FakeOpik implements OpikClientLike {
  traces: FakeTrace[] = [];
  flushed = 0;
  trace(d: Record<string, unknown>) { const t = new FakeTrace(d); this.traces.push(t); return t; }
  async flush() { this.flushed++; }
}

class FakeChat implements Chat {
  calls = 0;
  constructor(private replies: string[]) {}
  async complete(_m: ChatMessage[]): Promise<ChatResult> {
    const content = this.replies[Math.min(this.calls, this.replies.length - 1)];
    this.calls++;
    return { content, provider: "0xprov", model: "llama-x", requestId: "req1", verified: true,
      usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 } };
  }
}

const VALID = '{"action":"start_company","targetId":"marcus","reasoning":"build it","memoryWeights":{"m1":1},"beliefWeights":{}}';

describe("getOpikClient", () => {
  it("returns null when OPIK_API_KEY is unset", () => {
    const prev = process.env.OPIK_API_KEY;
    delete process.env.OPIK_API_KEY;
    __resetOpikClient();
    try {
      expect(getOpikClient()).toBeNull();
    } finally {
      if (prev !== undefined) process.env.OPIK_API_KEY = prev;
      __resetOpikClient();
    }
  });

  it("loads a real Opik client when OPIK_API_KEY is set (ESM-safe import)", () => {
    const prev = { key: process.env.OPIK_API_KEY, ws: process.env.OPIK_WORKSPACE };
    process.env.OPIK_API_KEY = "test-key";
    process.env.OPIK_WORKSPACE = "test-ws";
    __resetOpikClient();
    try {
      const client = getOpikClient();
      expect(client).not.toBeNull();
      expect(typeof client!.trace).toBe("function");
    } finally {
      if (prev.key === undefined) delete process.env.OPIK_API_KEY; else process.env.OPIK_API_KEY = prev.key;
      if (prev.ws === undefined) delete process.env.OPIK_WORKSPACE; else process.env.OPIK_WORKSPACE = prev.ws;
      __resetOpikClient();
    }
  });
});

describe("instrumentBrain / instrumentChat — disabled", () => {
  it("returns the brain unchanged when client is null (strict pass-through)", () => {
    const brain = new FakeBrain((c) => ({ action: "work", targetId: null, reasoning: "", memoryWeights: {}, beliefWeights: {} } as never));
    expect(instrumentBrain(brain, null)).toBe(brain);
  });

  it("returns the chat unchanged when client is null (strict pass-through)", () => {
    const chat = new FakeChat([VALID]);
    expect(instrumentChat(chat, null)).toBe(chat);
  });
});

describe("instrumentBrain — enabled", () => {
  it("opens one trace per decision with citizen input and decision output, and returns the result unchanged", async () => {
    const client = new FakeOpik();
    const inner: BrainProvider = new ZeroGComputeBrain(new FakeChat([VALID]), "llama-x");
    const wrapped = instrumentBrain(inner, client);

    const result = await wrapped.decide(ctxOf());

    expect(result.action).toBe("start_company");
    expect(client.traces).toHaveLength(1);
    const trace = client.traces[0];
    expect(String(trace.data.name)).toContain("Ada");
    expect(JSON.stringify(trace.data.input)).toContain("Engineer");
    // decision recorded on the trace output (via update or initial data)
    const recordedOutput = JSON.stringify([trace.data.output, ...trace.updates]);
    expect(recordedOutput).toContain("start_company");
    expect(trace.ended).toBe(true);
  });
});

describe("instrumentChat under an active brain trace — nesting via AsyncLocalStorage", () => {
  it("attaches an llm span to the active trace with model, output and usage", async () => {
    const client = new FakeOpik();
    const chat = instrumentChat(new FakeChat([VALID]), client);
    const brain = instrumentBrain(new ZeroGComputeBrain(chat, "llama-x"), client);

    await brain.decide(ctxOf());

    expect(client.traces).toHaveLength(1); // span nested in the brain trace, not a standalone one
    const spans = client.traces[0].spans;
    expect(spans).toHaveLength(1);
    expect(spans[0].data.type).toBe("llm");
    const recorded = JSON.stringify([spans[0].data, ...spans[0].updates]);
    expect(recorded).toContain("llama-x");
    expect(recorded).toContain("total_tokens");
    expect(spans[0].ended).toBe(true);
  });

  it("creates a span per LLM call so a JSON-repair retry is visible", async () => {
    const client = new FakeOpik();
    const chat = instrumentChat(new FakeChat(["garbage", VALID]), client);
    const brain = instrumentBrain(new ZeroGComputeBrain(chat, "llama-x"), client);

    await brain.decide(ctxOf());

    expect(client.traces[0].spans).toHaveLength(2);
  });

  it("opens a standalone trace when complete() runs with no active brain trace", async () => {
    const client = new FakeOpik();
    const chat = instrumentChat(new FakeChat([VALID]), client);

    await chat.complete([{ role: "user", content: "hi" }]);

    expect(client.traces).toHaveLength(1);
    expect(client.traces[0].spans).toHaveLength(1);
  });
});

describe("tracing never breaks a tick — errors are swallowed", () => {
  it("returns the decision even when the Opik client throws", async () => {
    const throwing: OpikClientLike = {
      trace() { throw new Error("opik down"); },
      async flush() { throw new Error("opik down"); },
    };
    const brain = instrumentBrain(new ZeroGComputeBrain(new FakeChat([VALID]), "llama-x"), throwing);
    const result = await brain.decide(ctxOf());
    expect(result.action).toBe("start_company");
  });

  it("returns the completion even when span creation throws", async () => {
    const badTrace = { span() { throw new Error("boom"); }, update() { return this; }, end() { return this; } };
    const client: OpikClientLike = { trace() { return badTrace as never; }, async flush() {} };
    const chat = instrumentChat(new FakeChat([VALID]), client);
    const res = await chat.complete([{ role: "user", content: "hi" }]);
    expect(res.content).toContain("start_company");
  });
});
