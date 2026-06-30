import { loadWorldEvents, type Executor } from "./append";
import { eventKind, type CognitiveTransition, type Genesis, type Hash } from "./types";

/** The world's Genesis event (chain root), or null if the epoch is not yet established. */
export async function loadGenesis(tx: Executor, worldId: string): Promise<Genesis | null> {
  const rows = await loadWorldEvents(tx, worldId);
  const g = rows.map((r) => r.event).find((e) => eventKind(e) === "Genesis");
  return (g as Genesis) ?? null;
}

/** Latest authenticated transition for a (world, citizen, tick), or null if none was recorded. */
export async function loadTransition(
  tx: Executor,
  worldId: string,
  citizenId: string,
  tickId: number,
): Promise<{ transition: CognitiveTransition; eventHash: Hash; parentHash: Hash } | null> {
  const rows = await loadWorldEvents(tx, worldId);
  for (let i = rows.length - 1; i >= 0; i--) { // latest wins
    const r = rows[i]!;
    if (eventKind(r.event) !== "CognitiveTransition") continue;
    const ct = r.event as CognitiveTransition;
    if (ct.actor === citizenId && ct.header.tickId === tickId)
      return { transition: ct, eventHash: r.eventHash, parentHash: r.parentHash };
  }
  return null;
}

/** The most recent 0G anchor for a tick, or null if it was never anchored (Track H). */
export async function loadAnchor(
  tx: Executor,
  worldId: string,
  tickId: number,
): Promise<{ merkleRoot: Hash; zgRootHash: string | null; zgTxHash: string | null } | null> {
  const r = await tx.query(
    `SELECT merkle_root, zg_root_hash, zg_tx_hash FROM history_anchors
      WHERE world_id = $1 AND tick_id = $2 ORDER BY created_at DESC LIMIT 1`,
    [worldId, tickId],
  );
  if (!r.rows[0]) return null;
  return { merkleRoot: r.rows[0].merkle_root, zgRootHash: r.rows[0].zg_root_hash, zgTxHash: r.rows[0].zg_tx_hash };
}

/** Legacy reality for a world: the recorded action per (tick, actor) from the decisions table.
 *  Used by the Faithfulness Proof to assert the shadow history folds back to what actually ran. */
export async function loadLegacyActions(
  tx: Executor,
  worldId: string,
): Promise<{ tick: number; actor: string; action: string }[]> {
  const r = await tx.query(
    `SELECT d.day AS tick, d.citizen_id AS actor, d.action AS action
       FROM decisions d JOIN citizens c ON c.id = d.citizen_id
      WHERE COALESCE(c.world_id, 'default') = $1`,
    [worldId],
  );
  return r.rows.map((x) => ({ tick: x.tick, actor: x.actor, action: x.action }));
}
