import { loadZeroGConfig } from "@civ/zerog/src/config";
import { createZeroGStorage } from "@civ/zerog/src/real-uploader";
import { createZeroGComputeBrain } from "@civ/zerog/src/real-chat";
import { getBalanceOG, getWalletAddress } from "@civ/zerog/src/wallet";
import { WorldRepository, getPool, closePool } from "@civ/persistence";
import { FakeEmbedder, MemoryIndex } from "@civ/memory";
import { RuleBasedBeliefReviser } from "@civ/beliefs";
import { ExplainabilityService } from "@civ/explainability";
import type { TickDeps } from "@civ/engine";
import type { InMemoryWorldStore } from "@civ/store";
import { runDay } from "../src/loop";
import type { Ticker } from "../src/select";
import { drainInterventions, makeWhisperApplier, makeWorldEventApplier } from "../src/interventions";
import { pendingInterventions, markInterventionApplied, markInterventionFailed } from "@civ/persistence/src/intervention-write";

async function main() {
  // Parse --days N from argv (default 1)
  const daysArg = process.argv.indexOf("--days");
  const days = daysArg !== -1 ? parseInt(process.argv[daysArg + 1] ?? "1", 10) : 1;

  // Budget floor in OG
  const FLOOR = Number(process.env.ZG_BALANCE_FLOOR_OG ?? 0.1);

  // Load config — throws if ZG_PRIVATE_KEY missing
  const config = loadZeroGConfig(process.env);
  console.log("Wallet:", getWalletAddress(config));

  // Create real deps ONCE (expensive — do NOT recreate per tick)
  const storage = createZeroGStorage(config);
  const brain = await createZeroGComputeBrain(config);
  const embedder = new FakeEmbedder();

  // CRITICAL: unique idgen for the whole run — persistTick uses ON CONFLICT DO NOTHING,
  // so reused ids would silently fail to insert and the event count wouldn't grow.
  const tag = Date.now().toString(36);
  let n = 0;
  const idgen = () => `${tag}-${n++}`;

  const makeTickDeps = (store: InMemoryWorldStore, day: number): TickDeps => ({
    store,
    embedder,
    memoryIndex: new MemoryIndex(store, embedder),
    reviser: new RuleBasedBeliefReviser(),
    brain,
    storage,
    explain: new ExplainabilityService(storage),
    clock: { day },
    idgen,
  });

  const repo = new WorldRepository();

  const applyWhisper = makeWhisperApplier(repo, embedder);
  const applyWorldEvent = makeWorldEventApplier(repo);
  const drain = (day: number) => drainInterventions(
    { pending: pendingInterventions, applyWhisper, applyWorldEvent, markApplied: markInterventionApplied, markFailed: markInterventionFailed },
    day);

  // Load the population for tier selection from DB
  const cs = await getPool().query("SELECT id, tier FROM citizens");
  const citizens: Ticker[] = cs.rows.map((r: { id: string; tier: number }) => ({
    id: r.id,
    tier: r.tier as 1 | 2 | 3,
  }));

  if (citizens.length === 0) {
    console.warn("No citizens found — run seed-world.ts first");
    await closePool();
    process.exit(1);
  }

  // Current day from DB
  const view = await repo.readWorldView(1);
  let day = view.day;

  const startBal = await getBalanceOG(config);
  console.log("Start balance:", startBal, "OG");

  for (let i = 0; i < days; i++) {
    const bal = await getBalanceOG(config);
    if (bal < FLOOR) {
      console.warn(`Balance ${bal} OG < floor ${FLOOR} — stopping.`);
      break;
    }
    const next = day + 1;
    const out = await runDay({ repo, makeTickDeps, citizens, drain }, next);
    day = next;
    console.log(`Day ${day} ticked: [${out.ticked.join(", ")}]`);
  }

  const endBal = await getBalanceOG(config);
  console.log(`OG spent: ${(startBal - endBal).toFixed(6)} over ${day - view.day} day(s)`);

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
