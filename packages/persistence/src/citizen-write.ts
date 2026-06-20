import { getPool } from "./pool";

export interface CreateCitizenInput {
  id: string; name: string; occupation: string; age: number;
  traits: Record<string, number>; tier: number; createdDay: number;
  backstory?: string; goal?: string;
}

// Mirrors @civ/memory's FakeEmbedder (DIM=64, FNV-1a token buckets). Inlined
// because this pg-only write path is deep-imported by the keyless web/API
// bundle and must NOT pull @civ/memory (which imports @civ/store). A memory
// row MUST carry a 64-dim embedding or the engine's cosineSimilarity throws a
// length-mismatch during the next scheduler tick.
const EMBED_DIM = 64;
function embed(text: string): number[] {
  const v = new Array<number>(EMBED_DIM).fill(0);
  for (const raw of text.toLowerCase().split(/\W+/)) {
    if (!raw) continue;
    let h = 0x811c9dc5;
    for (let i = 0; i < raw.length; i++) { h ^= raw.charCodeAt(i); h = Math.imul(h, 0x01000193); }
    v[(h >>> 0) % EMBED_DIM] += 1;
  }
  return v;
}

export async function createCitizen(input: CreateCitizenInput): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO citizens (id,name,occupation,age,traits,wealth,reputation,tier,created_day)
     VALUES ($1,$2,$3,$4,$5,0,50,$6,$7) ON CONFLICT (id) DO NOTHING`,
    [input.id, input.name, input.occupation, input.age, JSON.stringify(input.traits), input.tier, input.createdDay]);
  if (input.backstory) {
    await pool.query(
      `INSERT INTO memories (id,citizen_id,day,type,importance,summary,embedding)
       VALUES ($1,$2,$3,'backstory',8,$4,$5) ON CONFLICT (id) DO NOTHING`,
      [`${input.id}-backstory`, input.id, input.createdDay, input.backstory, `[${embed(input.backstory).join(",")}]`]);
  }
  if (input.goal) {
    await pool.query(
      `INSERT INTO goals (id,citizen_id,kind,description,progress,active)
       VALUES ($1,$2,'aspiration',$3,0,true) ON CONFLICT (id) DO NOTHING`,
      [`${input.id}-goal`, input.id, input.goal]);
  }
}
