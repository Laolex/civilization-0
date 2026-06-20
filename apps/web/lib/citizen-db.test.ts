import { describe, it, expect } from "vitest";
import { toCausalChain } from "./citizen-db";

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
