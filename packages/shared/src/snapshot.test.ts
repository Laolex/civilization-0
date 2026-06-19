import { describe, it, expect } from "vitest";
import { stripEmbeddings, type WorldSnapshot } from "./index";

function fixture(): WorldSnapshot {
  return {
    capturedAt: "2026-06-19T00:00:00.000Z",
    citizens: [], goals: [], relationships: [],
    memories: [{ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job", embedding: [1, 2, 3] }],
    beliefs: [], decisions: [], decisionMemories: [], decisionBeliefs: [],
    events: [], traces: [], worldState: { day: 12, economy: {}, headline: "" },
  };
}

describe("stripEmbeddings", () => {
  it("zeroes embeddings but preserves every other field", () => {
    const out = stripEmbeddings(fixture());
    expect(out.memories[0].embedding).toEqual([]);
    expect(out.memories[0].summary).toBe("lost job");
    expect(out.memories[0].importance).toBe(8);
    expect(out.capturedAt).toBe("2026-06-19T00:00:00.000Z");
  });

  it("does not mutate the input", () => {
    const input = fixture();
    stripEmbeddings(input);
    expect(input.memories[0].embedding).toEqual([1, 2, 3]);
  });
});
