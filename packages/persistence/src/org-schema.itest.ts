import { describe, it, expect, afterAll } from "vitest";
import { getPool, closePool } from "./pool";
import { migrate } from "./migrate";

afterAll(async () => { await closePool(); });

describe("org schema", () => {
  it("creates organizations and memberships tables", async () => {
    await migrate();
    const orgs = await getPool().query("SELECT to_regclass('public.organizations') AS t");
    const mem = await getPool().query("SELECT to_regclass('public.memberships') AS t");
    expect(orgs.rows[0].t).not.toBeNull();
    expect(mem.rows[0].t).not.toBeNull();
  });
});
