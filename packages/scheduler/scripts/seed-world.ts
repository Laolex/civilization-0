import { WorldRepository, resetWorld, getPool, closePool } from "@civ/persistence";
import { FakeEmbedder } from "@civ/memory";

const repo = new WorldRepository();
const embedder = new FakeEmbedder();

async function main() {
  // Idempotent: wipe everything first
  await resetWorld();

  // ── Citizens ────────────────────────────────────────────────────────────────

  await repo.upsertCitizenRow({
    id: "ada",
    name: "Ada Chen",
    occupation: "Founder",
    age: 29,
    traits: { ambition: 92, empathy: 55, loyalty: 60, curiosity: 88, discipline: 85, riskTolerance: 78 },
    wealth: 42000,
    reputation: 71,
    tier: 3,
    createdDay: 0,
  });

  await repo.upsertCitizenRow({
    id: "marcus",
    name: "Marcus Venn",
    occupation: "Investor",
    age: 41,
    traits: { ambition: 74, empathy: 48, loyalty: 82, curiosity: 60, discipline: 88, riskTolerance: 55 },
    wealth: 185000,
    reputation: 83,
    tier: 2,
    createdDay: 0,
  });

  await repo.upsertCitizenRow({
    id: "lena",
    name: "Lena Hartmann",
    occupation: "Engineer",
    age: 34,
    traits: { ambition: 68, empathy: 72, loyalty: 75, curiosity: 81, discipline: 79, riskTolerance: 45 },
    wealth: 61000,
    reputation: 64,
    tier: 2,
    createdDay: 0,
  });

  await repo.upsertCitizenRow({
    id: "omar",
    name: "Omar Farooq",
    occupation: "Teacher",
    age: 47,
    traits: { ambition: 50, empathy: 90, loyalty: 85, curiosity: 70, discipline: 72, riskTolerance: 30 },
    wealth: 28000,
    reputation: 77,
    tier: 1,
    createdDay: 0,
  });

  await repo.upsertCitizenRow({
    id: "priya",
    name: "Priya Nair",
    occupation: "Artist",
    age: 26,
    traits: { ambition: 62, empathy: 83, loyalty: 65, curiosity: 91, discipline: 44, riskTolerance: 67 },
    wealth: 12000,
    reputation: 52,
    tier: 1,
    createdDay: 0,
  });

  await repo.upsertCitizenRow({
    id: "sven",
    name: "Sven Larsson",
    occupation: "Trader",
    age: 38,
    traits: { ambition: 76, empathy: 42, loyalty: 58, curiosity: 65, discipline: 70, riskTolerance: 84 },
    wealth: 37000,
    reputation: 60,
    tier: 1,
    createdDay: 0,
  });

  // ── Memories ─────────────────────────────────────────────────────────────────

  const adaMem1 = "Ada pitched her startup at the city demo day and closed her first angel cheque.";
  await repo.addMemoryRow({
    id: "m-ada-1",
    citizenId: "ada",
    day: 1,
    type: "event",
    importance: 9,
    summary: adaMem1,
    embedding: embedder.embed(adaMem1),
  });

  const adaMem2 = "Ada met Marcus at a networking dinner; he expressed interest in her vision.";
  await repo.addMemoryRow({
    id: "m-ada-2",
    citizenId: "ada",
    day: 1,
    type: "relationship",
    importance: 7,
    summary: adaMem2,
    embedding: embedder.embed(adaMem2),
  });

  const marcusMem1 = "Marcus reviewed Ada's pitch deck and decided to back her seed round.";
  await repo.addMemoryRow({
    id: "m-marcus-1",
    citizenId: "marcus",
    day: 1,
    type: "event",
    importance: 8,
    summary: marcusMem1,
    embedding: embedder.embed(marcusMem1),
  });

  const marcusMem2 = "Marcus heard rumours of a new competitor entering the market.";
  await repo.addMemoryRow({
    id: "m-marcus-2",
    citizenId: "marcus",
    day: 1,
    type: "observation",
    importance: 5,
    summary: marcusMem2,
    embedding: embedder.embed(marcusMem2),
  });

  const lenaMem1 = "Lena shipped the prototype infrastructure and got praise from the team.";
  await repo.addMemoryRow({
    id: "m-lena-1",
    citizenId: "lena",
    day: 1,
    type: "event",
    importance: 7,
    summary: lenaMem1,
    embedding: embedder.embed(lenaMem1),
  });

  const lenaMem2 = "Lena paired with Ada to spec the data pipeline architecture.";
  await repo.addMemoryRow({
    id: "m-lena-2",
    citizenId: "lena",
    day: 1,
    type: "relationship",
    importance: 6,
    summary: lenaMem2,
    embedding: embedder.embed(lenaMem2),
  });

  // ── Goals ─────────────────────────────────────────────────────────────────────

  const pool = getPool();

  await pool.query(
    "INSERT INTO goals (id,citizen_id,kind,description,progress,active) VALUES ($1,$2,$3,$4,$5,TRUE) ON CONFLICT (id) DO NOTHING",
    ["g-ada-1", "ada", "grow", "Raise a $500 k seed round within 60 days", 10],
  );

  await pool.query(
    "INSERT INTO goals (id,citizen_id,kind,description,progress,active) VALUES ($1,$2,$3,$4,$5,TRUE) ON CONFLICT (id) DO NOTHING",
    ["g-marcus-1", "marcus", "invest", "Deploy $200 k into two promising startups this quarter", 25],
  );

  await pool.query(
    "INSERT INTO goals (id,citizen_id,kind,description,progress,active) VALUES ($1,$2,$3,$4,$5,TRUE) ON CONFLICT (id) DO NOTHING",
    ["g-lena-1", "lena", "build", "Deliver the MVP backend before the public launch", 40],
  );

  await pool.query(
    "INSERT INTO goals (id,citizen_id,kind,description,progress,active) VALUES ($1,$2,$3,$4,$5,TRUE) ON CONFLICT (id) DO NOTHING",
    ["g-omar-1", "omar", "influence", "Mentor five students to pass their engineering exams", 20],
  );

  await pool.query(
    "INSERT INTO goals (id,citizen_id,kind,description,progress,active) VALUES ($1,$2,$3,$4,$5,TRUE) ON CONFLICT (id) DO NOTHING",
    ["g-priya-1", "priya", "create", "Complete and exhibit a series of twelve digital paintings", 15],
  );

  await pool.query(
    "INSERT INTO goals (id,citizen_id,kind,description,progress,active) VALUES ($1,$2,$3,$4,$5,TRUE) ON CONFLICT (id) DO NOTHING",
    ["g-sven-1", "sven", "earn", "Achieve a 20 % return on trading positions this month", 5],
  );

  // ── Relationships ─────────────────────────────────────────────────────────────

  // ada → marcus
  await pool.query(
    "INSERT INTO relationships (citizen_id,other_id,trust,friendship,influence) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (citizen_id,other_id) DO NOTHING",
    ["ada", "marcus", 65, 55, 70],
  );

  // marcus → ada
  await pool.query(
    "INSERT INTO relationships (citizen_id,other_id,trust,friendship,influence) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (citizen_id,other_id) DO NOTHING",
    ["marcus", "ada", 70, 50, 60],
  );

  // ada → lena
  await pool.query(
    "INSERT INTO relationships (citizen_id,other_id,trust,friendship,influence) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (citizen_id,other_id) DO NOTHING",
    ["ada", "lena", 80, 75, 55],
  );

  // lena → ada
  await pool.query(
    "INSERT INTO relationships (citizen_id,other_id,trust,friendship,influence) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (citizen_id,other_id) DO NOTHING",
    ["lena", "ada", 78, 72, 50],
  );

  // ── World state ───────────────────────────────────────────────────────────────

  await repo.setDay(0);

  // ── Report ────────────────────────────────────────────────────────────────────

  const ids = ["ada", "marcus", "lena", "omar", "priya", "sven"];
  console.log("Inserted citizens:", ids.join(", "));

  const result = await pool.query<{ count: number }>("SELECT COUNT(*)::int AS count FROM citizens");
  const count = result.rows[0].count;
  console.log(`COUNT(*) FROM citizens === ${count}`);

  if (count !== 6) {
    throw new Error(`Expected 6 citizens, got ${count}`);
  }

  await closePool();
  console.log("Done. Pool closed.");
}

main().catch((err) => {
  console.error(err);
  closePool().finally(() => process.exit(1));
});
