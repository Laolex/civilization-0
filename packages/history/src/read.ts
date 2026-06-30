import type { Executor } from "./append";

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
