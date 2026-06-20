import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { createWorld } from "@civ/persistence/src/world-write";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  let b: any; try { b = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = typeof b.name === "string" ? b.name.trim() : "";
  const visibility = b.visibility === "private" ? "private" : "public";
  if (!name) return NextResponse.json({ error: "name required" }, { status: 400 });
  try { const { id } = await createWorld({ ownerId: user.id, ownerPlan: user.plan, name, visibility }); return NextResponse.json({ id }, { status: 201 }); }
  catch (e: any) { return NextResponse.json({ error: e?.message ?? "failed" }, { status: 403 }); }
}
