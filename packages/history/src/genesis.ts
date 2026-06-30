import { type Executor, append } from "./append";
import { genesisFactsHash } from "./hash";
import { loadGenesis } from "./read";
import { SCHEMA_VERSION, GENESIS_PARENT, type Genesis, type WorldFacts } from "./types";

/** Read the world's current legacy facts (wealth/relationships/orgs), scoped via citizens.world_id. */
export async function captureGenesisFacts(tx: Executor, worldId: string): Promise<WorldFacts> {
  const w = await tx.query(`SELECT id AS actor, wealth FROM citizens WHERE world_id = $1 ORDER BY id`, [worldId]);
  const r = await tx.query(
    `SELECT r.citizen_id AS a, r.other_id AS b, r.trust, r.friendship, r.influence
       FROM relationships r JOIN citizens c ON c.id = r.citizen_id
      WHERE c.world_id = $1 ORDER BY r.citizen_id, r.other_id`, [worldId]);
  const o = await tx.query(
    `SELECT o.id, o.founder_id, o.treasury,
            COALESCE(json_agg(json_build_object('citizenId', m.citizen_id, 'role', m.role)
                     ORDER BY m.citizen_id) FILTER (WHERE m.citizen_id IS NOT NULL), '[]') AS members
       FROM organizations o
       JOIN citizens fc ON fc.id = o.founder_id AND fc.world_id = $1
       LEFT JOIN memberships m ON m.org_id = o.id
      GROUP BY o.id, o.founder_id, o.treasury ORDER BY o.id`, [worldId]);
  return {
    wealth: w.rows.map((x) => ({ actor: x.actor, wealth: Number(x.wealth) })),
    relationships: r.rows.map((x) => ({ a: x.a, b: x.b, trust: Number(x.trust),
      friendship: Number(x.friendship), influence: Number(x.influence) })),
    organizations: o.rows.map((x) => ({ id: x.id, founderId: x.founder_id, treasury: Number(x.treasury),
      members: (x.members as { citizenId: string; role: string }[]) })),
  };
}

/** Idempotently establish the per-world historical boundary. Capture → hash → append as the chain ROOT.
 *  MUST be called (inside the caller's tx) before any other append for the world (Invariant #5, #3). */
export async function ensureEpoch(
  tx: Executor, worldId: string, opts: { historyVersion?: string } = {},
): Promise<Genesis> {
  const existing = await loadGenesis(tx, worldId);
  if (existing) return existing;
  const facts = await captureGenesisFacts(tx, worldId);
  const now = new Date().toISOString();
  const genesis: Genesis = {
    kind: "Genesis",
    header: { eventId: `genesis-${worldId}`, parentHash: GENESIS_PARENT, worldId, tickId: 0,
      engineVersion: process.env.ENGINE_VERSION ?? "civ0@dev", schemaVersion: SCHEMA_VERSION, timestamp: now },
    epochId: `epoch-${worldId}-${now.slice(0, 10)}`,
    historyVersion: opts.historyVersion ?? "1b-v1",
    worldHash: genesisFactsHash(facts),
    facts,
    capturedAt: now,
  };
  await append(tx, genesis); // links parent=GENESIS_PARENT; UNIQUE(world_id,parent_hash) guarantees single root
  return genesis;
}
