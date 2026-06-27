import { NextResponse } from "next/server";
import { getPool } from "@civ/persistence/src/pool";
import { readDecisionChainRaw } from "@civ/persistence/src/read";
import { toCausalChain } from "../../../lib/citizen-db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  if (!id)
    return NextResponse.json({ ok: false, error: "missing id" }, { status: 400 });
  try {
    const raw = await readDecisionChainRaw(getPool(), id);
    if (!raw) return NextResponse.json({ ok: true, chain: null });
    const chain = toCausalChain({
      decisionId: raw.decisionId,
      action: raw.action,
      targetId: raw.targetId,
      reasoning: raw.reasoning,
      provider: raw.provider,
      model: raw.model,
      verified: raw.verified,
      memories: raw.memories,
      beliefs: raw.beliefs,
      event: raw.event,
      rootHash: raw.rootHash,
      txHash: raw.txHash,
      socialDrivers: raw.socialDrivers,
      socialQuery: raw.socialQuery ?? undefined,
      orgDriver: raw.orgDriver ?? undefined,
    });
    return NextResponse.json({ ok: true, chain });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
