import { NextResponse } from "next/server";
import { getPool } from "@civ/persistence/src/pool";
import { createCitizen } from "@civ/persistence/src/citizen-write";
import { readWorld } from "@civ/persistence/src/read";
import { worldPopulation } from "@civ/persistence/src/world-write";
import { getCurrentUser } from "../../../lib/auth";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const DEFAULT_TRAITS = { ambition: 50, empathy: 50, loyalty: 50, curiosity: 50, discipline: 50, riskTolerance: 50 };

export async function POST(req: Request) {
  let body: Record<string, unknown>;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const name = typeof body.name === "string" ? body.name.trim() : "";
  const occupation = typeof body.occupation === "string" ? body.occupation.trim() : "";
  if (!name || !occupation) return NextResponse.json({ error: "name and occupation are required" }, { status: 400 });

  const id = `${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "")}-${Date.now().toString(36).slice(-4)}`;
  const age = Number.isFinite(body.age) ? Number(body.age) : 25;
  const tier = body.tier === 1 || body.tier === 2 || body.tier === 3 ? body.tier : 1;
  const traits = { ...DEFAULT_TRAITS, ...(typeof body.traits === "object" && body.traits ? body.traits as Record<string, number> : {}) };
  const backstory = typeof body.backstory === "string" ? body.backstory.trim() : undefined;
  const goal = typeof body.goal === "string" ? body.goal.trim() : undefined;
  const worldId = typeof body.worldId === "string" && body.worldId ? body.worldId : "genesis";

  const world = await readWorld(getPool(), worldId);
  if (!world) return NextResponse.json({ error: "world not found" }, { status: 404 });
  if (worldId !== "genesis") {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "sign in required" }, { status: 401 });
    if (world.ownerId !== user.id) return NextResponse.json({ error: "not your world" }, { status: 403 });
  }
  if ((await worldPopulation(worldId)) >= world.populationCap) {
    return NextResponse.json({ error: "world population cap reached" }, { status: 409 });
  }

  try {
    const ws = await getPool().query("SELECT day FROM world_state WHERE id = 1");
    const createdDay = ws.rows[0]?.day ?? 0;
    await createCitizen({ id, name, occupation, age, traits, tier, createdDay, backstory, goal, worldId });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
