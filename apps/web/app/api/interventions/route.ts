import { NextResponse } from "next/server";
import { getPool } from "@civ/persistence/src/pool";
import { readWorld } from "@civ/persistence/src/read";
import { canIntervene } from "@civ/persistence/src/intervention-authz";
import { enqueueIntervention, listInterventions } from "@civ/persistence/src/intervention-write";
import { getCurrentUser } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MAX_TEXT = 280;
const MAX_HEADLINE = 140;

export async function POST(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const worldId = typeof body.worldId === "string" ? body.worldId : "";
  const type = typeof body.type === "string" ? body.type : "";

  if (type !== "whisper" && type !== "world_event") {
    return NextResponse.json({ error: "unsupported intervention type" }, { status: 400 });
  }
  if (!worldId) return NextResponse.json({ error: "worldId is required" }, { status: 400 });

  if (type === "whisper") {
    const targetCitizenId = typeof body.targetCitizenId === "string" ? body.targetCitizenId : "";
    const text = typeof body.text === "string" ? body.text.trim() : "";
    if (!targetCitizenId) return NextResponse.json({ error: "targetCitizenId is required" }, { status: 400 });
    if (!text || text.length > MAX_TEXT) return NextResponse.json({ error: `text must be 1..${MAX_TEXT} chars` }, { status: 400 });

    const world = await readWorld(getPool(), worldId);
    if (!world) return NextResponse.json({ error: "world not found" }, { status: 404 });
    if (!canIntervene({ id: user.id, plan: user.plan }, { id: world.id, ownerId: world.ownerId })) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    const cw = await getPool().query("SELECT world_id FROM citizens WHERE id = $1", [targetCitizenId]);
    if ((cw.rows[0]?.world_id ?? null) !== worldId) {
      return NextResponse.json({ error: "citizen not in world" }, { status: 400 });
    }
    const row = await enqueueIntervention({
      id: `iv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
      worldId, userId: user.id, type: "whisper", targetCitizenId, payload: { text },
    });
    return NextResponse.json(row, { status: 201 });
  }

  // type === "world_event"
  const headline = typeof body.headline === "string" ? body.headline.trim() : "";
  if (!headline || headline.length > MAX_HEADLINE) {
    return NextResponse.json({ error: `headline must be 1..${MAX_HEADLINE} chars` }, { status: 400 });
  }
  const world = await readWorld(getPool(), worldId);
  if (!world) return NextResponse.json({ error: "world not found" }, { status: 404 });
  if (!canIntervene({ id: user.id, plan: user.plan }, { id: world.id, ownerId: world.ownerId })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  const row = await enqueueIntervention({
    id: `iv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    worldId, userId: user.id, type: "world_event", targetCitizenId: null, payload: { headline },
  });
  return NextResponse.json(row, { status: 201 });
}

export async function GET(req: Request) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const worldId = new URL(req.url).searchParams.get("worldId") ?? "";
  if (!worldId) return NextResponse.json({ error: "worldId required" }, { status: 400 });
  const world = await readWorld(getPool(), worldId);
  if (!world) return NextResponse.json({ error: "world not found" }, { status: 404 });
  if (!canIntervene({ id: user.id, plan: user.plan }, { id: world.id, ownerId: world.ownerId })) {
    return NextResponse.json({ error: "forbidden" }, { status: 403 });
  }
  return NextResponse.json(await listInterventions(worldId, 20));
}
