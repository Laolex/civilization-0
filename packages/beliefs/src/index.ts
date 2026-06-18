import type { Belief, Memory } from "@civ/shared";

export interface BeliefInput {
  citizenId: string;
  newMemory: Memory;
  existing: Belief[];
  targetName: string | null;
  polarity: 1 | -1;
  day: number;
  idgen: () => string;
}

export interface BeliefRevision { created: Belief[]; updated: Belief[]; }

export interface BeliefReviser { revise(input: BeliefInput): BeliefRevision; }

function clamp01(n: number): number { return Math.max(0, Math.min(1, n)); }

export class RuleBasedBeliefReviser implements BeliefReviser {
  revise(input: BeliefInput): BeliefRevision {
    const { targetName, polarity, existing, newMemory, citizenId, day, idgen } = input;
    if (!targetName) return { created: [], updated: [] };

    const statement = polarity > 0 ? `${targetName} is trustworthy` : `${targetName} is untrustworthy`;
    const match = existing.find((b) => b.statement === statement);
    const delta = 0.15 * polarity;

    if (match) {
      const updated: Belief = {
        ...match,
        confidence: clamp01(match.confidence + delta),
        sourceMemoryIds: match.sourceMemoryIds.includes(newMemory.id)
          ? match.sourceMemoryIds
          : [...match.sourceMemoryIds, newMemory.id],
        updatedDay: day,
      };
      return { created: [], updated: [updated] };
    }

    const created: Belief = {
      id: idgen(), citizenId, statement,
      confidence: clamp01(0.5 + delta),
      sourceMemoryIds: [newMemory.id], updatedDay: day,
    };
    return { created: [created], updated: [] };
  }
}
