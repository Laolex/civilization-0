import {
  ALL_ACTIONS, type ActionType, type Decision, type DecisionBelief,
  type DecisionMemory, type DecisionTrace, type Memory, type WorldEvent,
} from "@civ/shared";
import type { WorldStore } from "@civ/store";
import { type Embedder, MemoryIndex } from "@civ/memory";
import type { BeliefReviser } from "@civ/beliefs";
import type { BrainProvider } from "@civ/brain";
import type { StorageProvider } from "@civ/storage";
import type { ExplainabilityService } from "@civ/explainability";

export const MAJOR_ACTIONS: ActionType[] = [
  "start_company", "partner", "betray", "hire", "quit_job", "invest",
];

const RETRIEVE_K = 5;
const MEMORY_IMPORTANCE_THRESHOLD = 4;

export interface TickDeps {
  store: WorldStore;
  embedder: Embedder;
  memoryIndex: MemoryIndex;
  reviser: BeliefReviser;
  brain: BrainProvider;
  storage: StorageProvider;
  explain: ExplainabilityService;
  clock: { day: number };
  idgen: () => string;
}

export interface TickResult {
  decision: Decision;
  event: WorldEvent;
  trace: DecisionTrace;
  storedMemory: Memory | null;
}

export async function runCitizenTick(deps: TickDeps, citizenId: string): Promise<TickResult> {
  const { store, embedder, memoryIndex, reviser, brain, storage, explain, clock, idgen } = deps;

  const citizen = store.getCitizen(citizenId);
  if (!citizen) throw new Error(`unknown citizen ${citizenId}`);
  const goal = store.getActiveGoal(citizenId) ?? null;
  const worldState = store.getWorldState();

  // 1-2. Observe + retrieve
  const query = `${goal?.description ?? ""} ${worldState.headline}`.trim();
  const memories = memoryIndex.retrieve(citizenId, query, RETRIEVE_K);
  const beliefs = store.getBeliefs(citizenId);
  const relationships = store.getRelationships(citizenId);

  // 3-4. Build context + decide
  const result = await brain.decide({
    citizen, goal, memories, beliefs, relationships, worldState, availableActions: ALL_ACTIONS,
  });

  // 5. Build the event (written to the store after its causal decision, below).
  const decisionId = idgen();
  const event: WorldEvent = {
    id: idgen(), day: clock.day, type: result.action, actorId: citizenId,
    targetId: result.targetId, decisionId, payload: {},
  };

  // 6. Record causality
  const decision: Decision = {
    id: decisionId, citizenId, goalId: goal?.id ?? null, day: clock.day,
    reasoning: result.reasoning, action: result.action, targetId: result.targetId,
    brainProvider: brain.name, brainModel: brain.model, meta: result.meta,
  };
  store.addDecision(decision);

  const dm: DecisionMemory[] = memories
    .filter((m) => m.id in result.memoryWeights)
    .map((m) => ({ decisionId, memoryId: m.id, weight: result.memoryWeights[m.id] }));
  const db: DecisionBelief[] = beliefs
    .filter((b) => b.id in result.beliefWeights)
    .map((b) => ({ decisionId, beliefId: b.id, weight: result.beliefWeights[b.id] }));
  store.addDecisionMemories(dm);
  store.addDecisionBeliefs(db);
  // Write the event only after its causal decision + joins exist, so no observer
  // can ever see an event without the decision that produced it.
  store.addEvent(event);

  // 7. Build + archive trace
  const usedBeliefs = beliefs.filter((b) => b.id in result.beliefWeights);
  const trace = await explain.buildAndArchive({
    id: idgen(), decision, goal, memories, beliefs: usedBeliefs, event,
  });
  store.addTrace(trace);

  // 8. Form memory
  const summary = `${citizen.name} chose to ${result.action}` +
    (result.targetId ? ` with ${result.targetId}` : "") + `: ${result.reasoning}`;
  const importance = MAJOR_ACTIONS.includes(result.action) ? 8 : 4;
  let storedMemory: Memory | null = null;
  if (importance >= MEMORY_IMPORTANCE_THRESHOLD) {
    storedMemory = {
      id: idgen(), citizenId, day: clock.day,
      type: result.targetId ? "relationship" : "event",
      importance, summary, embedding: embedder.embed(summary),
    };
    store.addMemory(storedMemory);
  }

  // 9. Belief revision (toward the action target). Action targets are citizens,
  // so we revise toward the citizen's display name; the raw id is only a
  // fallback for an unknown/non-citizen target.
  if (storedMemory && result.targetId) {
    const target = store.getCitizen(result.targetId);
    const rev = reviser.revise({
      citizenId, newMemory: storedMemory, existing: store.getBeliefs(citizenId),
      targetName: target?.name ?? result.targetId, polarity: result.action === "betray" ? -1 : 1,
      day: clock.day, idgen,
    });
    for (const b of [...rev.created, ...rev.updated]) store.upsertBelief(b);
  }

  // 10. Archive major event
  if (MAJOR_ACTIONS.includes(result.action)) {
    const res = await storage.archive(`event/${event.id}`, event);
    store.updateEventArchive(event.id, res.rootHash, res.txHash);
  }

  return { decision, event, trace, storedMemory };
}
