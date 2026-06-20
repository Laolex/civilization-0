import { loadZeroGConfig } from "@civ/zerog/src/config";
import { createZeroGStorage } from "@civ/zerog/src/real-uploader";
import { createZeroGComputeBrain } from "@civ/zerog/src/real-chat";
import { getBalanceOG, getWalletAddress } from "@civ/zerog/src/wallet";
import { OrgRepository, getPool, closePool } from "@civ/persistence";
import { ExplainabilityService } from "@civ/explainability";
import { runOrgTick } from "../src/org-tick";

// LIVE org-as-agent runnable: one organization makes a strategic decision reasoned
// on real 0G compute, archived to 0G storage, keyless-verifiable at /verify/<root>.
// Spends OG. Logs wallet ADDRESS + balances only — NEVER the private key.
async function main() {
  const FLOOR = Number(process.env.ZG_BALANCE_FLOOR_OG ?? 0.1);
  const config = loadZeroGConfig(process.env); // throws if ZG_PRIVATE_KEY missing
  console.log("Wallet:", getWalletAddress(config));

  // Choose org: --org <id>, else the first org in the DB.
  const orgArg = process.argv.indexOf("--org");
  const repo = new OrgRepository();
  let orgId = orgArg !== -1 ? process.argv[orgArg + 1] : undefined;
  if (!orgId) {
    const r = await getPool().query("SELECT id FROM organizations ORDER BY created_day, id LIMIT 1");
    orgId = r.rows[0]?.id as string | undefined;
  }
  if (!orgId) {
    console.warn("No orgs found — run seed-orgs.ts first");
    await closePool();
    process.exit(1);
  }

  const ctx = await repo.loadOrgContext(orgId);
  if (!ctx) {
    console.warn(`Org ${orgId} not found`);
    await closePool();
    process.exit(1);
  }

  const startBal = await getBalanceOG(config);
  console.log("Start balance:", startBal, "OG");
  if (startBal < FLOOR) {
    console.warn(`Balance ${startBal} OG < floor ${FLOOR} — stopping (no spend).`);
    await closePool();
    process.exit(1);
  }

  // Real deps created ONCE (expensive).
  const storage = createZeroGStorage(config);
  const brain = await createZeroGComputeBrain(config);
  const explain = new ExplainabilityService(storage);
  const tag = Date.now().toString(36);
  let n = 0;
  const idgen = () => `org-${tag}-${n++}`;

  // Current world day (fallback: org's age start).
  const ws = await getPool().query("SELECT day FROM world_state WHERE id = 1");
  const day = (ws.rows[0]?.day ?? ctx.org.createdDay) as number;

  const result = await runOrgTick(ctx, { brain, storage, explain, clock: { day }, idgen });
  await repo.persistOrgTick(orgId, result.event, result.trace, 0);

  const endBal = await getBalanceOG(config);
  const root = result.trace.zgRootHash ?? result.event.zgRootHash ?? "";
  console.log("Org:", orgId, `(${ctx.org.name})`);
  console.log("Day:", day, "Members:", ctx.members.length);
  console.log("Action:", result.action, "→", result.targetId ?? "(none)");
  console.log("Reasoning:", result.reasoning);
  console.log("0G verified:", result.trace.trace.meta?.verified ?? "(n/a)");
  console.log("Archived root hash:", root || "(none)");
  console.log("Verify at: /verify/" + root);
  console.log(`OG spent: ${(startBal - endBal).toFixed(6)}`);

  await closePool();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
