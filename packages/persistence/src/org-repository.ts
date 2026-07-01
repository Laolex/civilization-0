import type { Pool } from "pg";
import type { Organization, Membership, WorldEvent, DecisionTrace } from "@civ/shared";
import { getPool } from "./pool";

export interface OrgContext { org: Organization; members: Membership[]; }

export class OrgRepository {
  constructor(private readonly pool: Pool = getPool()) {}

  async createOrg(o: Organization): Promise<void> {
    await this.pool.query(
      `INSERT INTO organizations (id,name,kind,founder_id,treasury,reputation,goal,created_day)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
       ON CONFLICT (id) DO UPDATE SET name=$2,kind=$3,founder_id=$4,treasury=$5,
         reputation=$6,goal=$7,created_day=$8`,
      [o.id, o.name, o.kind, o.founderId, o.treasury, o.reputation, o.goal, o.createdDay]);
  }

  async addMembership(m: Membership): Promise<void> {
    await this.pool.query(
      `INSERT INTO memberships (org_id,citizen_id,role,joined_day) VALUES ($1,$2,$3,$4)
       ON CONFLICT (org_id,citizen_id) DO UPDATE SET role=$3,joined_day=$4`,
      [m.orgId, m.citizenId, m.role, m.joinedDay]);
  }

  async getOrg(orgId: string): Promise<Organization | null> {
    const r = await this.pool.query("SELECT * FROM organizations WHERE id = $1", [orgId]);
    const x = r.rows[0];
    if (!x) return null;
    return { id: x.id, name: x.name, kind: x.kind, founderId: x.founder_id,
      treasury: Number(x.treasury), reputation: Number(x.reputation), goal: x.goal, createdDay: x.created_day };
  }

  async listMemberships(orgId: string): Promise<Membership[]> {
    const r = await this.pool.query(
      "SELECT * FROM memberships WHERE org_id = $1 ORDER BY joined_day, citizen_id", [orgId]);
    return r.rows.map((x) => ({ orgId: x.org_id, citizenId: x.citizen_id, role: x.role, joinedDay: x.joined_day }));
  }

  async loadOrgContext(orgId: string): Promise<OrgContext | null> {
    const org = await this.getOrg(orgId);
    if (!org) return null;
    return { org, members: await this.listMemberships(orgId) };
  }

  async createOrgCoupled(o: Organization, worldId: string, tickId: number, decisionId: string | null): Promise<void> {
    const { append } = await import("@civ/history/src/append");
    const { ensureEpoch } = await import("@civ/history/src/genesis");
    const { buildOrganizationDelta } = await import("@civ/history/src/deltas");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await ensureEpoch(client, worldId);
      await client.query(
        `INSERT INTO organizations (id,name,kind,founder_id,treasury,reputation,goal,created_day)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT (id) DO NOTHING`,
        [o.id, o.name, o.kind, o.founderId, o.treasury, o.reputation, o.goal, o.createdDay]);
      await client.query(
        `INSERT INTO memberships (org_id,citizen_id,role,joined_day) VALUES ($1,$2,'founder',$3)
         ON CONFLICT (org_id,citizen_id) DO NOTHING`, [o.id, o.founderId, o.createdDay]);
      await append(client, buildOrganizationDelta({ worldId, tickId, op: "founded", orgId: o.id,
        founderId: o.founderId, citizenId: o.founderId, role: "founder", decisionId }));
      await client.query("COMMIT");
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
  }

  async addMembershipCoupled(m: Membership, worldId: string, tickId: number, decisionId: string | null): Promise<void> {
    const { append } = await import("@civ/history/src/append");
    const { ensureEpoch } = await import("@civ/history/src/genesis");
    const { buildOrganizationDelta } = await import("@civ/history/src/deltas");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await ensureEpoch(client, worldId);
      await client.query(
        `INSERT INTO memberships (org_id,citizen_id,role,joined_day) VALUES ($1,$2,$3,$4)
         ON CONFLICT (org_id,citizen_id) DO UPDATE SET role=$3,joined_day=$4`,
        [m.orgId, m.citizenId, m.role, m.joinedDay]);
      await append(client, buildOrganizationDelta({ worldId, tickId, op: "member_added", orgId: m.orgId,
        citizenId: m.citizenId, role: m.role, decisionId }));
      await client.query("COMMIT");
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
  }

  async persistOrgTick(orgId: string, event: WorldEvent, trace: DecisionTrace, treasuryDelta = 0): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await client.query(
        `INSERT INTO events (id,day,type,actor_id,target_id,decision_id,payload,zg_root_hash,zg_tx_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
        [event.id, event.day, event.type, event.actorId, event.targetId, event.decisionId,
         JSON.stringify(event.payload), event.zgRootHash ?? null, event.zgTxHash ?? null]);
      await client.query(
        `INSERT INTO traces (id,decision_id,trace,zg_root_hash,zg_tx_hash)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
        [trace.id, trace.decisionId, JSON.stringify(trace.trace), trace.zgRootHash ?? null, trace.zgTxHash ?? null]);
      if (treasuryDelta) await client.query(
        "UPDATE organizations SET treasury = treasury + $1 WHERE id = $2", [treasuryDelta, orgId]);
      await client.query("COMMIT");
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
  }
}
