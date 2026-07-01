import type { CognitiveTransition, ExplainView, Hash } from "./types";

export interface ProjectInput {
  transition: CognitiveTransition;
  eventHash: Hash;
  parentHash: Hash;
  chainVerified: boolean;
  anchor: { merkleRoot: Hash; zgRootHash: string | null; zgTxHash: string | null } | null;
}

export function project(input: ProjectInput, mode: "explain"): ExplainView {
  if (mode !== "explain") throw new Error("replay projection is Phase 2 (world reconstruction over the same fold)");
  const t = input.transition;
  return {
    world: t.header.worldId,
    citizen: t.actor,
    tick: t.header.tickId,
    observation: t.observation,
    retrievedMemories: t.retrievedMemories,
    retrievedBeliefs: t.retrievedBeliefs,
    socialDrivers: t.socialDrivers,
    availableActions: t.availableActions,
    selectedAction: t.selectedAction,
    reasoning: t.reasoning,
    worldDelta: t.worldDelta,
    execution: t.execution,
    candidates: t.candidates ?? "unavailable",   // Invariant #1: null -> unavailable, never fabricated
    beliefDelta: t.beliefDelta ?? "unavailable",
    eventHash: input.eventHash,
    parentHash: input.parentHash,
    chainVerified: input.chainVerified,
    anchor: input.anchor,
  };
}
