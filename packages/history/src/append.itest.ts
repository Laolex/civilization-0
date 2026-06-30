import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool } from "@civ/persistence";
import { append, loadWorldEvents } from "./append";
import { verifyChain } from "./hash";
import { GENESIS_PARENT, SCHEMA_VERSION, type CognitiveTransition } from "./index";

function ct(worldId: string, tick: number, actor: string): CognitiveTransition {
  return {
    header: { eventId: `${actor}-${tick}-${Math.random()}`, parentHash: GENESIS_PARENT, worldId,
      tickId: tick, engineVersion: "t", schemaVersion: SCHEMA_VERSION, timestamp: new Date().toISOString() },
    actor, observation: { query: "q" }, retrievedMemories: [], retrievedBeliefs: [], socialDrivers: [],
    availableActions: ["work"], selectedAction: "work", reasoning: "r", worldDelta: null,
    execution: { provider: "p", modelId: "m", modelVersion: "v", promptHash: "", worldHash: "", verified: true },
    candidates: null, beliefDelta: null,
  };
}

describe("append", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => { await getPool().query("DELETE FROM history_events WHERE world_id = 'wa'"); });
  afterAll(async () => { await closePool(); });

  it("links the chain across appends and verifies from the DB", async () => {
    const a = await append(getPool(), ct("wa", 1, "c1"));
    const b = await append(getPool(), ct("wa", 2, "c1"));
    expect(a.parentHash).toBe(GENESIS_PARENT);
    expect(b.parentHash).toBe(a.eventHash);

    const rows = await loadWorldEvents(getPool(), "wa");
    expect(rows).toHaveLength(2);
    expect(verifyChain(rows).ok).toBe(true);
  });
});
