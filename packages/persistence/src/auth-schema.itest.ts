import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";

beforeAll(async () => { await migrate(); });
afterAll(async () => { await closePool(); });

describe("auth/world schema", () => {
  it("has a seeded public genesis world and a world_id column on citizens", async () => {
    const w = await getPool().query("SELECT id, visibility, population_cap FROM worlds WHERE id = 'genesis'");
    expect(w.rows[0]).toMatchObject({ id: "genesis", visibility: "public", population_cap: 1000 });
    const col = await getPool().query("SELECT column_default FROM information_schema.columns WHERE table_name='citizens' AND column_name='world_id'");
    expect(col.rows[0].column_default).toContain("genesis");
  });
  it("enforces unique user email", async () => {
    await getPool().query("DELETE FROM users WHERE email = 'itest-uniq@x.io'");
    await getPool().query("INSERT INTO users (id,email,password_hash) VALUES ('u1','itest-uniq@x.io','h')");
    await expect(getPool().query("INSERT INTO users (id,email,password_hash) VALUES ('u2','itest-uniq@x.io','h')")).rejects.toThrow();
    await getPool().query("DELETE FROM users WHERE email = 'itest-uniq@x.io'");
  });
});
