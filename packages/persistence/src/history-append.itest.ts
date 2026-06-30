import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { WorldRepository } from "./repository";
import { resetWorld } from "./testutil";
import { runCitizenTick, type TickDeps } from "@civ/engine";
import { FakeBrain } from "@civ/brain";
import { FakeStorage } from "@civ/storage";
import { FakeEmbedder, MemoryIndex } from "@civ/memory";
import { RuleBasedBeliefReviser } from "@civ/beliefs";
import { ExplainabilityService } from "@civ/explainability";

const repo = new WorldRepository();

// citizens.world_id defaults to 'genesis'; persistTick resolves the world from that column.
const WORLD = "genesis";

async function seed(): Promise<void> {
  await migrate();
  await resetWorld(); // truncates history_events/history_anchors too — see testutil WORLD_TABLES
  await repo.upsertCitizenRow({ id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
  await repo.addMemoryRow({ id: "m1", citizenId: "ada", day: 1, type: "event",
    importance: 8, summary: "Lost job", embedding: new Array(64).fill(0).map((_, i) => (i === 0 ? 1 : 0)) });
}

async function buildTick() {
  const store = await repo.loadContext("ada");
  let n = 0; const idgen = () => `t${n++}`;
  const embedder = new FakeEmbedder();
  const deps: TickDeps = { store, embedder, memoryIndex: new MemoryIndex(store, embedder),
    reviser: new RuleBasedBeliefReviser(), brain: new FakeBrain(() => ({ action: "work", targetId: null,
      reasoning: "keep building", memoryWeights: {}, beliefWeights: {} })),
    storage: new FakeStorage(), explain: new ExplainabilityService(new FakeStorage()),
    clock: { day: 2 }, idgen };
  const result = await runCitizenTick(deps, "ada");
  return { store, result };
}

describe("persistTick writes history in the same transaction (Invariant #2)", () => {
  beforeEach(async () => { await seed(); });
  afterAll(async () => { await closePool(); });

  it("on success: a decision row AND a history_events row both exist", async () => {
    const { store, result } = await buildTick();
    await repo.persistTick(store, result, "ada");

    const d = await getPool().query("SELECT id FROM decisions WHERE citizen_id = 'ada'");
    const h = await getPool().query("SELECT event_id FROM history_events WHERE world_id = $1", [WORLD]);
    expect(d.rows.length).toBeGreaterThan(0);
    expect(h.rows.length).toBe(d.rows.length); // one transition per committed decision
  });

  it("on history append failure: the whole tick rolls back (no orphan decision)", async () => {
    const { store, result } = await buildTick();
    // Pre-insert a row whose event_id collides with the one persistTick will generate
    // (ct-<decisionId>), so append()'s INSERT hits the UNIQUE(event_id) constraint and throws.
    await getPool().query(
      `INSERT INTO history_events (event_id, world_id, tick_id, parent_hash, event_hash, kind, payload)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [`ct-${result.decision.id}`, WORLD, 2, "0x" + "0".repeat(64), "0x" + "1".repeat(64),
       "decision", JSON.stringify({})],
    );
    await expect(repo.persistTick(store, result, "ada")).rejects.toThrow();

    // Invariant #2: the decision must NOT have landed — the whole tick rolled back.
    const d = await getPool().query("SELECT id FROM decisions WHERE id = $1", [result.decision.id]);
    expect(d.rows.length).toBe(0);
  });
});
