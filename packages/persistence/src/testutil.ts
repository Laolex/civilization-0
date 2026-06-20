import type { Pool } from "pg";
import { getPool } from "./pool";

const WORLD_TABLES = [
  "citizens", "goals", "relationships", "memories", "beliefs",
  "decisions", "decision_memories", "decision_beliefs", "events", "traces",
];

/** Test helper: wipe all world rows (FK-safe via CASCADE) and reset the world_state singleton. */
export async function resetWorld(pool: Pool = getPool()): Promise<void> {
  await pool.query(`TRUNCATE ${WORLD_TABLES.join(", ")} RESTART IDENTITY CASCADE`);
  await pool.query("UPDATE world_state SET day = 0, economy = '{}'::jsonb, headline = ''");
}
