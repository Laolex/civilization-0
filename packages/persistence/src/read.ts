import type { Pool } from "pg";

/**
 * Read-only world projection for dashboards. Defined here (not in repository.ts)
 * so the web read path can deep-import it WITHOUT pulling the engine/store graph
 * (@civ/engine, @civ/store, @civ/memory) into the Next bundle. Imports only `pg`.
 */
export interface WorldView {
  day: number;
  citizens: { id: string; name: string; tier: number; reputation: number }[];
  recentEvents: { id: string; day: number; type: string; actorId: string; targetId: string | null }[];
}

export async function readWorldView(pool: Pool, limit: number): Promise<WorldView> {
  const ws = await pool.query("SELECT day FROM world_state WHERE id = 1");
  const cs = await pool.query(
    "SELECT id, name, tier, reputation FROM citizens ORDER BY reputation DESC",
  );
  const es = await pool.query(
    "SELECT id, day, type, actor_id, target_id FROM events ORDER BY day DESC, id DESC LIMIT $1",
    [limit],
  );
  return {
    day: ws.rows[0]?.day ?? 0,
    citizens: cs.rows.map((r) => ({
      id: r.id,
      name: r.name,
      tier: r.tier,
      reputation: Number(r.reputation),
    })),
    recentEvents: es.rows.map((r) => ({
      id: r.id,
      day: r.day,
      type: r.type,
      actorId: r.actor_id,
      targetId: r.target_id,
    })),
  };
}
