export type Tier = 1 | 2 | 3;

export type ActionType =
  | "meet" | "friend" | "argue" | "hire" | "quit_job"
  | "start_company" | "partner" | "betray" | "invest" | "work"
  | "create_org" | "join" | "leave";

export const ALL_ACTIONS: ActionType[] = [
  "meet", "friend", "argue", "hire", "quit_job",
  "start_company", "partner", "betray", "invest", "work",
  "create_org", "join", "leave",
];

export type MemoryType = "event" | "relationship" | "goal" | "observation";

export interface Traits {
  ambition: number; empathy: number; loyalty: number;
  curiosity: number; discipline: number; riskTolerance: number;
}

export interface Citizen {
  id: string; name: string; occupation: string; age: number;
  traits: Traits; wealth: number; reputation: number; tier: Tier; createdDay: number;
}

export interface Goal {
  id: string; citizenId: string; kind: string; description: string;
  progress: number; active: boolean;
}

export interface Relationship {
  citizenId: string; otherId: string; trust: number; friendship: number; influence: number;
}

export interface Memory {
  id: string; citizenId: string; day: number; type: MemoryType;
  importance: number; summary: string; embedding: number[]; pinned?: boolean;
  zgRootHash?: string; zgTxHash?: string;
}

export interface Belief {
  id: string; citizenId: string; statement: string; confidence: number;
  sourceMemoryIds: string[]; updatedDay: number;
}

export interface ExecutionMeta {
  provider: string;
  model: string;
  requestId?: string;
  verified?: boolean;
  verification?: unknown;
}

export interface Decision {
  id: string; citizenId: string; goalId: string | null; day: number;
  reasoning: string; action: ActionType; targetId: string | null;
  brainProvider: string; brainModel: string;
  meta?: ExecutionMeta;
}

export interface DecisionMemory { decisionId: string; memoryId: string; weight: number; }
export interface DecisionBelief { decisionId: string; beliefId: string; weight: number; }

export interface WorldEvent {
  id: string; day: number; type: ActionType; actorId: string; targetId: string | null;
  decisionId: string | null; payload: Record<string, unknown>;
  zgRootHash?: string; zgTxHash?: string;
}

export interface DecisionTrace {
  id: string; decisionId: string;
  trace: {
    decision: ActionType; goal: string | null; retrievedMemories: string[];
    beliefs: string[]; reasoning: string; eventId: string;
    meta?: ExecutionMeta;
  };
  zgRootHash?: string; zgTxHash?: string;
}

export type OrgKind = "guild" | "company" | "council";
export type OrgRole = "founder" | "leader" | "member";
export interface Organization {
  id: string; name: string; kind: OrgKind; founderId: string;
  treasury: number; reputation: number; goal: string; createdDay: number;
}
export interface Membership { orgId: string; citizenId: string; role: OrgRole; joinedDay: number; }

export interface NeighborSummary {
  id: string;
  name: string;
  relationship: { trust: number; friendship: number; influence: number };
  latestAction?: ActionType;
  latestReasoning?: string;
  topGoal?: string;
  strongestBelief?: string;
  wealth: number;
  reputation: number;
}

export interface ScoredNeighbor {
  summary: NeighborSummary;
  relationshipStrength: number; // 0..1 (normalized from the 0..100 trust+influence)
  relevance: number;            // RELEVANCE_FLOOR..1
  blendedScore: number;         // relationshipStrength * relevance
  /** The exact string fed to the embedder for relevance scoring — kept so a
   *  third party can recompute relevance = clamp(cosine(embed(neighborText), embed(socialQuery))). */
  neighborText: string;
}

export interface OrgContext {
  id: string;
  name: string;
  kind: OrgKind;
  latestAction?: ActionType;
  latestReasoning?: string;
}

export interface WorldState {
  day: number; economy: Record<string, number>; headline: string;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error(`cosineSimilarity: length mismatch ${a.length} vs ${b.length}`);
  }
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

export interface WorldSnapshot {
  capturedAt: string;
  citizens: Citizen[];
  goals: Goal[];
  relationships: Relationship[];
  memories: Memory[];
  beliefs: Belief[];
  decisions: Decision[];
  decisionMemories: DecisionMemory[];
  decisionBeliefs: DecisionBelief[];
  events: WorldEvent[];
  traces: DecisionTrace[];
  worldState: WorldState;
}

/** Return a copy of the snapshot with every memory embedding emptied —
 *  64-float vectors are render-noise for the UI and bloat world.json. */
export function stripEmbeddings(s: WorldSnapshot): WorldSnapshot {
  return { ...s, memories: s.memories.map((m) => ({ ...m, embedding: [] })) };
}
