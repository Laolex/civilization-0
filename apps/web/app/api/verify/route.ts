// apps/web/app/api/verify/route.ts
import { NextResponse } from "next/server";
// Deep imports to avoid pulling in brain.ts (which needs @civ/brain + @civ/shared, not needed here)
import { createZeroGDownloader } from "@civ/zerog/src/real-downloader";
import { parseArchivedTrace } from "@civ/zerog/src/download";

export const runtime = "nodejs";          // SDK needs Node APIs, not edge
export const dynamic = "force-dynamic";   // never statically cache a live fetch

const INDEXER =
  process.env.ZG_STORAGE_INDEXER ?? "https://indexer-storage-testnet-turbo.0g.ai";

export async function GET(req: Request) {
  const root = new URL(req.url).searchParams.get("root");
  if (!root)
    return NextResponse.json({ ok: false, error: "missing root" }, { status: 400 });
  try {
    const bytes = await createZeroGDownloader(INDEXER).download(root);
    const rec = parseArchivedTrace(bytes);
    const data = rec.data as { decision?: unknown; meta?: { verified?: unknown } };
    return NextResponse.json({
      ok: true,
      key: rec.key,
      bytes: bytes.length,
      excerpt: { decision: data.decision, verified: data.meta?.verified ?? false },
    });
  } catch (err) {
    return NextResponse.json(
      { ok: false, error: err instanceof Error ? err.message : String(err) },
      { status: 502 },
    );
  }
}
