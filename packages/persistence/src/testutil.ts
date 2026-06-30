import type { Pool } from "pg";
import { getPool } from "./pool";

const WORLD_TABLES = [
  "narratives", "memberships", "organizations",
  "citizens", "goals", "relationships", "memories", "beliefs",
  "decisions", "decision_memories", "decision_beliefs", "events", "traces",
  // @civ/history shadow log is world state now — reset it too, else the deterministic
  // event_id (ct-<decisionId>) collides across test runs once persistTick shadow-appends.
  "history_events", "history_anchors",
];

/** Test helper: wipe all world rows (FK-safe via CASCADE) and reset the world_state singleton. */
export async function resetWorld(pool: Pool = getPool()): Promise<void> {
  await pool.query(`TRUNCATE ${WORLD_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  await pool.query("UPDATE world_state SET day = 0, economy = '{}'::jsonb, headline = ''");
}
