import { describe, it, expect } from "vitest";
import { FakeEmbedder } from "./index";
import { GraphRetriever } from "./graph-retriever";
import type { NeighborSummary } from "@civ/shared";

const N = (id: string, trust: number, influence: number, text: string): NeighborSummary => ({
  id, name: id, relationship: { trust, friendship: 50, influence },
  latestReasoning: text, wealth: 0, reputation: 50,
});

describe("GraphRetriever.selectNeighbors", () => {
  const gr = new GraphRetriever(new FakeEmbedder());

  it("returns [] for no candidates or k<=0", () => {
    expect(gr.selectNeighbors([], "x", 3)).toEqual([]);
    expect(gr.selectNeighbors([N("a", 80, 80, "x")], "x", 0)).toEqual([]);
  });

  it("normalizes relationshipStrength from the 0..100 scale", () => {
    const [r] = gr.selectNeighbors([N("a", 70, 60, "alpha")], "alpha", 1);
    expect(r.relationshipStrength).toBeCloseTo(0.65, 5); // (70+60)/200
  });

  it("applies the relevance floor when text does not overlap the query", () => {
    const [r] = gr.selectNeighbors([N("a", 80, 80, "")], "totally different", 1);
    expect(r.relevance).toBeCloseTo(0.1, 5); // RELEVANCE_FLOOR
  });

  it("ranks by blendedScore, bounded by k, deterministic id tie-break", () => {
    const cands = [N("z", 80, 80, "shared topic"), N("a", 80, 80, "shared topic"), N("b", 10, 10, "shared topic")];
    const out = gr.selectNeighbors(cands, "shared topic", 2);
    expect(out).toHaveLength(2);
    expect(out.map((s) => s.summary.id)).toEqual(["a", "z"]); // equal score -> id asc
    expect(out[0].blendedScore).toBeGreaterThanOrEqual(out[1].blendedScore);
  });
});
