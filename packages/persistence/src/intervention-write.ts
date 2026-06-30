import { getPool } from "./pool";

export interface Intervention {
  id: string; worldId: string; userId: string; type: string;
  targetCitizenId: string | null; payload: Record<string, unknown>;
  status: string; appliedDay: number | null;
}

type Row = {
  id: string; world_id: string; user_id: string; type: string;
  target_citizen_id: string | null; payload: Record<string, unknown>;
  status: string; applied_day: number | null;
};
const toIv = (r: Row): Intervention => ({
  id: r.id, worldId: r.world_id, userId: r.user_id, type: r.type,
  targetCitizenId: r.target_citizen_id, payload: r.payload ?? {},
  status: r.status, appliedDay: r.applied_day,
});

export async function enqueueIntervention(input: {
  id: string; worldId: string; userId: string; type: string;
  targetCitizenId?: string | null; payload: Record<string, unknown>;
}): Promise<Intervention> {
  const r = await getPool().query(
    `INSERT INTO interventions (id, world_id, user_id, type, target_citizen_id, payload)
     VALUES ($1,$2,$3,$4,$5,$6) RETURNING *`,
    [input.id, input.worldId, input.userId, input.type, input.targetCitizenId ?? null, input.payload]);
  return toIv(r.rows[0]);
}

export async function pendingInterventions(): Promise<Intervention[]> {
  const r = await getPool().query("SELECT * FROM interventions WHERE status = 'pending' ORDER BY created_at");
  return r.rows.map(toIv);
}

export async function listInterventions(worldId: string, limit: number): Promise<Intervention[]> {
  const r = await getPool().query(
    "SELECT * FROM interventions WHERE world_id = $1 ORDER BY created_at DESC LIMIT $2", [worldId, limit]);
  return r.rows.map(toIv);
}

export async function lastTickRequestAtMs(worldId: string): Promise<number | null> {
  const r = await getPool().query(
    `SELECT EXTRACT(EPOCH FROM created_at) * 1000 AS ms FROM interventions
     WHERE world_id = $1 AND type = 'tick_request' ORDER BY created_at DESC LIMIT 1`,
    [worldId]);
  return r.rows[0] ? Number(r.rows[0].ms) : null;
}

export async function markInterventionApplied(id: string, day: number): Promise<void> {
  await getPool().query("UPDATE interventions SET status = 'applied', applied_day = $2 WHERE id = $1", [id, day]);
}

export async function markInterventionFailed(id: string): Promise<void> {
  await getPool().query("UPDATE interventions SET status = 'failed' WHERE id = $1", [id]);
}
