import { describe, it, expect, vi } from "vitest";

vi.mock("@civ/persistence/src/pool", () => ({ getPool: () => ({}) }));
vi.mock("@civ/persistence/src/read", () => ({
  readDecisionChainRaw: vi.fn(async () => ({
    decisionId: "d1",
    action: "invest",
    targetId: "marcus",
    reasoning: "trust",
    provider: "0xP",
    model: "qwen",
    verified: true,
    memories: [],
    beliefs: [],
    event: null,
    rootHash: "0xroot",
    txHash: "0xtx",
    socialDrivers: [
      {
        id: "marcus",
        name: "Marcus Vale",
        relationshipStrength: 0.68,
        relevance: 0.46,
        blendedScore: 0.31,
        trust: 71,
        influence: 65,
        neighborText: "steady",
      },
    ],
    socialQuery: "who do I trust?",
    orgDriver: null,
  })),
}));

import { GET } from "./route";

describe("GET /api/citizen-chain", () => {
  it("returns a causal chain with the social node", async () => {
    const res = await GET(new Request("http://x/api/citizen-chain?id=ada"));
    const j = await res.json();
    expect(j.ok).toBe(true);
    expect(j.chain.nodes.map((n: { kind: string }) => n.kind)).toContain("social");
  });

  it("400s without an id", async () => {
    const res = await GET(new Request("http://x/api/citizen-chain"));
    expect(res.status).toBe(400);
  });
});
