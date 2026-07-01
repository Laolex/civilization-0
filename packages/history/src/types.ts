import type { SocialDriver } from "@civ/shared";

/**
 * THE SIX PROVENANCE INVARIANTS (binding — these are the spec):
 *  #1 Authenticated cognition only. Never reconstruct/infer/estimate/fabricate cognition.
 *     Unknown cognition stays null and renders "unavailable", never a fabricated value.
 *  #2 Mutation <=> history (bidirectional). Every committed world mutation has a corresponding
 *     CognitiveTransition and vice versa, written in the SAME db transaction. No orphans.
 *  #3 Append-only. No event modified/deleted/reordered/recomputed. Corrections are new events.
 *  #4 Schema permanence. Events are read under the schemaVersion recorded at emission;
 *     readers dispatch on schemaVersion, never silently re-read under a later schema.
 *  #5 Historical Boundary. Authenticated cognitive history begins at the per-world Genesis event.
 *     Pre-boundary events are verified world-state facts only, never replayable cognition. No pre-boundary
 *     cognition may be reconstructed, inferred, synthesized, or presented as historical fact.
 *  #6 Independent Verification. Operational correctness (Proof A: events record mutations) and semantic
 *     correctness (Proof B: reductions reconstruct world state) are verified independently.
 */
export const SCHEMA_VERSION = 2 as const; // 1B: world-history events (Genesis + deltas). v1 events still read structurally.
export const CANON_VERSION = "jcs-1" as const;
export const GENESIS_PARENT = "0x" + "0".repeat(64);

export type EventId = string;
export type Hash = string; // hex sha-256

export interface EventHeader {
  eventId: EventId;
  parentHash: Hash;          // prior event in this world's chain (chronology)
  causalParents?: EventId[]; // causality — present, unused in 1A
  worldId: string;
  tickId: number;            // = day in current engine
  engineVersion: string;
  schemaVersion: number;
  timestamp: string;         // ISO
}

export interface Observation {
  query: string;
  worldHeadline?: string;
  observedEntities?: string[];
  observationHash?: string;
}

export interface ExecutionContext {
  provider: string;
  modelId: string;
  modelVersion: string;
  promptHash: string;
  worldHash: string;
  runtimeHash?: string;
  temperature?: number;
  seed?: number;
  verified: boolean;
}

export interface WorldDelta {
  relationshipsChanged: { a: string; b: string; field: string; from: number; to: number }[];
  wealthTransferred: { actor: string; delta: number }[];
  eventsCreated: { id: string; type: string; targetId: string | null }[];
}

export interface WeightedMemory { id: string; weight: number; summary?: string }
export interface WeightedBelief { id: string; weight: number; statement?: string }

// 1A: always null (Invariant #1). Shapes pinned now so the schema is stable.
export interface CandidateEvaluation { action: string; utility?: number; confidence?: number; rationale?: string }
export interface BeliefDelta { beliefId: string; before: number; after: number; justification?: string }

export interface CognitiveTransition {
  header: EventHeader;
  actor: string;
  observation: Observation;
  retrievedMemories: WeightedMemory[];
  retrievedBeliefs: WeightedBelief[];
  socialDrivers: SocialDriver[];
  availableActions: string[];
  selectedAction: string;
  reasoning: string;
  worldDelta: WorldDelta | null;
  execution: ExecutionContext;
  candidates: CandidateEvaluation[] | null; // null in 1A
  beliefDelta: BeliefDelta | null;          // null in 1A
}

export interface AnchorEvent {
  header: EventHeader;
  merkleRoot: Hash;
  coveredEventIds: EventId[];
  zgRootHash: string | null;
  zgTxHash: string | null;
}

export type HistoryKind =
  | "Genesis" | "CognitiveTransition"
  | "WealthDelta" | "RelationshipDelta" | "OrganizationDelta"
  | "Anchor";

/** Shared envelope. New (1B) events carry an explicit `kind`; v1 events omit it (read structurally). */
export interface HistoryEnvelope { kind: HistoryKind; header: EventHeader; }

/** Verified world-state facts captured at a world's historical boundary. Chain ROOT of the world. */
export interface WorldFacts {
  wealth: { actor: string; wealth: number }[];
  relationships: { a: string; b: string; trust: number; friendship: number; influence: number }[];
  organizations: { id: string; founderId: string; treasury: number; members: { citizenId: string; role: string }[] }[];
}
export interface Genesis extends HistoryEnvelope {
  kind: "Genesis";
  epochId: string;        // e.g. epoch-<worldId>-<ISO date>
  historyVersion: string; // e.g. "1b-v1"
  worldHash: Hash;        // genesisFactsHash(facts)
  facts: WorldFacts;
  capturedAt: string;     // ISO
}
export interface WealthDelta extends HistoryEnvelope {
  kind: "WealthDelta"; actor: string; delta: number; decisionId: string | null;
}
export interface RelationshipDelta extends HistoryEnvelope {
  kind: "RelationshipDelta"; a: string; b: string;
  field: "trust" | "friendship" | "influence"; delta: number; decisionId: string | null;
}
export interface OrganizationDelta extends HistoryEnvelope {
  kind: "OrganizationDelta"; op: "founded" | "member_added";
  orgId: string; founderId?: string; citizenId?: string; role?: string; decisionId: string | null;
}

export type HistoryEvent =
  | CognitiveTransition | AnchorEvent
  | Genesis | WealthDelta | RelationshipDelta | OrganizationDelta;
export type EventKind = HistoryKind;

/** Dispatch on the explicit 1B discriminant; fall back to v1 structural detection (Invariant #4). */
export function eventKind(e: HistoryEvent): HistoryKind {
  if (typeof (e as Partial<HistoryEnvelope>).kind === "string") return (e as HistoryEnvelope).kind;
  return "merkleRoot" in e ? "Anchor" : "CognitiveTransition"; // legacy v1 events
}

/** fold() output: minimal derived world state for 1A — latest authenticated transition per (world,tick,actor). */
export interface WorldState {
  latest: Map<string, CognitiveTransition>; // key = `${worldId}:${tickId}:${actor}`
}

/** What `civ explain` and the optional web view render. Null cognition -> "unavailable" (Invariant #1). */
export interface ExplainView {
  world: string;
  citizen: string;
  tick: number;
  observation: Observation;
  retrievedMemories: WeightedMemory[];
  retrievedBeliefs: WeightedBelief[];
  socialDrivers: SocialDriver[];
  availableActions: string[];
  selectedAction: string;
  reasoning: string;
  worldDelta: WorldDelta | null;
  execution: ExecutionContext;
  candidates: CandidateEvaluation[] | "unavailable";
  beliefDelta: BeliefDelta | "unavailable";
  eventHash: Hash;
  parentHash: Hash;
  chainVerified: boolean;
  anchor: { merkleRoot: Hash; zgRootHash: string | null; zgTxHash: string | null } | null;
}
