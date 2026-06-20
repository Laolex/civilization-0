import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import { createUser, verifyLogin, createSession, readSession, deleteSession, setPlan, mintApiKey, userByApiKey } from "./auth-write";

beforeAll(async () => { await migrate(); await getPool().query("DELETE FROM sessions"); await getPool().query("DELETE FROM users WHERE email LIKE 'itest-%'"); });
afterAll(async () => { await getPool().query("DELETE FROM sessions"); await getPool().query("DELETE FROM users WHERE email LIKE 'itest-%'"); await closePool(); });

describe("auth-write", () => {
  it("creates a user, verifies password, rejects wrong password and dup email", async () => {
    const u = await createUser("itest-a@x.io", "s3cret!");
    expect(u).toMatchObject({ email: "itest-a@x.io", plan: "free", hasApiKey: false });
    expect(await verifyLogin("itest-a@x.io", "s3cret!")).toMatchObject({ id: u.id });
    expect(await verifyLogin("itest-a@x.io", "wrong")).toBeNull();
    await expect(createUser("itest-a@x.io", "x")).rejects.toThrow();
  });
  it("sessions round-trip and expire on delete", async () => {
    const u = await createUser("itest-b@x.io", "pw");
    const t = await createSession(u.id);
    expect((await readSession(t))?.id).toBe(u.id);
    await deleteSession(t);
    expect(await readSession(t)).toBeNull();
    expect(await readSession("nope")).toBeNull();
  });
  it("plan + API key: research key resolves to the user", async () => {
    const u = await createUser("itest-c@x.io", "pw");
    await setPlan(u.id, "research");
    const key = await mintApiKey(u.id);
    expect(key.startsWith("civ_")).toBe(true);
    const back = await userByApiKey(key);
    expect(back).toMatchObject({ id: u.id, plan: "research", hasApiKey: true });
    expect(await userByApiKey("civ_bogus")).toBeNull();
  });
});
