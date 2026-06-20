import { NextResponse } from "next/server";
import { getPool } from "@civ/persistence/src/pool";
import { userByApiKey } from "@civ/persistence/src/auth-write";
import { PLAN_LIMITS } from "@civ/persistence/src/world-write";
import { exportProvenance } from "@civ/persistence/src/read";
export const runtime = "nodejs"; export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const key = auth?.startsWith("Bearer ") ? auth.slice(7) : req.headers.get("x-api-key");
  if (!key) return NextResponse.json({ error: "missing API key" }, { status: 401 });
  const user = await userByApiKey(key);
  if (!user) return NextResponse.json({ error: "invalid API key" }, { status: 401 });
  if (!PLAN_LIMITS[user.plan].api) return NextResponse.json({ error: "Research plan required" }, { status: 403 });
  const url = new URL(req.url);
  const records = await exportProvenance(getPool(), {
    worldId: url.searchParams.get("world") ?? undefined,
    citizenId: url.searchParams.get("citizen") ?? undefined,
    limit: url.searchParams.get("limit") ? Number(url.searchParams.get("limit")) : undefined,
  });
  return NextResponse.json({ count: records.length, records });
}
