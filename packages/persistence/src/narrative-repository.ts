import { getPool } from "./pool";

export interface NarrativeRecord {
  id: string; subjectId: string; kind: string; day: number; text: string;
  rootHash?: string; txHash?: string;
}

export class NarrativeRepository {
  async saveNarrative(rec: NarrativeRecord): Promise<void> {
    await getPool().query(
      `INSERT INTO narratives (id, subject_id, kind, day, text, zg_root_hash, zg_tx_hash, created_day)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$4)
       ON CONFLICT (id) DO UPDATE SET text = EXCLUDED.text, day = EXCLUDED.day,
         zg_root_hash = EXCLUDED.zg_root_hash, zg_tx_hash = EXCLUDED.zg_tx_hash`,
      [rec.id, rec.subjectId, rec.kind, rec.day, rec.text, rec.rootHash ?? null, rec.txHash ?? null]);
  }
}
