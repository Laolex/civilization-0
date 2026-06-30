import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { migrate } from "./migrate";
import { getPool, closePool } from "./pool";

describe("history schema", () => {
  beforeAll(async () => { await migrate(); });
  afterAll(async () => { await closePool(); });

  it("creates history_events and history_anchors", async () => {
    const r = await getPool().query(
      `SELECT table_name FROM information_schema.tables
        WHERE table_name IN ('history_events','history_anchors') ORDER BY table_name`);
    expect(r.rows.map((x) => x.table_name)).toEqual(["history_anchors", "history_events"]);
  });

  it("enables RLS on both tables", async () => {
    const r = await getPool().query(
      `SELECT relname FROM pg_class
        WHERE relname IN ('history_events','history_anchors') AND relrowsecurity = true
        ORDER BY relname`);
    expect(r.rows.map((x) => x.relname)).toEqual(["history_anchors", "history_events"]);
  });
});
