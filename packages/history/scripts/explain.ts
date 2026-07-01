import { getPool, closePool } from "@civ/persistence";
import { buildExplainView } from "../src/explainView";

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const citizen = arg("citizen");
  const tick = arg("tick");
  const world = arg("world") ?? "default";
  if (!citizen || !tick) {
    console.error("usage: tsx scripts/explain.ts --citizen <id> --tick <day> [--world <id>]");
    process.exit(2);
  }
  const view = await buildExplainView(getPool(), world, citizen, Number(tick));
  if (view && "refused" in view) {
    console.log(`Historical replay unavailable.\nAuthenticated history begins: ${view.epochId}`);
    process.exit(0);
  }
  if (!view) {
    console.error(`no authenticated transition for citizen=${citizen} tick=${tick} world=${world}`);
    process.exit(1);
  }
  const line = (l: string) => console.log(l);
  line(`\n══ civ explain — citizen ${view.citizen} · tick ${view.tick} · world ${view.world} ══`);
  line(`chain verified : ${view.chainVerified ? "✓" : "✗ BROKEN"}   event ${view.eventHash.slice(0, 12)}…`);
  line(`anchor         : ${view.anchor ? `0G ${view.anchor.zgTxHash ?? "(pending)"}` : "unanchored"}`);
  line(`\n① observe      : ${view.observation.query}`);
  line(`② retrieve     : ${view.retrievedMemories.length} memories, ${view.retrievedBeliefs.length} beliefs`);
  line(`③ social       : ${view.socialDrivers.map((s) => `${s.name}(${s.blendedScore.toFixed(2)})`).join(", ") || "none"}`);
  line(`④ candidates   : ${view.candidates === "unavailable" ? "unavailable" : view.candidates.map((c) => c.action).join(", ")}`);
  line(`⑤ choose       : ${view.selectedAction}   (from: ${view.availableActions.join(", ")})`);
  line(`⑥ reasoning    : ${view.reasoning}`);
  line(`⑦ beliefΔ      : ${view.beliefDelta === "unavailable" ? "unavailable" : JSON.stringify(view.beliefDelta)}`);
  line(`⑧ outcome      : ${view.worldDelta ? `${view.worldDelta.eventsCreated.length} event(s)` : "none"}`);
  line(`⑨ execution    : ${view.execution.provider}/${view.execution.modelId}  verified=${view.execution.verified}`);
  await closePool();
}
main().catch((e) => { console.error(e); process.exit(1); });
