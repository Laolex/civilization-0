/**
 * Verify Opik tracing end-to-end WITHOUT spending any 0G compute.
 *
 * Runs one decision through the real tracing decorators (instrumentBrain +
 * instrumentChat) backed by a fake LLM, then flushes. If OPIK_API_KEY is set in
 * .env you should see a `decide: Ada` trace with a nested `llm` span appear in
 * your Comet/Opik project.
 *
 *   pnpm --filter @civ/zerog exec tsx scripts/smoke-opik.ts
 */
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
loadDotenv({ path: resolve(import.meta.dirname, "../../../.env") });

import type { DecisionContext } from "@civ/brain";
import { ZeroGComputeBrain, type Chat, type ChatMessage, type ChatResult } from "../src/brain";
import { instrumentBrain, instrumentChat, getOpikClient, flushOpik } from "../src/opik-tracing";

class FakeChat implements Chat {
  calls = 0;
  constructor(private replies: string[]) {}
  async complete(_m: ChatMessage[]): Promise<ChatResult> {
    const content = this.replies[Math.min(this.calls, this.replies.length - 1)];
    this.calls++;
    return { content, provider: "0xfake", model: "fake-llm-v0", requestId: `req-${this.calls}`,
      verified: true, usage: { prompt_tokens: 120, completion_tokens: 24, total_tokens: 144 } };
  }
}

const ctx: DecisionContext = {
  citizen: { id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 },
  goal: { id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true },
  memories: [{ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job during recession", embedding: [] }],
  beliefs: [{ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.8, sourceMemoryIds: ["m1"], updatedDay: 2 }],
  relationships: [], worldState: { day: 3, economy: { inflation: 8 }, headline: "Recession deepens" },
  availableActions: ["work", "start_company"],
};

async function main() {
  const enabled = getOpikClient() !== null;
  console.log(enabled
    ? "Opik configured — sending one traced decision to your project…\n"
    : "OPIK_API_KEY not set — tracing is a no-op. Set it in .env to send traces.\n");

  // First reply is garbage to exercise the JSON-repair retry (two llm spans).
  const chat = instrumentChat(new FakeChat(["not json", '{"action":"start_company","targetId":"marcus","reasoning":"take the funding and build","memoryWeights":{"m1":0.9},"beliefWeights":{"b1":0.8}}']));
  const brain = instrumentBrain(new ZeroGComputeBrain(chat, "fake-llm-v0"));

  const decision = await brain.decide(ctx);
  console.log("Decision:", JSON.stringify(decision, null, 2));

  await flushOpik();
  console.log(enabled
    ? "\nFlushed. Open your Opik project — look for trace 'decide: Ada' with 2 llm spans (one is the repair)."
    : "\nDone (no traces sent).");
}

main().catch((err) => { console.error(err); process.exit(1); });
