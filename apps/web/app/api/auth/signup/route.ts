import { NextResponse } from "next/server";
import { createUser, createSession } from "@civ/persistence/src/auth-write";

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
  if (!email || password.length < 6) return NextResponse.json({ error: "email and a 6+ char password are required" }, { status: 400 });
  try {
    const user = await createUser(email, password);
    const token = await createSession(user.id);
    const res = NextResponse.json({ user }, { status: 201 });
    res.cookies.set("civ_session", token, COOKIE);
    return res;
  } catch (e: any) {
    if (String(e?.message ?? e).includes("duplicate")) return NextResponse.json({ error: "email already registered" }, { status: 409 });
    return NextResponse.json({ error: "signup failed" }, { status: 500 });
  }
}
