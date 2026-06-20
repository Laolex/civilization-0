import { NextResponse } from "next/server";
import { getPool } from "@civ/persistence/src/pool";
import { createCitizen } from "@civ/persistence/src/citizen-write";

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

  try {
    const ws = await getPool().query("SELECT day FROM world_state WHERE id = 1");
    const createdDay = ws.rows[0]?.day ?? 0;
    await createCitizen({ id, name, occupation, age, traits, tier, createdDay, backstory, goal });
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : String(err) }, { status: 500 });
  }
}
