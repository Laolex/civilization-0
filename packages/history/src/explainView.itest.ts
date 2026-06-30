import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool } from "@civ/persistence";
import { append } from "./append";
import { buildExplainView } from "./explainView";
import { GENESIS_PARENT, SCHEMA_VERSION, type CognitiveTransition } from "./index";

function ctFor(worldId: string, tick: number, actor: string, action: string): CognitiveTransition {
  return {
    header: { eventId: `${actor}-${tick}-${action}-${Math.random()}`, parentHash: GENESIS_PARENT, worldId,
      tickId: tick, engineVersion: "t", schemaVersion: SCHEMA_VERSION, timestamp: new Date().toISOString() },
    actor, observation: { query: "q" }, retrievedMemories: [], retrievedBeliefs: [], socialDrivers: [],
    availableActions: ["work", "rest"], selectedAction: action, reasoning: "r", worldDelta: null,
    execution: { provider: "p", modelId: "m", modelVersion: "v", promptHash: "", worldHash: "", verified: true },
    candidates: null, beliefDelta: null,
  };
}

describe("buildExplainView", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => { await getPool().query("DELETE FROM history_events WHERE world_id = 'we'"); });
  afterAll(async () => { await closePool(); });

  it("reconstructs an authenticated, chain-verified trace; null cognition is 'unavailable'", async () => {
    await append(getPool(), ctFor("we", 5, "c1", "work"));
    const view = await buildExplainView(getPool(), "we", "c1", 5);
    expect(view).not.toBeNull();
    expect(view!.selectedAction).toBe("work");
    expect(view!.chainVerified).toBe(true);
    expect(view!.candidates).toBe("unavailable");
    expect(view!.beliefDelta).toBe("unavailable");
    expect(view!.anchor).toBeNull(); // no anchor yet (Track H)
  });

  it("returns null for a missing (citizen,tick)", async () => {
    expect(await buildExplainView(getPool(), "we", "ghost", 99)).toBeNull();
  });
});
