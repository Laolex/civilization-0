import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { closePool, getPool } from "./pool";
import { migrate } from "./migrate";
import {
  createWalletNonce, consumeWalletNonce, upsertWalletUser, readSession, createSession, walletSignInMessage,
} from "./auth-write";

const ADDR = "0x1111111111111111111111111111111111111111";
beforeAll(async () => {
  await migrate();
  await getPool().query("DELETE FROM sessions");
  await getPool().query("DELETE FROM wallet_nonces WHERE address LIKE '0x1111%'");
  await getPool().query("DELETE FROM users WHERE wallet_address LIKE '0x1111%'");
});
afterAll(async () => {
  await getPool().query("DELETE FROM sessions");
  await getPool().query("DELETE FROM wallet_nonces WHERE address LIKE '0x1111%'");
  await getPool().query("DELETE FROM users WHERE wallet_address LIKE '0x1111%'");
  await closePool();
});

describe("wallet auth", () => {
  it("nonce is single-use and embedded in the sign-in message", async () => {
    const nonce = await createWalletNonce(ADDR);
    expect(walletSignInMessage(ADDR, nonce)).toContain(nonce);
    expect(await consumeWalletNonce(ADDR, nonce)).toBe(true);
    expect(await consumeWalletNonce(ADDR, nonce)).toBe(false); // already consumed
    expect(await consumeWalletNonce(ADDR, "wrong")).toBe(false);
  });

  it("upsertWalletUser is find-or-create and round-trips a session", async () => {
    const u1 = await upsertWalletUser(ADDR);
    expect(u1).toMatchObject({ wallet: ADDR, email: null, plan: "free" });
    const u2 = await upsertWalletUser(ADDR.toUpperCase().replace("0X", "0x"));
    expect(u2.id).toBe(u1.id); // same wallet (case-insensitive) → same user

    const token = await createSession(u1.id);
    const back = await readSession(token);
    expect(back?.id).toBe(u1.id);
    expect(back?.wallet).toBe(ADDR);
  });
});
