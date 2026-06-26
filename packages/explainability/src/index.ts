import type { Belief, Decision, DecisionTrace, Goal, Memory, WorldEvent } from "@civ/shared";
import type { StorageProvider } from "@civ/storage";

export interface TraceDrivers {
  memories: { id: string; weight: number }[];
  beliefs: { id: string; weight: number }[];
  socialDrivers?: { id: string; name: string; relationshipStrength: number; relevance: number; blendedScore: number }[];
  orgDriver?: { id: string; name: string; action?: string; reasoning?: string };
}

export interface BuildTraceArgs {
  id: string;
  decision: Decision;
  goal: Goal | null;
  memories: Memory[];
  beliefs: Belief[];
  event: WorldEvent;
  /** Salience weights from the decision joins; falls back to derived weights. */
  drivers?: TraceDrivers;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

export class ExplainabilityService {
  constructor(private readonly storage: StorageProvider) {}

  async buildAndArchive(args: BuildTraceArgs): Promise<DecisionTrace> {
    const { id, decision, goal, memories, beliefs, event, drivers } = args;
    const trace: DecisionTrace = {
      id,
      decisionId: decision.id,
      trace: {
        decision: decision.action,
        goal: goal ? goal.description : null,
        retrievedMemories: memories.map((m) => m.id),
        beliefs: beliefs.map((b) => b.statement),
        reasoning: decision.reasoning,
        eventId: event.id,
        meta: decision.meta,
      },
    };

    // Archive a self-describing civ.provenance/v0 record — the exact envelope
    // the keyless verifier recovers from 0G Storage by root hash. (The raw
    // trace.trace lacks `schema`, so verification rejected it.)
    const record = {
      schema: "civ.provenance/v0" as const,
      agent: decision.citizenId,
      question: goal?.description ?? `What should ${decision.citizenId} do next?`,
      decision: {
        action: decision.action,
        targetId: decision.targetId,
        reasoning: decision.reasoning,
      },
      drivers: drivers ?? {
        memories: memories.map((m) => ({ id: m.id, weight: round2((m.importance ?? 5) / 10) })),
        beliefs: beliefs.map((b) => ({ id: b.id, weight: round2(b.confidence ?? 0.5) })),
      },
      meta: decision.meta,
    };
    const res = await this.storage.archive(`trace/${decision.id}`, record);
    trace.zgRootHash = res.rootHash;
    trace.zgTxHash = res.txHash;
    return trace;
  }
}
