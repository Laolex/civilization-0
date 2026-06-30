import { eventHash } from "./hash";
import { GENESIS_PARENT, eventKind, type EventId, type Hash, type HistoryEvent } from "./types";

export interface Executor {
  query(text: string, params?: unknown[]): Promise<{ rows: any[] }>;
}

/** Append one event to a world's chain. Reads the tip, links parentHash, hashes, inserts.
 *  MUST be called inside the caller's transaction (Invariant #2) when paired with a mutation. */
export async function append(
  tx: Executor,
  event: HistoryEvent,
): Promise<{ seq: number; eventId: EventId; eventHash: Hash; parentHash: Hash }> {
  // FOR UPDATE serialises concurrent appends to the same world: the second tick blocks until
  // the first commits, then reads the new tip and links correctly. The UNIQUE(world_id,parent_hash)
  // index is the airtight backstop (it also covers the genesis empty-tip race, which locks nothing).
  const tip = await tx.query(
    `SELECT event_hash FROM history_events WHERE world_id = $1 ORDER BY seq DESC LIMIT 1 FOR UPDATE`,
    [event.header.worldId],
  );
  const parentHash: Hash = tip.rows[0]?.event_hash ?? GENESIS_PARENT;
  event.header.parentHash = parentHash; // hash over the linked header
  const hash = eventHash(event);
  const { header, ...payload } = event;
  const ins = await tx.query(
    `INSERT INTO history_events (event_id, world_id, tick_id, parent_hash, event_hash, kind, payload)
     VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING seq`,
    [header.eventId, header.worldId, header.tickId, parentHash, hash, eventKind(event),
     JSON.stringify({ header, ...payload })],
  );
  return { seq: Number(ins.rows[0].seq), eventId: header.eventId, eventHash: hash, parentHash };
}

export async function loadWorldEvents(
  tx: Executor,
  worldId: string,
): Promise<{ event: HistoryEvent; eventHash: Hash; parentHash: Hash }[]> {
  const r = await tx.query(
    `SELECT event_hash, parent_hash, payload FROM history_events WHERE world_id = $1 ORDER BY seq ASC`,
    [worldId],
  );
  return r.rows.map((row) => ({
    event: row.payload as HistoryEvent, // payload already includes header
    eventHash: row.event_hash,
    parentHash: row.parent_hash,
  }));
}
