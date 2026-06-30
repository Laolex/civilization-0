import type { Pool } from "pg";
import type { ActionType, Citizen, Memory, NeighborSummary, OrgContext } from "@civ/shared";
import type { TickResult } from "@civ/engine";
import { InMemoryWorldStore } from "@civ/store";
import { getPool } from "./pool";
import { readWorldView, type WorldView } from "./read";
// Deep src imports: @civ/history's barrel only re-exports ./types, so build/append come from src.
import { buildCognitiveTransition } from "@civ/history/src/build";
import { append } from "@civ/history/src/append";
import { GENESIS_PARENT } from "@civ/history/src/types";

const envNum = (v: string | undefined, d: number) => { const n = Number(v ?? d); return Number.isFinite(n) ? n : d; };
const NEIGHBOR_CANDIDATE_LIMIT = envNum(process.env.NEIGHBOR_CANDIDATE_LIMIT, 5);
const NEIGHBOR_TEXT_MAX = envNum(process.env.NEIGHBOR_TEXT_MAX, 200);
const clip = (s: string | null | undefined, n = NEIGHBOR_TEXT_MAX): string | undefined =>
  s == null ? undefined : (s.length > n ? s.slice(0, n) : s);

function toVector(v: number[]): string { return `[${v.join(",")}]`; }
function fromVector(s: string | null): number[] {
  return s ? s.replace(/[[\]]/g, "").split(",").filter(Boolean).map(Number) : [];
}

export class WorldRepository {
  constructor(private readonly pool: Pool = getPool()) {}

  async setDay(day: number): Promise<void> {
    await this.pool.query("UPDATE world_state SET day = $1 WHERE id = 1", [day]);
  }

  async setWorldHeadline(worldId: string, headline: string): Promise<void> {
    await this.pool.query("UPDATE worlds SET headline = $2 WHERE id = $1", [worldId, headline]);
  }

  async setForcedActions(citizenId: string, actions: ActionType[]): Promise<void> {
    await this.pool.query("UPDATE citizens SET forced_actions = $2 WHERE id = $1",
      [citizenId, JSON.stringify(actions)]);
  }

  async clearForcedActions(citizenId: string): Promise<void> {
    await this.pool.query("UPDATE citizens SET forced_actions = NULL WHERE id = $1", [citizenId]);
  }

  /** Apply an economic delta AND append a WealthDelta recording the ACTUAL (post-clamp) delta, atomically. */
  async adjustWealth(citizenId: string, requestedDelta: number, decisionId: string | null = null): Promise<void> {
    if (!requestedDelta) return;
    const { append } = await import("@civ/history/src/append");
    const { ensureEpoch } = await import("@civ/history/src/genesis");
    const { buildWealthDelta } = await import("@civ/history/src/deltas");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const wr = await client.query("SELECT world_id, wealth FROM citizens WHERE id = $1 FOR UPDATE", [citizenId]);
      if (!wr.rows[0]?.world_id) { await client.query("ROLLBACK"); return; }
      const worldId: string = wr.rows[0].world_id;
      const before = Number(wr.rows[0].wealth);
      const after = Math.max(0, before + requestedDelta);
      const actual = after - before;
      await ensureEpoch(client, worldId);
      await client.query("UPDATE citizens SET wealth = $2 WHERE id = $1", [citizenId, after]);
      if (actual !== 0) {
        const dayR = await client.query("SELECT day FROM world_state WHERE id = 1");
        const tickId = Number(dayR.rows[0]?.day ?? 0);
        await append(client, buildWealthDelta({ worldId, tickId, actor: citizenId, delta: actual, decisionId }));
      }
      await client.query("COMMIT");
    } catch (err) { await client.query("ROLLBACK"); throw err; }
    finally { client.release(); }
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

      // Resolve the world and establish its historical boundary FIRST (Invariant #5). ensureEpoch is
      // idempotent and appends Genesis as the chain root the first time this world is touched, so every
      // later append this tick (relationship deltas, the CognitiveTransition) links to Genesis, not root.
      const wr = await client.query(`SELECT world_id FROM citizens WHERE id = $1`, [citizenId]);
      if (!wr.rows[0]?.world_id) throw new Error(`persistTick: no world_id for citizen ${citizenId}`);
      const worldId: string = wr.rows[0].world_id;
      const { ensureEpoch } = await import("@civ/history/src/genesis");
      await ensureEpoch(client, worldId);

      for (const rel of store.getRelationships(citizenId))
        await client.query(
          `INSERT INTO relationships VALUES ($1,$2,$3,$4,$5)
           ON CONFLICT (citizen_id,other_id) DO UPDATE SET trust=$3,friendship=$4,influence=$5`,
          [rel.citizenId, rel.otherId, rel.trust, rel.friendship, rel.influence]);

      // ── @civ/history shadow append (Invariant #2: same transaction as the decision) ──
      // append() throws on failure, so the existing catch{ROLLBACK} undoes BOTH the decision
      // and the transition — no orphan in either direction.
      const retrievedMemories = store.getDecisionMemories(d.id).map((dm) => ({ id: dm.memoryId, weight: dm.weight }));
      const retrievedBeliefs = store.getDecisionBeliefs(d.id).map((db) => ({ id: db.beliefId, weight: db.weight }));
      const transition = buildCognitiveTransition({
        result: { decision: d, event: e, observation: result.observation, availableActions: result.availableActions },
        worldId,
        engineVersion: process.env.ENGINE_VERSION ?? "civ0@dev",
        timestamp: new Date().toISOString(),
        parentHash: GENESIS_PARENT, // append() overwrites with the live tip
        newEventId: () => `ct-${d.id}`,
        retrievedMemories,
        retrievedBeliefs,
      });
      (transition as { kind?: string }).kind = "CognitiveTransition";
      await append(client, transition);

      await client.query("COMMIT");
      // Faithfulness Proof — WARN-ONLY in 1A (logs divergence, never fails the tick).
      // Runs post-commit on this.pool (NOT the about-to-be-released client) with its own
      // try/catch so it can never trigger the outer ROLLBACK of an already-committed tick.
      try {
        const { faithfulnessProof } = await import("@civ/history/src/verify");
        const proof = await faithfulnessProof(this.pool, worldId);
        if (!proof.ok) console.warn(`[history] faithfulness divergence world=${worldId}`, proof.divergences);
      } catch (err) { console.warn("[history] faithfulness proof skipped:", err); }
      // Best-effort 0G anchor — OFF by default (gated by HISTORY_ANCHOR=1) so the live 2h
      // scheduler does not spend OG until explicitly enabled. Post-commit, never blocks the tick.
      if (process.env.HISTORY_ANCHOR === "1") {
        try {
          const { anchorTick } = await import("@civ/history/src/anchor");
          const { createZeroGStorage, loadZeroGConfig } = await import("@civ/zerog");
          await anchorTick(this.pool, createZeroGStorage(loadZeroGConfig(process.env)), worldId, d.day);
        } catch (err) { console.warn("[history] anchor skipped:", err); }
      }
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
      if (Array.isArray(r.forced_actions) && r.forced_actions.length > 0) {
        store.setForcedActions(r.id, r.forced_actions as ActionType[]);
      }
    }
    const worldId = c.rows[0]?.world_id;
    if (worldId) {
      const wr = await this.pool.query("SELECT headline FROM worlds WHERE id = $1", [worldId]);
      const wh = wr.rows[0]?.headline;
      if (typeof wh === "string" && wh.length > 0) {
        store.setWorldState({ ...store.getWorldState(), headline: wh });
      }
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

    try {
      const wid = worldId ?? "genesis";
      const nb = await this.pool.query(
        `SELECT r.other_id AS id, c.name, c.wealth, c.reputation,
                r.trust, r.friendship, r.influence,
                d.action AS latest_action, d.reasoning AS latest_reasoning,
                g.description AS top_goal, b.statement AS strongest_belief
           FROM relationships r
           JOIN citizens c ON c.id = r.other_id AND c.world_id = $2
           LEFT JOIN LATERAL (SELECT action, reasoning FROM decisions
              WHERE citizen_id = r.other_id ORDER BY day DESC LIMIT 1) d ON true
           LEFT JOIN LATERAL (SELECT description FROM goals
              WHERE citizen_id = r.other_id AND active ORDER BY progress DESC LIMIT 1) g ON true
           LEFT JOIN LATERAL (SELECT statement FROM beliefs
              WHERE citizen_id = r.other_id ORDER BY confidence DESC LIMIT 1) b ON true
          WHERE r.citizen_id = $1
          ORDER BY (r.trust + r.influence) DESC, r.other_id
          LIMIT $3`,
        [citizenId, wid, NEIGHBOR_CANDIDATE_LIMIT]);
      const candidates: NeighborSummary[] = nb.rows.map((x) => ({
        id: x.id, name: x.name,
        relationship: { trust: Number(x.trust), friendship: Number(x.friendship), influence: Number(x.influence) },
        latestAction: x.latest_action ? (x.latest_action as ActionType) : undefined,
        latestReasoning: clip(x.latest_reasoning),
        topGoal: clip(x.top_goal), strongestBelief: clip(x.strongest_belief),
        wealth: Number(x.wealth), reputation: Number(x.reputation),
      }));
      store.setNeighborCandidates(citizenId, candidates);

      const og = await this.pool.query(
        `SELECT o.id, o.name, o.kind, e.type AS latest_action, (e.payload->>'reasoning') AS latest_reasoning
           FROM memberships m
           JOIN organizations o ON o.id = m.org_id
           LEFT JOIN LATERAL (SELECT type, payload FROM events
              WHERE actor_id = o.id ORDER BY day DESC LIMIT 1) e ON true
          WHERE m.citizen_id = $1
          ORDER BY m.joined_day LIMIT 1`,
        [citizenId]);
      if (og.rows[0]) {
        const o = og.rows[0];
        const org: OrgContext = { id: o.id, name: o.name, kind: o.kind,
          latestAction: o.latest_action ? (o.latest_action as ActionType) : undefined,
          latestReasoning: clip(o.latest_reasoning) };
        store.setOrgContext(citizenId, org);
      }
    } catch (err) {
      console.warn(`[loadContext] neighbor/org hydration failed for ${citizenId}, continuing memory-only:`, err);
    }

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

  async getCitizenWorldId(id: string): Promise<string | null> {
    const r = await this.pool.query("SELECT world_id FROM citizens WHERE id = $1", [id]);
    return r.rows[0]?.world_id ?? null;
  }

  async readWorldView(limit: number): Promise<WorldView> {
    return readWorldView(this.pool, limit);
  }
}
