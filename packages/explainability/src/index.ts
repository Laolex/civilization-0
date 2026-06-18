import type { Belief, Decision, DecisionTrace, Goal, Memory, WorldEvent } from "@civ/shared";
import type { StorageProvider } from "@civ/storage";

export interface BuildTraceArgs {
  id: string;
  decision: Decision;
  goal: Goal | null;
  memories: Memory[];
  beliefs: Belief[];
  event: WorldEvent;
}

export class ExplainabilityService {
  constructor(private readonly storage: StorageProvider) {}

  async buildAndArchive(args: BuildTraceArgs): Promise<DecisionTrace> {
    const { id, decision, goal, memories, beliefs, event } = args;
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
    const res = await this.storage.archive(`trace/${decision.id}`, trace.trace);
    trace.zgRootHash = res.rootHash;
    trace.zgTxHash = res.txHash;
    return trace;
  }
}
