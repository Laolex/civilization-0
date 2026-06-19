import { describe, it, expect } from "vitest";
import type { WorldSnapshot } from "@civ/shared";
import { getTimeline, getCausalChain, buildStorySummary, decisionConfidence } from "./world";

function snap(): WorldSnapshot {
  return {
    capturedAt: "2026-06-19T00:00:00.000Z",
    citizens: [
      { id: "ada", name: "Ada", occupation: "Engineer", age: 29, traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 }, wealth: 0, reputation: 50, tier: 3, createdDay: 0 },
      { id: "marcus", name: "Marcus", occupation: "Investor", age: 41, traits: { ambition: 70, empathy: 60, loyalty: 65, curiosity: 50, discipline: 70, riskTolerance: 60 }, wealth: 100000, reputation: 70, tier: 2, createdDay: 0 },
    ],
    goals: [{ id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true }],
    relationships: [{ citizenId: "ada", otherId: "marcus", trust: 0.7, friendship: 0.5, influence: 0.4 }],
    memories: [{ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "Marcus helped me when I lost my job", embedding: [] }],
    beliefs: [{ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.8, sourceMemoryIds: ["m1"], updatedDay: 7 }],
    decisions: [{ id: "d1", citizenId: "ada", goalId: "g1", day: 12, reasoning: "I trust Marcus.", action: "invest", targetId: "marcus", brainProvider: "0g-compute", brainModel: "qwen/qwen2.5-omni-7b", meta: { provider: "0xProvider", model: "qwen/qwen2.5-omni-7b", verified: true } }],
    decisionMemories: [{ decisionId: "d1", memoryId: "m1", weight: 0.6 }],
    decisionBeliefs: [{ decisionId: "d1", beliefId: "b1", weight: 0.8 }],
    events: [
      { id: "evt-lostjob", day: 1, type: "quit_job", actorId: "ada", targetId: null, decisionId: null, payload: { label: "Lost her job" } },
      { id: "e-invest", day: 12, type: "invest", actorId: "ada", targetId: "marcus", decisionId: "d1", payload: {} },
    ],
    traces: [{ id: "t1", decisionId: "d1", trace: { decision: "invest", goal: "financial independence", retrievedMemories: ["m1"], beliefs: ["Marcus is trustworthy"], reasoning: "I trust Marcus.", eventId: "e-invest", meta: { provider: "0xProvider", model: "qwen/qwen2.5-omni-7b", verified: true } }, zgRootHash: "0xroot", zgTxHash: "0xtx" }],
    worldState: { day: 12, economy: {}, headline: "" },
  };
}

describe("getTimeline", () => {
  it("returns events sorted by day with decision linkage", () => {
    const t = getTimeline(snap(), "ada");
    expect(t.map((e) => e.day)).toEqual([1, 12]);
    expect(t[0].decisionId).toBeNull();
    expect(t[1].decisionId).toBe("d1");
    expect(t[0].label).toBe("Lost her job");
  });
});

describe("getCausalChain", () => {
  it("assembles nodes in the order memory→belief→compute→decision→event→storage", () => {
    const c = getCausalChain(snap(), "d1");
    expect(c.nodes.map((n) => n.kind)).toEqual(["memory", "belief", "compute", "decision", "event", "storage"]);
    expect(c.nodes[0].weight).toBe(0.6);
    expect(c.nodes[1].weight).toBe(0.8);
    expect(c.nodes[2].detail.verified).toBe("true");
    expect(c.rootHash).toBe("0xroot");
    expect(c.txHash).toBe("0xtx");
  });

  it("handles targetId fallback when case-mismatch fails citizen lookup", () => {
    const fixture = snap();
    const copy = { ...fixture, decisions: fixture.decisions.map((d) => ({ ...d, targetId: "Marcus" })) };
    const c = getCausalChain(copy, "d1");
    expect(c.nodes.map((n) => n.kind)).toEqual(["memory", "belief", "compute", "decision", "event", "storage"]);
    expect(c.nodes[3].detail.target).toBe("Marcus");
    expect(c.nodes[4].kind).toBe("event");
    const summary = buildStorySummary(copy, "ada");
    expect(summary).toContain("Marcus");
    expect(summary).not.toContain("undefined");
  });
});

describe("buildStorySummary", () => {
  it("produces prose mentioning the memory, belief, compute, and archive", () => {
    const s = buildStorySummary(snap(), "ada");
    expect(s).toContain("Marcus");
    expect(s).toContain("trustworthy");
    expect(s).toMatch(/0G Compute/);
    expect(s).toMatch(/0G Storage/);
  });
});

describe("decisionConfidence", () => {
  it("derives a 0-100 score from join weights", () => {
    const c = getCausalChain(snap(), "d1");
    expect(decisionConfidence(c)).toBe(70); // mean(0.6,0.8)=0.7 -> 70
  });
});
