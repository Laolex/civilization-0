import type { Pool } from "pg";

/**
 * Read-only world projection for dashboards. Defined here (not in repository.ts)
 * so the web read path can deep-import it WITHOUT pulling the engine/store graph
 * (@civ/engine, @civ/store, @civ/memory) into the Next bundle. Imports only `pg`.
 */
export interface WorldView {
  day: number;
  citizens: { id: string; name: string; tier: number; reputation: number }[];
  recentEvents: { id: string; day: number; type: string; actorId: string; targetId: string | null; rootHash: string | null }[];
}

export async function readWorldView(pool: Pool, limit: number): Promise<WorldView> {
  const ws = await pool.query("SELECT day FROM world_state WHERE id = 1");
  const cs = await pool.query(
    "SELECT id, name, tier, reputation FROM citizens ORDER BY reputation DESC",
  );
  const es = await pool.query(
    `SELECT e.id, e.day, e.type, e.actor_id, e.target_id,
       COALESCE(e.zg_root_hash, t.zg_root_hash) AS root_hash
     FROM events e LEFT JOIN traces t ON t.decision_id = e.decision_id
     ORDER BY e.day DESC, e.id DESC LIMIT $1`,
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
      rootHash: r.root_hash ?? null,
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

export interface HistoricalEvent {
  id: string; day: number; type: string; actorId: string; targetId: string | null;
  reasoning: string | null; rootHash: string | null;
}
export interface SearchFilters { actorId?: string; type?: string; limit?: number; }

export async function searchEvents(pool: Pool, filters: SearchFilters): Promise<HistoricalEvent[]> {
  const where: string[] = [];
  const params: unknown[] = [];
  if (filters.actorId) { params.push(filters.actorId); where.push(`(e.actor_id = $${params.length} OR e.target_id = $${params.length})`); }
  if (filters.type) { params.push(filters.type); where.push(`e.type = $${params.length}`); }
  params.push(filters.limit ?? 50);
  const limitIdx = params.length;
  const sql = `SELECT e.id, e.day, e.type, e.actor_id, e.target_id, e.zg_root_hash AS event_root,
      e.payload, t.zg_root_hash AS trace_root, t.trace
    FROM events e LEFT JOIN traces t ON t.decision_id = e.decision_id
    ${where.length ? "WHERE " + where.join(" AND ") : ""}
    ORDER BY e.day DESC, e.id DESC LIMIT $${limitIdx}`;
  const r = await pool.query(sql, params);
  return r.rows.map((x) => ({
    id: x.id, day: x.day, type: x.type, actorId: x.actor_id, targetId: x.target_id ?? null,
    reasoning: (x.payload?.reasoning as string) ?? (x.trace?.reasoning as string) ?? null,
    rootHash: x.event_root ?? x.trace_root ?? null,
  }));
}

export async function listEventTypes(pool: Pool): Promise<string[]> {
  const r = await pool.query("SELECT DISTINCT type FROM events ORDER BY type");
  return r.rows.map((x) => x.type as string);
}

export interface NarrativeView { id: string; subjectId: string; kind: string; day: number; text: string; rootHash: string | null; }

export async function readNarrative(pool: Pool, subjectId: string, kind: string): Promise<NarrativeView | null> {
  const r = await pool.query(
    `SELECT id, subject_id, kind, day, text, zg_root_hash FROM narratives
     WHERE subject_id = $1 AND kind = $2 ORDER BY day DESC, id DESC LIMIT 1`, [subjectId, kind]);
  const x = r.rows[0];
  if (!x) return null;
  return { id: x.id, subjectId: x.subject_id, kind: x.kind, day: x.day, text: x.text, rootHash: x.zg_root_hash ?? null };
}

export interface CitizenProfileView {
  id: string; name: string; occupation: string; age: number;
  traits: Record<string, number>; wealth: number; reputation: number; tier: number; createdDay: number;
}
export interface RelationshipView { otherId: string; trust: number; friendship: number; influence: number; }
export interface GoalView { id: string; kind: string; description: string; progress: number; active: boolean; }

export async function readCitizen(pool: Pool, id: string): Promise<CitizenProfileView | null> {
  const r = await pool.query("SELECT * FROM citizens WHERE id = $1", [id]);
  const x = r.rows[0];
  if (!x) return null;
  return { id: x.id, name: x.name, occupation: x.occupation, age: x.age,
    traits: (x.traits ?? {}) as Record<string, number>,
    wealth: Number(x.wealth), reputation: Number(x.reputation), tier: x.tier, createdDay: x.created_day };
}

export async function readRelationships(pool: Pool, id: string): Promise<RelationshipView[]> {
  const r = await pool.query(
    "SELECT other_id, trust, friendship, influence FROM relationships WHERE citizen_id = $1 ORDER BY other_id", [id]);
  return r.rows.map((x) => ({ otherId: x.other_id, trust: Number(x.trust), friendship: Number(x.friendship), influence: Number(x.influence) }));
}

export async function readGoals(pool: Pool, id: string): Promise<GoalView[]> {
  const r = await pool.query(
    "SELECT id, kind, description, progress, active FROM goals WHERE citizen_id = $1 ORDER BY id", [id]);
  return r.rows.map((x) => ({ id: x.id, kind: x.kind, description: x.description, progress: Number(x.progress), active: x.active }));
}

export interface RawChainMemory { id: string; summary: string; day: number; weight: number; }
export interface RawChainBelief { id: string; statement: string; confidence: number; weight: number; }
export interface RawDecisionChain {
  decisionId: string; action: string; targetId: string | null; reasoning: string;
  provider: string; model: string; verified: boolean;
  memories: RawChainMemory[]; beliefs: RawChainBelief[];
  event: { id: string; day: number; type: string; targetId: string | null } | null;
  rootHash: string | null; txHash: string | null;
}

export async function readDecisionChainRaw(pool: Pool, citizenId: string): Promise<RawDecisionChain | null> {
  const d = await pool.query(
    "SELECT * FROM decisions WHERE citizen_id = $1 ORDER BY day DESC, id DESC LIMIT 1", [citizenId]);
  const dec = d.rows[0];
  if (!dec) return null;
  const mems = await pool.query(
    `SELECT m.id, m.summary, m.day, dm.weight FROM decision_memories dm
     JOIN memories m ON m.id = dm.memory_id WHERE dm.decision_id = $1 ORDER BY dm.weight DESC`, [dec.id]);
  const bels = await pool.query(
    `SELECT b.id, b.statement, b.confidence, db.weight FROM decision_beliefs db
     JOIN beliefs b ON b.id = db.belief_id WHERE db.decision_id = $1 ORDER BY db.weight DESC`, [dec.id]);
  const ev = await pool.query(
    "SELECT id, day, type, target_id FROM events WHERE decision_id = $1 ORDER BY id LIMIT 1", [dec.id]);
  const tr = await pool.query(
    "SELECT zg_root_hash, zg_tx_hash FROM traces WHERE decision_id = $1 ORDER BY id LIMIT 1", [dec.id]);
  const meta = (dec.meta ?? {}) as Record<string, unknown>;
  const e = ev.rows[0];
  return {
    decisionId: dec.id, action: dec.action, targetId: dec.target_id ?? null, reasoning: dec.reasoning,
    provider: (meta.provider as string) ?? dec.brain_provider, model: (meta.model as string) ?? dec.brain_model,
    verified: meta.verified === true,
    memories: mems.rows.map((r) => ({ id: r.id, summary: r.summary, day: r.day, weight: Number(r.weight) })),
    beliefs: bels.rows.map((r) => ({ id: r.id, statement: r.statement, confidence: Number(r.confidence), weight: Number(r.weight) })),
    event: e ? { id: e.id, day: e.day, type: e.type, targetId: e.target_id ?? null } : null,
    rootHash: tr.rows[0]?.zg_root_hash ?? null, txHash: tr.rows[0]?.zg_tx_hash ?? null,
  };
}
