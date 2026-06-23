import type { Pool } from "pg";
import type { Citizen, Memory } from "@civ/shared";
import type { TickResult } from "@civ/engine";
import { InMemoryWorldStore } from "@civ/store";
import { getPool } from "./pool";
import { readWorldView, type WorldView } from "./read";

function toVector(v: number[]): string { return `[${v.join(",")}]`; }
function fromVector(s: string | null): number[] {
  return s ? s.replace(/[[\]]/g, "").split(",").filter(Boolean).map(Number) : [];
}

export class WorldRepository {
  constructor(private readonly pool: Pool = getPool()) {}

  async setDay(day: number): Promise<void> {
    await this.pool.query("UPDATE world_state SET day = $1 WHERE id = 1", [day]);
  }

  async adjustWealth(citizenId: string, delta: number): Promise<void> {
    if (!delta) return;
    await this.pool.query("UPDATE citizens SET wealth = GREATEST(0, wealth + $2) WHERE id = $1", [citizenId, delta]);
  }

  async upsertCitizenRow(c: Citizen): Promise<void> {
    await this.pool.query(
      `INSERT INTO citizens (id,name,occupation,age,traits,wealth,reputation,tier,created_day)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
       ON CONFLICT (id) DO UPDATE SET name=$2,occupation=$3,age=$4,traits=$5,
         wealth=$6,reputation=$7,tier=$8,created_day=$9`,
      [c.id, c.name, c.occupation, c.age, JSON.stringify(c.traits), c.wealth, c.reputation, c.tier, c.createdDay],
    );
  }

  async addMemoryRow(m: Memory): Promise<void> {
    await this.pool.query(
      `INSERT INTO memories (id,citizen_id,day,type,importance,summary,embedding,zg_root_hash,zg_tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.citizenId, m.day, m.type, m.importance, m.summary,
       m.embedding.length ? toVector(m.embedding) : null, m.zgRootHash ?? null, m.zgTxHash ?? null],
    );
  }

  async persistTick(store: InMemoryWorldStore, result: TickResult, citizenId: string): Promise<void> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const d = result.decision;
      await client.query(
        `INSERT INTO decisions (id,citizen_id,goal_id,day,reasoning,action,target_id,brain_provider,brain_model,meta)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (id) DO NOTHING`,
        [d.id, d.citizenId, d.goalId, d.day, d.reasoning, d.action, d.targetId, d.brainProvider, d.brainModel,
         d.meta ? JSON.stringify(d.meta) : null]);

      for (const dm of store.getDecisionMemories(d.id))
        await client.query(`INSERT INTO decision_memories VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [dm.decisionId, dm.memoryId, dm.weight]);
      for (const db of store.getDecisionBeliefs(d.id))
        await client.query(`INSERT INTO decision_beliefs VALUES ($1,$2,$3) ON CONFLICT DO NOTHING`,
          [db.decisionId, db.beliefId, db.weight]);

      const e = result.event;
      await client.query(
        `INSERT INTO events (id,day,type,actor_id,target_id,decision_id,payload,zg_root_hash,zg_tx_hash)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
        [e.id, e.day, e.type, e.actorId, e.targetId, e.decisionId, JSON.stringify(e.payload),
         e.zgRootHash ?? null, e.zgTxHash ?? null]);

      const t = result.trace;
      await client.query(
        `INSERT INTO traces (id,decision_id,trace,zg_root_hash,zg_tx_hash)
         VALUES ($1,$2,$3,$4,$5) ON CONFLICT (id) DO NOTHING`,
        [t.id, t.decisionId, JSON.stringify(t.trace), t.zgRootHash ?? null, t.zgTxHash ?? null]);

      if (result.storedMemory) await this.addMemoryRowOn(client, result.storedMemory);

      for (const b of store.getBeliefs(citizenId))
        await client.query(
          `INSERT INTO beliefs (id,citizen_id,statement,confidence,source_memory_ids,updated_day)
           VALUES ($1,$2,$3,$4,$5,$6) ON CONFLICT (id) DO UPDATE SET statement=$3,confidence=$4,
             source_memory_ids=$5,updated_day=$6`,
          [b.id, b.citizenId, b.statement, b.confidence, JSON.stringify(b.sourceMemoryIds), b.updatedDay]);

      for (const rel of store.getRelationships(citizenId))
        await client.query(
          `INSERT INTO relationships VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (citizen_id,other_id) DO UPDATE SET trust=$3,friendship=$4,influence=$5`,
          [rel.citizenId, rel.otherId, rel.trust, rel.friendship, rel.influence]);

      await client.query("COMMIT");
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
  }

  private async addMemoryRowOn(client: import("pg").PoolClient, m: Memory): Promise<void> {
    await client.query(
      `INSERT INTO memories (id,citizen_id,day,type,importance,summary,embedding,zg_root_hash,zg_tx_hash)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.citizenId, m.day, m.type, m.importance, m.summary,
       m.embedding.length ? `[${m.embedding.join(",")}]` : null, m.zgRootHash ?? null, m.zgTxHash ?? null]);
  }

  async loadContext(citizenId: string): Promise<InMemoryWorldStore> {
    const store = new InMemoryWorldStore();
    const ws = await this.pool.query("SELECT day, economy, headline FROM world_state WHERE id = 1");
    if (ws.rows[0]) store.setWorldState({ day: ws.rows[0].day, economy: ws.rows[0].economy, headline: ws.rows[0].headline });

    const c = await this.pool.query("SELECT * FROM citizens WHERE id = $1", [citizenId]);
    if (c.rows[0]) {
      const r = c.rows[0];
      store.upsertCitizen({ id: r.id, name: r.name, occupation: r.occupation, age: r.age,
        traits: r.traits, wealth: Number(r.wealth), reputation: Number(r.reputation),
        tier: r.tier, createdDay: r.created_day });
    }
    const goals = await this.pool.query("SELECT * FROM goals WHERE citizen_id = $1", [citizenId]);
    for (const g of goals.rows) store.upsertGoal({ id: g.id, citizenId: g.citizen_id, kind: g.kind,
      description: g.description, progress: Number(g.progress), active: g.active });

    const mems = await this.pool.query("SELECT * FROM memories WHERE citizen_id = $1", [citizenId]);
    for (const m of mems.rows) store.addMemory({ id: m.id, citizenId: m.citizen_id, day: m.day,
      type: m.type, importance: m.importance, summary: m.summary, embedding: fromVector(m.embedding),
      zgRootHash: m.zg_root_hash ?? undefined, zgTxHash: m.zg_tx_hash ?? undefined, pinned: m.pinned ?? false });

    const beliefs = await this.pool.query("SELECT * FROM beliefs WHERE citizen_id = $1", [citizenId]);
    for (const b of beliefs.rows) store.upsertBelief({ id: b.id, citizenId: b.citizen_id,
      statement: b.statement, confidence: Number(b.confidence), sourceMemoryIds: b.source_memory_ids,
      updatedDay: b.updated_day });

    const rels = await this.pool.query("SELECT * FROM relationships WHERE citizen_id = $1", [citizenId]);
    for (const rel of rels.rows) store.upsertRelationship({ citizenId: rel.citizen_id, otherId: rel.other_id,
      trust: Number(rel.trust), friendship: Number(rel.friendship), influence: Number(rel.influence) });

    return store;
  }

  async addPinnedMemory(m: Memory): Promise<void> {
    await this.pool.query(
      `INSERT INTO memories (id,citizen_id,day,type,importance,summary,embedding,pinned)
       VALUES ($1,$2,$3,$4,$5,$6,$7,true) ON CONFLICT (id) DO NOTHING`,
      [m.id, m.citizenId, m.day, m.type, m.importance, m.summary,
       m.embedding.length ? `[${m.embedding.join(",")}]` : null]);
  }

  async unpinMemory(id: string): Promise<void> {
    await this.pool.query("UPDATE memories SET pinned = false WHERE id = $1", [id]);
  }

  async readWorldView(limit: number): Promise<WorldView> {
    return readWorldView(this.pool, limit);
  }
}
