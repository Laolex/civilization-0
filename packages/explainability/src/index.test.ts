import { describe, it, expect } from "vitest";
import { FakeStorage } from "@civ/storage";
import type { Belief, Decision, Goal, Memory, WorldEvent } from "@civ/shared";
import { ExplainabilityService } from "./index";

describe("ExplainabilityService", () => {
  it("builds a trace and archives it, returning hashes", async () => {
    const storage = new FakeStorage();
    const svc = new ExplainabilityService(storage);
    const decision: Decision = { id: "d1", citizenId: "ada", goalId: "g1", day: 5,
      reasoning: "have funding belief", action: "start_company", targetId: null,
      brainProvider: "fake", brainModel: "scripted-v0" };
    const goal: Goal = { id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true };
    const memories: Memory[] = [{ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "Lost job", embedding: [] }];
    const beliefs: Belief[] = [{ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.75, sourceMemoryIds: ["m0"], updatedDay: 3 }];
    const event: WorldEvent = { id: "e1", day: 5, type: "start_company", actorId: "ada", targetId: null, decisionId: "d1", payload: {} };

    const trace = await svc.buildAndArchive({ id: "t1", decision, goal, memories, beliefs, event });

    expect(trace.trace.decision).toBe("start_company");
    expect(trace.trace.retrievedMemories).toEqual(["m1"]);
    expect(trace.trace.beliefs).toEqual(["Marcus is trustworthy"]);
    expect(trace.trace.goal).toBe("financial independence");
    expect(trace.trace.eventId).toBe("e1");
    expect(trace.zgRootHash).toMatch(/^0xfake/);
    expect(storage.calls[0].key).toBe("trace/d1");
  });
});
