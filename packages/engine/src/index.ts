import {
  ALL_ACTIONS, type ActionType, type Decision, type DecisionBelief,
  type DecisionMemory, type DecisionTrace, type Memory, type WorldEvent,
} from "@civ/shared";
import type { WorldStore } from "@civ/store";
import { type Embedder, MemoryIndex, GraphRetriever } from "@civ/memory";
import type { BeliefReviser } from "@civ/beliefs";
import type { BrainProvider } from "@civ/brain";
import type { StorageProvider } from "@civ/storage";
import type { ExplainabilityService } from "@civ/explainability";

function dedupeById<T extends { id: string }>(items: T[]): T[] {
  const seen = new Set<string>();
  return items.filter((m) => (seen.has(m.id) ? false : (seen.add(m.id), true)));
}

export const MAJOR_ACTIONS: ActionType[] = [
  "start_company", "partner", "betray", "hire", "quit_job", "invest",
];

const RETRIEVE_K = 5;
const envNum = (v: string | undefined, d: number) => { const n = Number(v ?? d); return Number.isFinite(n) ? n : d; };
const NEIGHBOR_K = envNum(process.env.NEIGHBOR_K, 3);
const MEMORY_IMPORTANCE_THRESHOLD = 4;
const r2 = (n: number) => Math.round(n * 100) / 100;

export interface TickDeps {
  store: WorldStore;
  embedder: Embedder;
  memoryIndex: MemoryIndex;
  graphRetriever?: GraphRetriever;
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
  consumedPins: string[];
  consumedDilemma: boolean;
}

export async function runCitizenTick(deps: TickDeps, citizenId: string): Promise<TickResult> {
  const { store, embedder, memoryIndex, graphRetriever, reviser, brain, storage, explain, clock, idgen } = deps;

  const citizen = store.getCitizen(citizenId);
  if (!citizen) throw new Error(`unknown citizen ${citizenId}`);
  const goal = store.getActiveGoal(citizenId) ?? null;
  const worldState = store.getWorldState();

  // 1-2. Observe + retrieve
  const query = `${goal?.description ?? ""} ${worldState.headline}`.trim();
  const retrieved = memoryIndex.retrieve(citizenId, query, RETRIEVE_K);
  const pinned = store.getPinnedMemories(citizenId);
  const memories = dedupeById([...pinned, ...retrieved]);
  const beliefs = store.getBeliefs(citizenId);
  const relationships = store.getRelationships(citizenId);
  const neighbors = graphRetriever
    ? graphRetriever.selectNeighbors(store.getNeighborCandidates(citizenId), query, NEIGHBOR_K)
    : [];
  const orgContext = store.getOrgContext(citizenId);

  // GraphRAG drivers, computed once and written to BOTH decision.meta (fast UI mirror)
  // and the 0G trace (canonical, verifiable copy).
  const socialDrivers = neighbors.map((n) => ({
    id: n.summary.id, name: n.summary.name,
    relationshipStrength: r2(n.relationshipStrength),
    relevance: r2(n.relevance), blendedScore: r2(n.blendedScore),
    trust: n.summary.relationship.trust,
    influence: n.summary.relationship.influence,
    neighborText: n.neighborText,
  }));
  const orgDriver = orgContext
    ? { id: orgContext.id, name: orgContext.name, action: orgContext.latestAction, reasoning: orgContext.latestReasoning }
    : undefined;
  const socialQuery = neighbors.length ? query : undefined;

  // 3-4. Build context + decide. A queued dilemma narrows the choice set for
  // this one tick; the brain honors it at both the prompt and the parse layer.
  const forced = store.getForcedActions(citizenId);
  const result = await brain.decide({
    citizen, goal, memories, beliefs, relationships, worldState,
    availableActions: forced ?? ALL_ACTIONS, neighbors, orgContext,
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
    brainProvider: brain.name, brainModel: brain.model,
    meta: { ...result.meta, ...(socialDrivers.length ? { socialDrivers, socialQuery } : {}), ...(orgDriver ? { orgDriver } : {}) },
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
    drivers: {
      memories: dm.map((d) => ({ id: d.memoryId, weight: d.weight })),
      beliefs: db.map((d) => ({ id: d.beliefId, weight: d.weight })),
      socialDrivers,
      socialQuery,
      orgDriver,
    },
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

  const consumedPins = pinned.map((m) => m.id);
  for (const id of consumedPins) store.clearPin(id);

  return { decision, event, trace, storedMemory, consumedPins, consumedDilemma: forced != null };
}
