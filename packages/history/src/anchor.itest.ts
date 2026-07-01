import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import type { StorageProvider } from "@civ/storage";
import { migrate, getPool, closePool } from "@civ/persistence";
import { append } from "./append";
import { anchorTick } from "./anchor";
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

const fakeStorage: StorageProvider = {
  name: "fake",
  archive: async (_k: string, _d: unknown) => ({ rootHash: "0xROOT", txHash: "0xTX", ts: Date.now() }),
};

describe("anchorTick", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wh'");
    await getPool().query("DELETE FROM history_anchors WHERE world_id = 'wh'");
  });
  afterAll(async () => { await closePool(); });

  it("anchors a tick's transitions to 0G and records the anchor row + event", async () => {
    await append(getPool(), ctFor("wh", 7, "c1", "work"));
    await append(getPool(), ctFor("wh", 7, "c2", "rest"));
    const res = await anchorTick(getPool(), fakeStorage, "wh", 7);
    expect(res?.zgRootHash).toBe("0xROOT");
    expect(res?.zgTxHash).toBe("0xTX");

    const a = await getPool().query("SELECT merkle_root, zg_tx_hash FROM history_anchors WHERE world_id='wh' AND tick_id=7");
    expect(a.rows[0].zg_tx_hash).toBe("0xTX");
    const ev = await getPool().query("SELECT kind FROM history_events WHERE world_id='wh' AND kind='Anchor'");
    expect(ev.rows.length).toBe(1);
  });

  it("returns null when the tick has no transitions", async () => {
    expect(await anchorTick(getPool(), fakeStorage, "wh", 999)).toBeNull();
  });
});
