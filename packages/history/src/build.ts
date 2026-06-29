import type { Decision, WorldEvent } from "@civ/shared";
import {
  SCHEMA_VERSION, type CognitiveTransition, type Hash,
  type WeightedMemory, type WeightedBelief,
} from "./types";

export interface BuildArgs {
  result: {
    decision: Decision;
    event: WorldEvent;
    observation: { query: string; worldHeadline?: string };
    availableActions: string[];
  };
  worldId: string;
  engineVersion: string;
  timestamp: string;
  parentHash: Hash; // append() overwrites with the real tip; callers pass GENESIS_PARENT
  newEventId: () => string;
  retrievedMemories: WeightedMemory[];
  retrievedBeliefs: WeightedBelief[];
}

/**
 * Assemble a CognitiveTransition from authenticated runtime output only (Invariant #1).
 * candidates/beliefDelta stay null — they are NOT produced by the runtime in 1A and must
 * never be inferred. worldDelta records the created event; wealth/relationship mutations
 * happen outside the persist transaction (in the scheduler loop), so they are honestly [].
 */
export function buildCognitiveTransition(args: BuildArgs): CognitiveTransition {
  const { result } = args;
  const d = result.decision;
  const meta = d.meta;
  return {
    header: {
      eventId: args.newEventId(),
      parentHash: args.parentHash,
      worldId: args.worldId,
      tickId: d.day,
      engineVersion: args.engineVersion,
      schemaVersion: SCHEMA_VERSION,
      timestamp: args.timestamp,
    },
    actor: d.citizenId,
    observation: { query: result.observation.query, worldHeadline: result.observation.worldHeadline },
    retrievedMemories: args.retrievedMemories,
    retrievedBeliefs: args.retrievedBeliefs,
    socialDrivers: meta?.socialDrivers ?? [],
    availableActions: result.availableActions,
    selectedAction: d.action,
    reasoning: d.reasoning,
    worldDelta: {
      relationshipsChanged: [],
      wealthTransferred: [],
      eventsCreated: [{ id: result.event.id, type: result.event.type, targetId: result.event.targetId }],
    },
    execution: {
      provider: meta?.provider ?? d.brainProvider,
      modelId: meta?.model ?? d.brainModel,
      modelVersion: meta?.model ?? d.brainModel,
      promptHash: "",
      worldHash: "",
      verified: meta?.verified ?? false,
    },
    candidates: null,
    beliefDelta: null,
  };
}
