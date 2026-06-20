import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { resetWorld } from "./testutil";

beforeAll(async () => { await migrate(); await resetWorld(); });
afterAll(async () => { await closePool(); });

describe("narratives table", () => {
  it("accepts a narrative row with 0G provenance and reads it back", async () => {
    await getPool().query(
      `INSERT INTO narratives (id, subject_id, kind, day, text, zg_root_hash, zg_tx_hash, created_day)
       VALUES ('n1', 'ada', 'life_story', 12, 'Ada built things.', '0xroot', '0xtx', 12)`);
    const r = await getPool().query("SELECT subject_id, kind, text, zg_root_hash FROM narratives WHERE id = 'n1'");
    expect(r.rows[0]).toMatchObject({ subject_id: "ada", kind: "life_story", text: "Ada built things.", zg_root_hash: "0xroot" });
  });
});
