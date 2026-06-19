import { describe, it, expect } from "vitest";
import { FakeBrain } from "@civ/brain";
import { FakeStorage } from "@civ/storage";
import type { DecisionContext, DecisionResult } from "@civ/brain";
import { Provenance } from "./provenance";

// A brain that weights ONLY m1 and b1, ignoring the other provided inputs —
// this is the moat: the trace must record what actually drove the decision,
// not everything that was passed in.
function subsetBrain(): FakeBrain {
  return new FakeBrain((ctx: DecisionContext): DecisionResult => ({
    action: ctx.availableActions[0],
    targetId: "counterparty",
    reasoning: "momentum looks durable",
    memoryWeights: { m1: 0.8 },
    beliefWeights: { b1: 0.6 },
    meta: { provider: "0xprovider", model: "qwen-test", verified: true },
  }));
}

function input() {
  return {
    agent: "trading-agent-01",
    question: "Should I open a long on ETH right now?",
    memories: [
      { id: "m1", summary: "ETH broke resistance", importance: 8 },
      { id: "m2", summary: "unrelated gossip", importance: 2 },
    ],
    beliefs: [
      { id: "b1", statement: "momentum persists short-term", confidence: 0.7 },
      { id: "b2", statement: "the moon is made of cheese", confidence: 0.1 },
    ],
    actions: ["open_long", "open_short", "hold"],
  };
}

describe("Provenance.trace", () => {
  it("records the brain-assigned drivers, not every retrieved input", async () => {
    const civ = new Provenance({ brain: subsetBrain(), storage: new FakeStorage() });
    const result = await civ.trace(input());

    expect(result.drivers.memories).toEqual([{ id: "m1", weight: 0.8 }]);
    expect(result.drivers.beliefs).toEqual([{ id: "b1", weight: 0.6 }]);
  });

  it("returns the decision chosen from the allowed action set", async () => {
    const civ = new Provenance({ brain: subsetBrain(), storage: new FakeStorage() });
    const result = await civ.trace(input());

    expect(result.decision.action).toBe("open_long");
    expect(result.decision.targetId).toBe("counterparty");
    expect(result.decision.reasoning).toBe("momentum looks durable");
  });

  it("surfaces the 0G Compute verification flag", async () => {
    const civ = new Provenance({ brain: subsetBrain(), storage: new FakeStorage() });
    const result = await civ.trace(input());

    expect(result.verified).toBe(true);
  });

  it("archives a provenance record and returns its root hash and verify url", async () => {
    const storage = new FakeStorage();
    const civ = new Provenance({ brain: subsetBrain(), storage, verifyBaseUrl: "https://verify.civ0.xyz" });
    const result = await civ.trace(input());

    expect(storage.calls).toHaveLength(1);
    expect(storage.calls[0].key).toMatch(/^provenance\//);

    const archived = storage.calls[0].data as Record<string, unknown>;
    expect(archived.schema).toBe("civ.provenance/v0");
    expect(archived.drivers).toEqual({
      memories: [{ id: "m1", weight: 0.8 }],
      beliefs: [{ id: "b1", weight: 0.6 }],
    });

    expect(result.rootHash).toBe(storage.calls[0].result.rootHash);
    expect(result.verifyUrl).toBe(`https://verify.civ0.xyz/${result.rootHash}`);
  });
});
