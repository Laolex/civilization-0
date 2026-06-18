import { describe, it, expect } from "vitest";
import type { Belief, Memory } from "@civ/shared";
import { RuleBasedBeliefReviser } from "./index";

const mem = (id: string): Memory => ({ id, citizenId: "ada", day: 2, type: "relationship", importance: 7, summary: "Marcus offered funding", embedding: [] });

describe("RuleBasedBeliefReviser", () => {
  it("creates a trust belief from a positive relationship memory", () => {
    const r = new RuleBasedBeliefReviser();
    let n = 0;
    const out = r.revise({ citizenId: "ada", newMemory: mem("m1"), existing: [], targetName: "Marcus", polarity: 1, day: 2, idgen: () => `b${++n}` });
    expect(out.created).toHaveLength(1);
    expect(out.created[0].statement).toBe("Marcus is trustworthy");
    expect(out.created[0].confidence).toBeGreaterThan(0.5);
    expect(out.created[0].sourceMemoryIds).toEqual(["m1"]);
  });

  it("strengthens an existing belief and appends the source memory", () => {
    const r = new RuleBasedBeliefReviser();
    const existing: Belief = { id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.6, sourceMemoryIds: ["m0"], updatedDay: 1 };
    const out = r.revise({ citizenId: "ada", newMemory: mem("m2"), existing: [existing], targetName: "Marcus", polarity: 1, day: 3, idgen: () => "bx" });
    expect(out.created).toHaveLength(0);
    expect(out.updated).toHaveLength(1);
    expect(out.updated[0].confidence).toBeGreaterThan(0.6);
    expect(out.updated[0].sourceMemoryIds).toContain("m2");
    expect(out.updated[0].updatedDay).toBe(3);
  });

  it("no-ops when there is no target entity", () => {
    const r = new RuleBasedBeliefReviser();
    const out = r.revise({ citizenId: "ada", newMemory: mem("m9"), existing: [], targetName: null, polarity: 1, day: 2, idgen: () => "b" });
    expect(out.created).toHaveLength(0);
    expect(out.updated).toHaveLength(0);
  });

  it("creates a distrust belief from a negative-polarity memory", () => {
    const r = new RuleBasedBeliefReviser();
    const out = r.revise({ citizenId: "ada", newMemory: mem("m3"), existing: [], targetName: "Marcus", polarity: -1, day: 4, idgen: () => "bn" });
    expect(out.created).toHaveLength(1);
    expect(out.created[0].statement).toBe("Marcus is untrustworthy");
    expect(out.created[0].confidence).toBeLessThan(0.5);
    expect(out.created[0].confidence).toBeGreaterThanOrEqual(0);
  });

  it("does not duplicate a source memory id already present on the belief", () => {
    const r = new RuleBasedBeliefReviser();
    const existing: Belief = { id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.6, sourceMemoryIds: ["m2"], updatedDay: 1 };
    const out = r.revise({ citizenId: "ada", newMemory: mem("m2"), existing: [existing], targetName: "Marcus", polarity: 1, day: 5, idgen: () => "bx" });
    expect(out.updated).toHaveLength(1);
    expect(out.updated[0].sourceMemoryIds).toEqual(["m2"]);
  });
});
