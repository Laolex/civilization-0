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

export interface OrgDecisionView {
  eventId: string; day: number; action: string; targetId: string | null;
  reasoning: string; rootHash: string | null;
}
export interface OrgView {
  id: string; name: string; kind: string; founderId: string;
  treasury: number; reputation: number; goal: string; createdDay: number;
  members: { citizenId: string; role: string; joinedDay: number }[];
  decisions: OrgDecisionView[];
}

export async function readOrg(pool: Pool, orgId: string): Promise<OrgView | null> {
  const o = await pool.query("SELECT * FROM organizations WHERE id = $1", [orgId]);
  const x = o.rows[0];
  if (!x) return null;
  const m = await pool.query(
    "SELECT citizen_id, role, joined_day FROM memberships WHERE org_id = $1 ORDER BY joined_day, citizen_id", [orgId]);
  const d = await pool.query(
    `SELECT e.id AS event_id, e.day, e.payload, e.target_id, t.zg_root_hash
     FROM events e LEFT JOIN traces t ON t.decision_id = e.decision_id
     WHERE e.actor_id = $1 ORDER BY e.day DESC, e.id DESC`, [orgId]);
  return {
    id: x.id, name: x.name, kind: x.kind, founderId: x.founder_id,
    treasury: Number(x.treasury), reputation: Number(x.reputation), goal: x.goal, createdDay: x.created_day,
    members: m.rows.map((r) => ({ citizenId: r.citizen_id, role: r.role, joinedDay: r.joined_day })),
    decisions: d.rows.map((r) => ({
      eventId: r.event_id, day: r.day,
      action: (r.payload?.action as string) ?? "",
      targetId: r.target_id ?? null,
      reasoning: (r.payload?.reasoning as string) ?? "",
      rootHash: r.zg_root_hash ?? null,
    })),
  };
}

export async function readOrgList(pool: Pool): Promise<{ id: string; name: string; kind: string; treasury: number; memberCount: number }[]> {
  const r = await pool.query(
    `SELECT o.id, o.name, o.kind, o.treasury, COUNT(m.citizen_id)::int AS member_count
     FROM organizations o LEFT JOIN memberships m ON m.org_id = o.id
     GROUP BY o.id, o.name, o.kind, o.treasury ORDER BY o.name`);
  return r.rows.map((x) => ({ id: x.id, name: x.name, kind: x.kind, treasury: Number(x.treasury), memberCount: x.member_count }));
}
