import { describe, it, expect } from "vitest";
import { buildCognitiveTransition } from "./build";
import { GENESIS_PARENT, SCHEMA_VERSION } from "./index";
import type { Decision, WorldEvent } from "@civ/shared";

const decision: Decision = {
  id: "d1", citizenId: "c1", goalId: null, day: 3, reasoning: "save up",
  action: "work", targetId: null, brainProvider: "0g-compute", brainModel: "llama-3.3-70b",
  meta: { provider: "0xprov", model: "llama-3.3-70b", verified: true,
    socialDrivers: [{ id: "c2", name: "Bo", relationshipStrength: 0.6, relevance: 0.5,
      blendedScore: 0.55, trust: 0.7, influence: 0.4, neighborText: "Bo invested" }],
    socialQuery: "save up" },
};
const event: WorldEvent = { id: "e1", day: 3, type: "work", actorId: "c1",
  targetId: null, decisionId: "d1", payload: {} };

function build() {
  return buildCognitiveTransition({
    result: { decision, event, observation: { query: "save up Boomtown", worldHeadline: "Boomtown" },
      availableActions: ["work", "rest", "invest"] },
    worldId: "w1", engineVersion: "engine@test", timestamp: "2026-06-27T00:00:00.000Z",
    parentHash: GENESIS_PARENT, newEventId: () => "evt-1",
    retrievedMemories: [{ id: "m1", weight: 0.9, summary: "got paid" }],
    retrievedBeliefs: [{ id: "b1", weight: 0.8, statement: "work pays" }],
  });
}

describe("buildCognitiveTransition", () => {
  it("populates real cognitive fields", () => {
    const ct = build();
    expect(ct.actor).toBe("c1");
    expect(ct.selectedAction).toBe("work");
    expect(ct.reasoning).toBe("save up");
    expect(ct.observation.query).toBe("save up Boomtown");
    expect(ct.availableActions).toEqual(["work", "rest", "invest"]);
    expect(ct.retrievedMemories[0]).toEqual({ id: "m1", weight: 0.9, summary: "got paid" });
    expect(ct.socialDrivers[0].name).toBe("Bo");
    expect(ct.execution.verified).toBe(true);
    expect(ct.execution.provider).toBe("0xprov");
  });

  it("records the created event in worldDelta, no fabricated wealth/relationship deltas", () => {
    const ct = build();
    expect(ct.worldDelta?.eventsCreated).toEqual([{ id: "e1", type: "work", targetId: null }]);
    expect(ct.worldDelta?.wealthTransferred).toEqual([]);
    expect(ct.worldDelta?.relationshipsChanged).toEqual([]);
  });

  it("NEVER fabricates candidates or beliefDelta (Invariant #1)", () => {
    const ct = build();
    expect(ct.candidates).toBeNull();
    expect(ct.beliefDelta).toBeNull();
  });

  it("stamps schemaVersion + header identity", () => {
    const ct = build();
    expect(ct.header.schemaVersion).toBe(SCHEMA_VERSION);
    expect(ct.header.worldId).toBe("w1");
    expect(ct.header.tickId).toBe(3);
    expect(ct.header.eventId).toBe("evt-1");
    expect(ct.header.parentHash).toBe(GENESIS_PARENT);
  });
});
