import { randomBytes, scryptSync, timingSafeEqual, createHash } from "node:crypto";
import { getPool } from "./pool";

export type Plan = "free" | "pro" | "research";
export interface User { id: string; email: string; plan: Plan; hasApiKey: boolean; }

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
const toUser = (r: any): User => ({ id: r.id, email: r.email, plan: r.plan as Plan, hasApiKey: !!r.api_key_hash });

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
