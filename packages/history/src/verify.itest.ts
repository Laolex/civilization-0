import { describe, it, expect, beforeAll, afterEach, afterAll } from "vitest";
import { migrate, getPool, closePool } from "@civ/persistence";
import { append } from "./append";
import { verifyWorldChain, faithfulnessProof } from "./verify";
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

// Seed a legacy decision (citizen in world 'wv') so faithfulnessProof has a real row to compare.
async function seedLegacy(actor: string, tick: number, action: string): Promise<void> {
  await getPool().query(
    `INSERT INTO citizens (id,name,occupation,age,traits) VALUES ($1,'C','x',30,'{}'::jsonb)
     ON CONFLICT (id) DO NOTHING`, [actor]);
  await getPool().query(`UPDATE citizens SET world_id = 'wv' WHERE id = $1`, [actor]);
  await getPool().query(
    `INSERT INTO decisions (id,citizen_id,day,reasoning,action,brain_provider,brain_model)
     VALUES ($1,$2,$3,'r',$4,'p','m') ON CONFLICT (id) DO NOTHING`,
    [`d-${actor}-${tick}`, actor, tick, action]);
}

describe("verification proofs", () => {
  beforeAll(async () => { await migrate(); });
  afterEach(async () => {
    await getPool().query("DELETE FROM history_events WHERE world_id = 'wv'");
    await getPool().query("DELETE FROM decisions WHERE citizen_id IN (SELECT id FROM citizens WHERE world_id = 'wv')");
  });
  afterAll(async () => { await closePool(); });

  it("verifyWorldChain passes for an untampered DB chain", async () => {
    await append(getPool(), ctFor("wv", 1, "c1", "work"));
    await append(getPool(), ctFor("wv", 2, "c1", "rest"));
    expect((await verifyWorldChain(getPool(), "wv")).ok).toBe(true);
  });

  it("verifyWorldChain fails after a tamper", async () => {
    const { eventId } = await append(getPool(), ctFor("wv", 1, "c1", "work"));
    await getPool().query(
      `UPDATE history_events SET payload = jsonb_set(payload, '{reasoning}', '"TAMPERED"') WHERE event_id = $1`,
      [eventId]);
    expect((await verifyWorldChain(getPool(), "wv")).ok).toBe(false);
  });

  it("faithfulnessProof returns ok when shadow matches legacy decisions", async () => {
    await seedLegacy("c1", 1, "work");
    await append(getPool(), ctFor("wv", 1, "c1", "work"));
    const r = await faithfulnessProof(getPool(), "wv");
    expect(r.ok).toBe(true);
    expect(r.divergences).toEqual([]);
  });

  it("faithfulnessProof reports a divergence when shadow disagrees with legacy", async () => {
    await seedLegacy("c1", 1, "work");
    await append(getPool(), ctFor("wv", 1, "c1", "rest")); // shadow says 'rest', legacy says 'work'
    const r = await faithfulnessProof(getPool(), "wv");
    expect(r.ok).toBe(false);
    expect(r.divergences).toEqual([{ key: expect.any(String), folded: "rest", legacy: "work" }]);
  });
});
