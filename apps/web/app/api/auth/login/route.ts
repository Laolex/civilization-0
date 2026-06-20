import { NextResponse } from "next/server";
import { verifyLogin, createSession } from "@civ/persistence/src/auth-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// secure is opt-in via COOKIE_SECURE=1 (set it behind HTTPS). Default off so the
// self-hosted http tailnet deployment can carry the session cookie.
const COOKIE = { httpOnly: true, sameSite: "lax" as const, path: "/", secure: process.env.COOKIE_SECURE === "1", maxAge: 60 * 60 * 24 * 7 };

export async function POST(req: Request) {
  let b: any;
  try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const email = typeof b.email === "string" ? b.email.trim() : "";
  const password = typeof b.password === "string" ? b.password : "";
  if (!email || !password) return NextResponse.json({ error: "email and password are required" }, { status: 400 });
  const user = await verifyLogin(email, password);
  if (!user) return NextResponse.json({ error: "invalid credentials" }, { status: 401 });
  const token = await createSession(user.id);
  const res = NextResponse.json({ user });
  res.cookies.set("civ_session", token, COOKIE);
  return res;
}
