import type { StorageProvider } from "@civ/storage";
import { type Executor, append, loadWorldEvents } from "./append";
import { merkleRoot } from "./hash";
import {
  GENESIS_PARENT, SCHEMA_VERSION, eventKind,
  type AnchorEvent, type CognitiveTransition, type Hash,
} from "./types";

export async function anchorTick(
  tx: Executor,
  storage: StorageProvider,
  worldId: string,
  tickId: number,
  opts: { engineVersion?: string } = {},
): Promise<{ merkleRoot: Hash; zgRootHash: string | null; zgTxHash: string | null } | null> {
  const rows = await loadWorldEvents(tx, worldId);
  const tickRows = rows.filter(
    (r) => eventKind(r.event) === "CognitiveTransition" && (r.event as CognitiveTransition).header.tickId === tickId,
  );
  if (tickRows.length === 0) return null;

  const root = merkleRoot(tickRows.map((r) => r.eventHash));
  const coveredEventIds = tickRows.map((r) => (r.event as CognitiveTransition).header.eventId);

  let zgRootHash: string | null = null;
  let zgTxHash: string | null = null;
  try {
    const res = await storage.archive(`civ.history/v0/${worldId}/${tickId}`, { merkleRoot: root, coveredEventIds });
    zgRootHash = res.rootHash;
    zgTxHash = res.txHash;
  } catch (err) {
    // best-effort: a missed anchor leaves the chain intact and re-anchorable
    console.warn(`[history] 0G anchor archive failed world=${worldId} tick=${tickId}:`, err);
  }

  const anchorId = `anchor-${worldId}-${tickId}`;
  await tx.query(
    `INSERT INTO history_anchors (id, world_id, tick_id, merkle_root, zg_root_hash, zg_tx_hash)
     VALUES ($1,$2,$3,$4,$5,$6)
     ON CONFLICT (id) DO UPDATE SET merkle_root=$4, zg_root_hash=$5, zg_tx_hash=$6`,
    [anchorId, worldId, tickId, root, zgRootHash, zgTxHash],
  );

  // Idempotent: the history_anchors row upserts (re-anchorable), but the chained AnchorEvent uses
  // a deterministic id and history_events.event_id is UNIQUE — so only append it the first time.
  // Re-anchoring a tick refreshes the anchors row without throwing or duplicating the chain event.
  const existing = await tx.query(`SELECT 1 FROM history_events WHERE event_id = $1`, [anchorId]);
  if (existing.rows.length === 0) {
    const anchorEvent: AnchorEvent = {
      header: { eventId: anchorId, parentHash: GENESIS_PARENT, worldId, tickId,
        engineVersion: opts.engineVersion ?? "civ0@dev", schemaVersion: SCHEMA_VERSION, timestamp: new Date().toISOString() },
      merkleRoot: root, coveredEventIds, zgRootHash, zgTxHash,
    };
    await append(tx, anchorEvent); // append-only; Anchor is exempt from #2 but bound by #3
  }

  return { merkleRoot: root, zgRootHash, zgTxHash };
}
