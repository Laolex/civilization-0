import { NextResponse } from "next/server";
import { getPool } from "@civ/persistence/src/pool";
import { buildExplainView } from "@civ/history/src/explainView";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Keyless read of one authenticated, chain-verified cognitive trace from the history log.
 *  World selected via ?world= (default "default"). 404 when no transition was recorded. */
export async function GET(
  req: Request,
  { params }: { params: { citizen: string; tick: string } },
) {
  const world = new URL(req.url).searchParams.get("world") ?? "default";
  const tick = Number(params.tick);
  if (!Number.isFinite(tick))
    return NextResponse.json({ ok: false, error: "invalid tick" }, { status: 400 });
  try {
    const view = await buildExplainView(getPool(), world, params.citizen, tick);
    if (!view) return NextResponse.json({ ok: false, error: "not found" }, { status: 404 });
    return NextResponse.json({ ok: true, view });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
