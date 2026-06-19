import type { ActionType } from "@civ/shared";
import type { BrainProvider, DecisionContext } from "@civ/brain";
import type { StorageProvider } from "@civ/storage";
import type {
  ProvenanceDecision, ProvenanceRecord, TraceDrivers, TraceInput, TraceMemory, TraceBelief, TraceResult,
} from "./record";

export * from "./record";

export interface ProvenanceDeps {
  brain: BrainProvider;
  storage: StorageProvider;
  idgen?: () => string;
  verifyBaseUrl?: string;
}

const DEFAULT_VERIFY_BASE = "https://verify.civ0.xyz";

let seq = 0;
function defaultId(): string {
  seq += 1;
  return `prov-${Date.now().toString(36)}-${seq}`;
}

export class Provenance {
  private readonly brain: BrainProvider;
  private readonly storage: StorageProvider;
  private readonly idgen: () => string;
  private readonly verifyBaseUrl: string;

  constructor(deps: ProvenanceDeps) {
    this.brain = deps.brain;
    this.storage = deps.storage;
    this.idgen = deps.idgen ?? defaultId;
    this.verifyBaseUrl = (deps.verifyBaseUrl ?? DEFAULT_VERIFY_BASE).replace(/\/+$/, "");
  }

  async trace(input: TraceInput): Promise<TraceResult> {
    const memories = input.memories ?? [];
    const beliefs = input.beliefs ?? [];

    const ctx = buildContext(input, memories, beliefs);
    const result = await this.brain.decide(ctx);

    const drivers: TraceDrivers = {
      memories: memories
        .filter((m) => m.id in result.memoryWeights)
        .map((m) => ({ id: m.id, weight: result.memoryWeights[m.id] })),
      beliefs: beliefs
        .filter((b) => b.id in result.beliefWeights)
        .map((b) => ({ id: b.id, weight: result.beliefWeights[b.id] })),
    };

    const decision: ProvenanceDecision = {
      action: result.action,
      targetId: result.targetId,
      reasoning: result.reasoning,
    };

    const record: ProvenanceRecord = {
      schema: "civ.provenance/v0",
      agent: input.agent,
      question: input.question,
      decision,
      drivers,
      meta: result.meta,
    };

    const archived = await this.storage.archive(`provenance/${this.idgen()}`, record);

    return {
      decision,
      drivers,
      verified: result.meta?.verified === true,
      rootHash: archived.rootHash,
      txHash: archived.txHash,
      verifyUrl: `${this.verifyBaseUrl}/${archived.rootHash}`,
      record,
    };
  }
}

function buildContext(input: TraceInput, memories: TraceMemory[], beliefs: TraceBelief[]): DecisionContext {
  return {
    citizen: {
      id: input.agent,
      name: input.agent,
      occupation: input.occupation ?? "autonomous agent",
      age: 0,
      traits: { ambition: 0, empathy: 0, loyalty: 0, curiosity: 0, discipline: 0, riskTolerance: 0 },
      wealth: 0,
      reputation: 0,
      tier: 1,
      createdDay: 0,
    },
    goal: {
      id: `goal-${input.agent}`,
      citizenId: input.agent,
      kind: "decision",
      description: input.question,
      progress: 0,
      active: true,
    },
    memories: memories.map((m) => ({
      id: m.id,
      citizenId: input.agent,
      day: 0,
      type: "observation",
      importance: m.importance ?? 5,
      summary: m.summary,
      embedding: [],
    })),
    beliefs: beliefs.map((b) => ({
      id: b.id,
      citizenId: input.agent,
      statement: b.statement,
      confidence: b.confidence ?? 0.5,
      sourceMemoryIds: [],
      updatedDay: 0,
    })),
    relationships: [],
    worldState: { day: 0, economy: {}, headline: input.question },
    availableActions: input.actions as ActionType[],
  };
}
