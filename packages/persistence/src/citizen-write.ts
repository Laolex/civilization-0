import { getPool } from "./pool";

export interface CreateCitizenInput {
  id: string; name: string; occupation: string; age: number;
  traits: Record<string, number>; tier: number; createdDay: number;
  backstory?: string; goal?: string;
}

export async function createCitizen(input: CreateCitizenInput): Promise<void> {
  const pool = getPool();
  await pool.query(
    `INSERT INTO citizens (id,name,occupation,age,traits,wealth,reputation,tier,created_day)
     VALUES ($1,$2,$3,$4,$5,0,50,$6,$7) ON CONFLICT (id) DO NOTHING`,
    [input.id, input.name, input.occupation, input.age, JSON.stringify(input.traits), input.tier, input.createdDay]);
  if (input.backstory) {
    await pool.query(
      `INSERT INTO memories (id,citizen_id,day,type,importance,summary)
       VALUES ($1,$2,$3,'backstory',8,$4) ON CONFLICT (id) DO NOTHING`,
      [`${input.id}-backstory`, input.id, input.createdDay, input.backstory]);
  }
  if (input.goal) {
    await pool.query(
      `INSERT INTO goals (id,citizen_id,kind,description,progress,active)
       VALUES ($1,$2,'aspiration',$3,0,true) ON CONFLICT (id) DO NOTHING`,
      [`${input.id}-goal`, input.id, input.goal]);
  }
}
