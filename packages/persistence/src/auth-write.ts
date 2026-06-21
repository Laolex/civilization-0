import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { getPool } from "./pool";

export type Plan = "free" | "pro" | "research";
export interface User { id: string; email: string | null; wallet: string | null; plan: Plan; hasApiKey: boolean; }

function hashPassword(pw: string): string {
  const salt = randomBytes(16).toString("hex");
  return `${salt}:${scryptSync(pw, salt, 64).toString("hex")}`;
}
function checkPassword(pw: string, stored: string): boolean {
  const [salt, h] = stored.split(":");
  if (!salt || !h) return false;
  const expected = Buffer.from(h, "hex");
  const actual = scryptSync(pw, salt, 64);
  return expected.length === actual.length && timingSafeEqual(expected, actual);
}
const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
const toUser = (r: any): User => ({ id: r.id, email: r.email ?? null, wallet: r.wallet_address ?? null, plan: r.plan as Plan, hasApiKey: !!r.api_key_hash });

/** The exact message a wallet signs to prove ownership. Server + client must agree. */
export function walletSignInMessage(address: string, nonce: string): string {
  return `Sign in to Civilization-0\n\nWallet: ${address.toLowerCase()}\nNonce: ${nonce}`;
}

/** Issue (or refresh) a single-use, 10-minute nonce for a wallet address. */
export async function createWalletNonce(address: string): Promise<string> {
  const nonce = randomBytes(16).toString("hex");
  await getPool().query(
    `INSERT INTO wallet_nonces (address, nonce, expires_at) VALUES ($1, $2, now() + interval '10 minutes')
     ON CONFLICT (address) DO UPDATE SET nonce = $2, expires_at = now() + interval '10 minutes'`,
    [address.toLowerCase(), nonce]);
  return nonce;
}

/** Atomically validate + consume a nonce (single-use). */
export async function consumeWalletNonce(address: string, nonce: string): Promise<boolean> {
  const r = await getPool().query(
    "DELETE FROM wallet_nonces WHERE address = $1 AND nonce = $2 AND expires_at > now() RETURNING address",
    [address.toLowerCase(), nonce]);
  return r.rowCount === 1;
}

/** Find-or-create a user keyed by wallet address (sign-in and sign-up in one). */
export async function upsertWalletUser(address: string): Promise<User> {
  const a = address.toLowerCase();
  const existing = await getPool().query("SELECT * FROM users WHERE wallet_address = $1", [a]);
  if (existing.rows[0]) return toUser(existing.rows[0]);
  const id = randomBytes(8).toString("hex");
  const r = await getPool().query("INSERT INTO users (id, wallet_address) VALUES ($1, $2) RETURNING *", [id, a]);
  return toUser(r.rows[0]);
}

export async function createUser(email: string, password: string): Promise<User> {
  const id = randomBytes(8).toString("hex");
  const r = await getPool().query(
    "INSERT INTO users (id,email,password_hash) VALUES ($1,$2,$3) RETURNING id,email,plan,api_key_hash",
    [id, email.toLowerCase().trim(), hashPassword(password)]);
  return toUser(r.rows[0]);
}
export async function verifyLogin(email: string, password: string): Promise<User | null> {
  const r = await getPool().query("SELECT * FROM users WHERE email = $1", [email.toLowerCase().trim()]);
  const u = r.rows[0];
  if (!u || !checkPassword(password, u.password_hash)) return null;
  return toUser(u);
}
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString("hex");
  await getPool().query("INSERT INTO sessions (token,user_id,expires_at) VALUES ($1,$2, now() + interval '7 days')", [token, userId]);
  return token;
}
export async function readSession(token: string): Promise<User | null> {
  const r = await getPool().query(
    `SELECT u.* FROM sessions s JOIN users u ON u.id = s.user_id WHERE s.token = $1 AND s.expires_at > now()`, [token]);
  return r.rows[0] ? toUser(r.rows[0]) : null;
}
export async function deleteSession(token: string): Promise<void> {
  await getPool().query("DELETE FROM sessions WHERE token = $1", [token]);
}
export async function setPlan(userId: string, plan: Plan): Promise<void> {
  await getPool().query("UPDATE users SET plan = $2 WHERE id = $1", [userId, plan]);
}
export async function mintApiKey(userId: string): Promise<string> {
  const raw = "civ_" + randomBytes(24).toString("hex");
  await getPool().query("UPDATE users SET api_key_hash = $2 WHERE id = $1", [userId, sha256(raw)]);
  return raw;
}
export async function userByApiKey(rawKey: string): Promise<User | null> {
  const r = await getPool().query("SELECT * FROM users WHERE api_key_hash = $1", [sha256(rawKey)]);
  return r.rows[0] ? toUser(r.rows[0]) : null;
}
