import type { ActionType, Citizen, Decision, Goal, Organization, WorldEvent, DecisionTrace, WorldState } from "@civ/shared";
import type { BrainProvider } from "@civ/brain";
import type { StorageProvider } from "@civ/storage";
import type { ExplainabilityService } from "@civ/explainability";
import type { OrgContext } from "@civ/persistence";

const DEFAULT_ORG_ACTIONS: ActionType[] = ["hire", "invest", "partner", "work"];

export interface OrgTickDeps {
  brain: BrainProvider;
  storage: StorageProvider;
  explain: ExplainabilityService;
  clock: { day: number };
  idgen: () => string;
  worldState?: WorldState;
  availableActions?: ActionType[];
}

export interface OrgTickResult {
  event: WorldEvent;
  trace: DecisionTrace;
  reasoning: string;
  action: ActionType;
  targetId: string | null;
}

/** Synthesize a Citizen persona so the org can reason through the existing brain prompt. */
export function orgPersona(org: Organization, day: number): Citizen {
  const age = Math.max(1, day - org.createdDay);
  return {
    id: org.id, name: org.name, occupation: `${org.kind} organization`, age,
    traits: { ambition: 80, empathy: 50, loyalty: 70, curiosity: 60, discipline: 75, riskTolerance: 55 },
    wealth: org.treasury, reputation: org.reputation, tier: 2, createdDay: org.createdDay,
  };
}

export async function runOrgTick(ctx: OrgContext, deps: OrgTickDeps): Promise<OrgTickResult> {
  const { brain, storage, explain, clock, idgen } = deps;
  const { org } = ctx;
  const availableActions = deps.availableActions ?? DEFAULT_ORG_ACTIONS;
  const worldState: WorldState = deps.worldState ?? { day: clock.day, economy: {}, headline: "" };
  const goal: Goal = {
    id: `${org.id}-goal`, citizenId: org.id, kind: "strategy",
    description: org.goal || "advance the organization", progress: 0, active: true,
  };

  const result = await brain.decide({
    citizen: orgPersona(org, clock.day), goal,
    memories: [], beliefs: [], relationships: [], worldState, availableActions,
  });

  const decisionId = idgen();
  const decision: Decision = {
    id: decisionId, citizenId: org.id, goalId: goal.id, day: clock.day,
    reasoning: result.reasoning, action: result.action, targetId: result.targetId,
    brainProvider: brain.name, brainModel: brain.model, meta: result.meta,
  };
  const event: WorldEvent = {
    id: idgen(), day: clock.day, type: result.action, actorId: org.id,
    targetId: result.targetId, decisionId,
    payload: { orgTick: true, reasoning: result.reasoning, action: result.action, targetId: result.targetId },
  };

  const trace = await explain.buildAndArchive({ id: idgen(), decision, goal, memories: [], beliefs: [], event });
  const res = await storage.archive(`event/${event.id}`, event);
  event.zgRootHash = res.rootHash;
  event.zgTxHash = res.txHash;

  return { event, trace, reasoning: result.reasoning, action: result.action, targetId: result.targetId };
}
