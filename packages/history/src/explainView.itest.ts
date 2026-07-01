import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool, WorldRepository } from "@civ/persistence";
import { append } from "./append";
import { buildExplainView } from "./explainView";
import { ensureEpoch } from "./genesis";
import { GENESIS_PARENT, SCHEMA_VERSION, type CognitiveTransition, type ExplainView } from "./index";

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
    const view = (await buildExplainView(getPool(), "we", "c1", 5)) as ExplainView;
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

  describe("pre-epoch refusal (Invariant #5)", () => {
    afterEach(async () => {
      await getPool().query("DELETE FROM history_events WHERE world_id = 'we2'");
      await getPool().query("DELETE FROM citizens WHERE world_id = 'we2'");
    });

    it("refuses to explain a tick before the authenticated epoch", async () => {
      // world 'we2': genesis exists, earliest real (non-Genesis) event lands at tick 5; asking tick 2 → refusal
      await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,world_id)
        VALUES ('c1','C','x',30,'{}'::jsonb,'we2') ON CONFLICT (id) DO UPDATE SET world_id='we2'`);
      await ensureEpoch(getPool(), "we2");
      await new WorldRepository().setDay(5); // world_state.day BEFORE the delta, so it lands at tick_id=5
      await new WorldRepository().adjustWealth("c1", 5, "d1"); // WealthDelta appended at tick_id=5

      const view = await buildExplainView(getPool(), "we2", "c1", 2);
      expect((view as any).refused).toBe("pre-epoch");
      expect((view as any).epochId).toEqual(expect.stringContaining("epoch-we2"));
    });

    it("still explains normally for a tick at/after the epoch start", async () => {
      await getPool().query(`INSERT INTO citizens (id,name,occupation,age,traits,world_id)
        VALUES ('c1','C','x',30,'{}'::jsonb,'we2') ON CONFLICT (id) DO UPDATE SET world_id='we2'`);
      await ensureEpoch(getPool(), "we2");
      await new WorldRepository().setDay(5);
      await new WorldRepository().adjustWealth("c1", 5, "d1");
      await append(getPool(), ctFor("we2", 5, "c1", "work"));

      const view = (await buildExplainView(getPool(), "we2", "c1", 5)) as ExplainView;
      expect(view).not.toBeNull();
      expect((view as any).refused).toBeUndefined();
      expect(view!.selectedAction).toBe("work");
    });
  });
});
