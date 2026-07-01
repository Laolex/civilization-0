// Manual, gated: archives one world+tick's merkle root to REAL 0G (~0.002 OG) and prints the anchor.
// Run: DATABASE_URL=... <0G envs> tsx packages/history/scripts/anchor-smoke.ts --world <id> --tick <day>
import { getPool, closePool } from "@civ/persistence";
import { createZeroGStorage, loadZeroGConfig } from "@civ/zerog";
import { anchorTick } from "../src/anchor";

function arg(n: string) { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : undefined; }

async function main() {
  const world = arg("world") ?? "default";
  const tick = Number(arg("tick"));
  if (!Number.isFinite(tick)) { console.error("usage: --world <id> --tick <day>"); process.exit(2); }
  const storage = createZeroGStorage(loadZeroGConfig(process.env));
  const res = await anchorTick(getPool(), storage, world, tick);
  console.log("anchor:", res);
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
