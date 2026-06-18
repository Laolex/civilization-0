export type Tier = 1 | 2 | 3;

export type ActionType =
  | "meet" | "friend" | "argue" | "hire" | "quit_job"
  | "start_company" | "partner" | "betray" | "invest" | "work";

export const ALL_ACTIONS: ActionType[] = [
  "meet", "friend", "argue", "hire", "quit_job",
  "start_company", "partner", "betray", "invest", "work",
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
  importance: number; summary: string; embedding: number[];
  zgRootHash?: string; zgTxHash?: string;
}

export interface Belief {
  id: string; citizenId: string; statement: string; confidence: number;
  sourceMemoryIds: string[]; updatedDay: number;
}

export interface Decision {
  id: string; citizenId: string; goalId: string | null; day: number;
  reasoning: string; action: ActionType; targetId: string | null;
  brainProvider: string; brainModel: string;
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
  };
  zgRootHash?: string; zgTxHash?: string;
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
