import { describe, it, expect, afterAll } from "vitest";
import { getPool, closePool } from "./pool";
import { migrate } from "./migrate";

afterAll(async () => { await closePool(); });

describe("migrate", () => {
  it("creates the world tables", async () => {
    await migrate();
    const { rows } = await getPool().query(
      "SELECT to_regclass('public.citizens') AS c, to_regclass('public.events') AS e",
    );
    expect(rows[0].c).toBe("citizens");
    expect(rows[0].e).toBe("events");
  });
});
