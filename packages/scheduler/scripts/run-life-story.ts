import { loadZeroGConfig } from "@civ/zerog/src/config";
import { getBalanceOG, getWalletAddress } from "@civ/zerog/src/wallet";
import { RealChat } from "@civ/zerog/src/real-chat";
import { createZeroGStorage } from "@civ/zerog/src/real-uploader";
import { getPool, closePool, NarrativeRepository, searchEvents } from "@civ/persistence";

// LIVE: narrate a citizen's life on real 0G Compute, archive to 0G Storage,
// persist into narratives. Logs wallet ADDRESS + balances only — never the key.
async function main() {
  const FLOOR = Number(process.env.ZG_BALANCE_FLOOR_OG ?? 0.1);
  const config = loadZeroGConfig(process.env);
  console.log("Wallet:", getWalletAddress(config));

  const idArg = process.argv.indexOf("--citizen");
  const citizenId = idArg !== -1 ? process.argv[idArg + 1] : "ada";

  const c = await getPool().query("SELECT name, occupation FROM citizens WHERE id = $1", [citizenId]);
  if (!c.rows[0]) { console.warn(`Citizen ${citizenId} not found — seed-world first`); await closePool(); process.exit(1); }
  const events = await searchEvents(getPool(), { actorId: citizenId, limit: 50 });

  const startBal = await getBalanceOG(config);
  console.log("Start balance:", startBal, "OG");
  if (startBal < FLOOR) { console.warn(`Balance ${startBal} < floor ${FLOOR} — stopping (no spend).`); await closePool(); process.exit(1); }

  const facts = events.map((e) => `day ${e.day}: ${e.type}${e.targetId ? " " + e.targetId : ""}${e.reasoning ? ` (${e.reasoning})` : ""}`).join("; ");
  const chat = await RealChat.create(config);
  const result = await chat.complete([
    { role: "system", content: "You are a historian. Narrate the citizen's life in 3-5 vivid, factual sentences. Use only the provided events. No preamble." },
    { role: "user", content: `Citizen ${c.rows[0].name}, a ${c.rows[0].occupation}. Events: ${facts || "(none yet)"}.` },
  ]);

  const storage = createZeroGStorage(config);
  const day = events[0]?.day ?? 0;
  const id = `life-${citizenId}-${Date.now().toString(36)}`;
  const archive = await storage.archive(`narrative/${id}`, {
    schema: "civ.narrative/v0", subjectId: citizenId, kind: "life_story", day, text: result.content,
  });
  await new NarrativeRepository().saveNarrative({
    id, subjectId: citizenId, kind: "life_story", day, text: result.content,
    rootHash: archive.rootHash, txHash: archive.txHash,
  });

  const endBal = await getBalanceOG(config);
  console.log("Citizen:", citizenId, `(${c.rows[0].name})`);
  console.log("0G verified:", result.verified ?? "(n/a)");
  console.log("Narrative:", result.content);
  console.log("Archived root hash:", archive.rootHash);
  console.log("Verify at: /verify/" + archive.rootHash);
  console.log(`OG spent: ${(startBal - endBal).toFixed(6)}`);
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
