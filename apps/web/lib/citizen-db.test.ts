import { describe, it, expect } from "vitest";
import { toCausalChain, type RawChainInput } from "./citizen-db";

const raw = {
  decisionId: "d1", action: "invest", targetId: "kai", reasoning: "Back Kai",
  provider: "0xprov", model: "qwen", verified: true,
  memories: [{ id: "m1", summary: "Met Kai", day: 1, weight: 0.7 }],
  beliefs: [{ id: "b1", statement: "Trust pays off", confidence: 0.8, weight: 0.9 }],
  event: { id: "e1", day: 2, type: "invest", targetId: "kai" },
  rootHash: "0xroot", txHash: "0xtx",
};

describe("toCausalChain", () => {
  it("orders nodes memory→belief→compute→decision→event→storage", () => {
    const v = toCausalChain(raw);
    expect(v.nodes.map((n) => n.kind)).toEqual(["memory", "belief", "compute", "decision", "event", "storage"]);
    expect(v.rootHash).toBe("0xroot");
    expect(v.nodes[0].weight).toBe(0.7);
    expect(v.nodes[2].detail.verified).toBe("true");
  });
});

const base: RawChainInput = {
  decisionId: "d1", action: "invest", targetId: "marcus", reasoning: "trust",
  provider: "0xP", model: "qwen", verified: true,
  memories: [{ id: "m1", summary: "Marcus helped me", day: 3, weight: 0.6 }],
  beliefs: [{ id: "b1", statement: "Marcus is trustworthy", confidence: 0.8, weight: 0.8 }],
  event: { id: "e1", day: 12, type: "invest", targetId: "marcus" },
  rootHash: "0xroot", txHash: "0xtx",
  socialDrivers: [
    { id: "marcus", name: "Marcus Vale", relationshipStrength: 0.68, relevance: 0.46, blendedScore: 0.31, trust: 71, influence: 65, neighborText: "Marcus invests steadily" },
  ],
  socialQuery: "who do I trust on risk?",
  orgDriver: { id: "o1", name: "Harborline Guild", action: "partner", reasoning: "favor steady partners" },
};

describe("toCausalChain social node", () => {
  it("inserts a social node after beliefs and before compute when drivers exist", () => {
    const kinds = toCausalChain(base).nodes.map((n) => n.kind);
    expect(kinds).toEqual(["memory", "belief", "social", "compute", "decision", "event", "storage"]);
  });

  it("carries the drivers + query onto the social node", () => {
    const social = toCausalChain(base).nodes.find((n) => n.kind === "social")!;
    expect(social.socialQuery).toBe("who do I trust on risk?");
    expect(social.socialDrivers?.[0]).toMatchObject({ id: "marcus", blendedScore: 0.31 });
    expect(social.orgDriver?.name).toBe("Harborline Guild");
  });

  it("omits the social node when there are no drivers", () => {
    const kinds = toCausalChain({ ...base, socialDrivers: [], orgDriver: undefined, socialQuery: undefined }).nodes.map((n) => n.kind);
    expect(kinds).toEqual(["memory", "belief", "compute", "decision", "event", "storage"]);
  });
});
