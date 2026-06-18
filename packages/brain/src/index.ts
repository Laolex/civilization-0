import type { ActionType, Belief, Citizen, ExecutionMeta, Goal, Memory, Relationship, WorldState } from "@civ/shared";

export interface DecisionContext {
  citizen: Citizen;
  goal: Goal | null;
  memories: Memory[];
  beliefs: Belief[];
  relationships: Relationship[];
  worldState: WorldState;
  availableActions: ActionType[];
}

export interface DecisionResult {
  action: ActionType;
  targetId: string | null;
  reasoning: string;
  memoryWeights: Record<string, number>;
  beliefWeights: Record<string, number>;
  meta?: ExecutionMeta;
}

export interface BrainProvider {
  readonly name: string;
  readonly model: string;
  decide(ctx: DecisionContext): Promise<DecisionResult>;
}

export type BrainScript = (ctx: DecisionContext) => DecisionResult;

export class FakeBrain implements BrainProvider {
  readonly name = "fake";
  readonly model = "scripted-v0";
  constructor(private readonly script: BrainScript) {}
  async decide(ctx: DecisionContext): Promise<DecisionResult> {
    return this.script(ctx);
  }
}
