import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { deleteSession } from "@civ/persistence/src/auth-write";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  const t = cookies().get("civ_session")?.value;
  if (t) await deleteSession(t);
  const res = NextResponse.json({ ok: true });
  res.cookies.set("civ_session", "", { path: "/", maxAge: 0 });
  return res;
}
