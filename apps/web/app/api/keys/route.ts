import { NextResponse } from "next/server";
import { getCurrentUser } from "../../../lib/auth";
import { mintApiKey } from "@civ/persistence/src/auth-write";
import { PLAN_LIMITS } from "@civ/persistence/src/world-write";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function POST() {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });
  if (!PLAN_LIMITS[user.plan].api) return NextResponse.json({ error: "API access requires the Research plan" }, { status: 403 });
  const key = await mintApiKey(user.id);
  return NextResponse.json({ key });
}
