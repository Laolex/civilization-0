import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { setPlan } from "@civ/persistence/src/auth-write";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";

const PLANS = ["free", "pro", "research"] as const;
type Plan = (typeof PLANS)[number];

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as { plan?: string };
  if (!body.plan || !PLANS.includes(body.plan as Plan)) {
    return NextResponse.json({ error: "invalid plan" }, { status: 400 });
  }
  await setPlan(user.id, body.plan as Plan);
  return NextResponse.json({ ok: true });
}
