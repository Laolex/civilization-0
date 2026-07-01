import { getPool } from "@civ/persistence";
import { loadGenesis, loadWorldDeltas, loadEpochStartTick } from "../src/read";
import { worldFold } from "../src/reduce";
import type { Executor } from "../src/append";
import type { WorldFacts } from "../src/types";

export async function civState(tx: Executor, worldId: string, tick: number): Promise<{ atEpochBaseline: boolean; epochId: string; facts: WorldFacts }> {
  const genesis = await loadGenesis(tx, worldId);
  if (!genesis) throw new Error(`no Genesis for world ${worldId} — epoch not established`);
  const start = await loadEpochStartTick(tx, worldId);
  if (start == null || tick < start) return { atEpochBaseline: true, epochId: genesis.epochId, facts: genesis.facts };
  const events = (await loadWorldDeltas(tx, worldId)).filter((e) => e.header.tickId <= tick);
  return { atEpochBaseline: false, epochId: genesis.epochId, facts: worldFold(genesis, events) };
}

async function main() {
  const args = process.argv.slice(2);
  const flag = (name: string, def: string) => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] ?? def : def; };
  const world = flag("--world", "default");
  const tick = Number(flag("--tick", "0"));
  const out = await civState(getPool(), world, tick);
  if (out.atEpochBaseline) console.log(`World state before the historical boundary is the verified baseline.\nEarliest authenticated state: ${out.epochId}`);
  console.log(JSON.stringify(out.facts, null, 2));
  process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) void main();
