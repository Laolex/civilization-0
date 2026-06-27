import { describe, it, expect } from "vitest";
import { edgeKey, replayEdges } from "./replay";
import type { SocialDriverView } from "./types";

const drivers: SocialDriverView[] = [
  { id: "marcus", name: "Marcus", relationshipStrength: 0.68, relevance: 0.46, blendedScore: 0.31, trust: 71, influence: 65, neighborText: "" },
  { id: "lena", name: "Lena", relationshipStrength: 0.68, relevance: 0.10, blendedScore: 0.07, trust: 70, influence: 66, neighborText: "" },
];

describe("replay edges", () => {
  it("edgeKey is order-independent", () => {
    expect(edgeKey("ada", "marcus")).toBe(edgeKey("marcus", "ada"));
  });
  it("maps each driver to a lit edge keyed from the decider", () => {
    const lit = replayEdges("ada", drivers);
    expect(lit.get(edgeKey("ada", "marcus"))).toBeCloseTo(0.31);
    expect(lit.get(edgeKey("ada", "lena"))).toBeCloseTo(0.07);
    expect(lit.size).toBe(2);
  });
  it("clamps intensity to [0,1] and ignores self-edges", () => {
    const lit = replayEdges("ada", [{ ...drivers[0], id: "ada", blendedScore: 2 }]);
    expect(lit.size).toBe(0);
  });
});
