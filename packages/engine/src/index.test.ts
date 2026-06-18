import { describe, it, expect } from "vitest";
import { InMemoryWorldStore } from "@civ/store";
import { FakeEmbedder, MemoryIndex } from "@civ/memory";
import { RuleBasedBeliefReviser } from "@civ/beliefs";
import { FakeBrain } from "@civ/brain";
import { FakeStorage } from "@civ/storage";
import { ExplainabilityService } from "@civ/explainability";
import { runCitizenTick, type TickDeps } from "./index";

function setup() {
  const store = new InMemoryWorldStore();
  const embedder = new FakeEmbedder();
  store.upsertCitizen({ id: "ada", name: "Ada", occupation: "Engineer", age: 29,
    traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
    wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
  // The action target is a real citizen, so belief revision uses target.name ("Marcus").
  store.upsertCitizen({ id: "marcus", name: "Marcus", occupation: "Investor", age: 41,
    traits: { ambition: 70, empathy: 60, loyalty: 65, curiosity: 50, discipline: 70, riskTolerance: 60 },
    wealth: 100000, reputation: 70, tier: 2, createdDay: 0 });
  store.upsertGoal({ id: "g1", citizenId: "ada", kind: "wealth", description: "financial independence", progress: 0.1, active: true });
  store.addMemory({ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job during recession", embedding: embedder.embed("lost job during recession") });
  store.upsertBelief({ id: "b1", citizenId: "ada", statement: "Marcus is trustworthy", confidence: 0.7, sourceMemoryIds: ["m0"], updatedDay: 2 });
  store.setWorldState({ day: 5, economy: { inflation: 8 }, headline: "Recession deepens" });

  let n = 0;
  const idgen = () => `id${++n}`;
  const brain = new FakeBrain((ctx) => ({
    action: "start_company", targetId: "marcus",
    reasoning: "I lost my job and I trust Marcus's funding offer",
    memoryWeights: Object.fromEntries(ctx.memories.map((m) => [m.id, 1])),
    beliefWeights: Object.fromEntries(ctx.beliefs.map((b) => [b.id, b.confidence])),
  }));
  const storage = new FakeStorage();
  const deps: TickDeps = {
    store, embedder, memoryIndex: new MemoryIndex(store, embedder),
    reviser: new RuleBasedBeliefReviser(), brain, storage,
    explain: new ExplainabilityService(storage),
    clock: { day: 5 }, idgen,
  };
  return { store, storage, deps };
}

describe("runCitizenTick", () => {
  it("produces the full causality chain", async () => {
    const { store, storage, deps } = setup();
    const result = await runCitizenTick(deps, "ada");

    // decision recorded with provider identity
    expect(result.decision.action).toBe("start_company");
    expect(result.decision.brainProvider).toBe("fake");

    // decision_memories + decision_beliefs joins reference the retrieved inputs
    const dm = store.getDecisionMemories(result.decision.id);
    const db = store.getDecisionBeliefs(result.decision.id);
    expect(dm.map((r) => r.memoryId)).toContain("m1");
    expect(db.map((r) => r.beliefId)).toContain("b1");

    // event created and linked to the decision
    expect(result.event.decisionId).toBe(result.decision.id);

    // trace archived to storage with a hash
    expect(result.trace.zgRootHash).toMatch(/^0xfake/);
    expect(store.getTrace(result.decision.id)?.zgRootHash).toBe(result.trace.zgRootHash);

    // major event archived to storage
    const archivedEvent = store.getEvent(result.event.id);
    expect(archivedEvent?.zgRootHash).toMatch(/^0xfake/);

    // a new memory formed and a belief about Marcus strengthened
    expect(result.storedMemory).not.toBeNull();
    const marcusBelief = store.getBeliefs("ada").find((b) => b.statement === "Marcus is trustworthy");
    expect(marcusBelief!.confidence).toBeGreaterThan(0.7);
  });

  it("archives a trace for every decision (the 'why' is always durable)", async () => {
    const { storage, deps } = setup();
    await runCitizenTick(deps, "ada");
    expect(storage.calls.some((c) => c.key.startsWith("trace/"))).toBe(true);
  });

  it("records only the brain-weighted inputs as the cause, excluding merely-retrieved ones", async () => {
    const store = new InMemoryWorldStore();
    const embedder = new FakeEmbedder();
    store.upsertCitizen({ id: "ada", name: "Ada", occupation: "Engineer", age: 29,
      traits: { ambition: 90, empathy: 40, loyalty: 30, curiosity: 80, discipline: 80, riskTolerance: 75 },
      wealth: 0, reputation: 50, tier: 3, createdDay: 0 });
    store.upsertGoal({ id: "g1", citizenId: "ada", kind: "wealth", description: "funding for a company in a recession", progress: 0.1, active: true });
    // Two memories — both are retrieved into the decision context...
    store.addMemory({ id: "m1", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "lost job during recession", embedding: embedder.embed("lost job during recession") });
    store.addMemory({ id: "m2", citizenId: "ada", day: 1, type: "event", importance: 8, summary: "marcus offered funding for a company", embedding: embedder.embed("marcus offered funding for a company") });
    store.setWorldState({ day: 5, economy: {}, headline: "recession" });

    let n = 0;
    // ...but the brain weights ONLY m2, and weights no beliefs at all.
    const brain = new FakeBrain(() => ({
      action: "work", targetId: null,
      reasoning: "only the funding memory drove this",
      memoryWeights: { m2: 1 },
      beliefWeights: {},
    }));
    const storage = new FakeStorage();
    const deps: TickDeps = {
      store, embedder, memoryIndex: new MemoryIndex(store, embedder),
      reviser: new RuleBasedBeliefReviser(), brain, storage,
      explain: new ExplainabilityService(storage),
      clock: { day: 5 }, idgen: () => `id${++n}`,
    };
    const result = await runCitizenTick(deps, "ada");

    const dmIds = store.getDecisionMemories(result.decision.id).map((r) => r.memoryId);
    expect(dmIds).toContain("m2");      // the weighted memory is recorded as the cause
    expect(dmIds).not.toContain("m1");  // a merely-retrieved memory is NOT recorded as cause
    // No belief drove the decision, so the belief join is legitimately empty.
    expect(store.getDecisionBeliefs(result.decision.id)).toHaveLength(0);
  });
});
