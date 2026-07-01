import { describe, it, expect } from "vitest";
import { project } from "./project";
import { GENESIS_PARENT, SCHEMA_VERSION, type CognitiveTransition } from "./index";

const transition: CognitiveTransition = {
  header: { eventId: "e1", parentHash: GENESIS_PARENT, worldId: "w1", tickId: 3, engineVersion: "t",
    schemaVersion: SCHEMA_VERSION, timestamp: "2026-06-27T00:00:00.000Z" },
  actor: "c1", observation: { query: "save up" }, retrievedMemories: [], retrievedBeliefs: [],
  socialDrivers: [], availableActions: ["work", "rest"], selectedAction: "work", reasoning: "r",
  worldDelta: null, execution: { provider: "p", modelId: "m", modelVersion: "v", promptHash: "",
    worldHash: "", verified: true }, candidates: null, beliefDelta: null,
};
const input = { transition, eventHash: "0xaa", parentHash: GENESIS_PARENT, chainVerified: true,
  anchor: { merkleRoot: "0xbb", zgRootHash: "0xcc", zgTxHash: "0xdd" } };

describe("project explain", () => {
  it("renders authenticated fields + chain/anchor metadata", () => {
    const v = project(input, "explain");
    expect(v.citizen).toBe("c1");
    expect(v.tick).toBe(3);
    expect(v.selectedAction).toBe("work");
    expect(v.chainVerified).toBe(true);
    expect(v.eventHash).toBe("0xaa");
    expect(v.anchor?.zgTxHash).toBe("0xdd");
  });
  it("maps null cognition to 'unavailable' (Invariant #1)", () => {
    const v = project(input, "explain");
    expect(v.candidates).toBe("unavailable");
    expect(v.beliefDelta).toBe("unavailable");
  });
  it("replay projection is not implemented in 1A", () => {
    expect(() => project(input, "replay" as "explain")).toThrow(/Phase 2/);
  });
});
