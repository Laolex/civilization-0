import type { InMemoryWorldStore } from "@civ/store";
import type { TickDeps, TickResult } from "@civ/engine";
import { runCitizenTick } from "@civ/engine";
import type { WorldRepository, OrgRepository } from "@civ/persistence";
import { selectTickers, type Ticker } from "./select";
import { economicDelta } from "./economics";

export interface OrgEffects {
  orgRepo: OrgRepository;
  idgen: () => string;
}

export interface DayDeps {
  repo: WorldRepository;
  makeTickDeps: (store: InMemoryWorldStore, day: number) => TickDeps;
  citizens: Ticker[];
  orgEffects?: OrgEffects;
  drain?: (day: number) => Promise<{ applied: number; failed: number }>;
  runTick?: (deps: TickDeps, id: string) => Promise<TickResult>;
}

/** Founds an org for a citizen + a founder membership. Returns the new org id. */
export async function foundOrg(orgRepo: OrgRepository, founderId: string, day: number, idgen: () => string,
  worldId: string, decisionId: string | null): Promise<string> {
  const id = idgen();
  await orgRepo.createOrgCoupled({ id, name: `${founderId}'s collective`, kind: "guild",
    founderId, treasury: 0, reputation: 50, goal: "advance the collective", createdDay: day }, worldId, day, decisionId);
  return id; // founder membership is created inside createOrgCoupled
}

async function applyOrgEffect(eff: OrgEffects, result: TickResult, citizenId: string, day: number, worldId: string): Promise<void> {
  const action = result.decision.action;
  if (action === "create_org") {
    await foundOrg(eff.orgRepo, citizenId, day, eff.idgen, worldId, result.decision.id);
  } else if (action === "join" && result.decision.targetId) {
    const org = await eff.orgRepo.getOrg(result.decision.targetId);
    if (org) await eff.orgRepo.addMembershipCoupled({ orgId: org.id, citizenId, role: "member", joinedDay: day },
      worldId, day, result.decision.id);
  }
}

export async function runDay(deps: DayDeps, day: number): Promise<{ ticked: string[] }> {
  if (deps.drain) await deps.drain(day);
  const runTick = deps.runTick ?? runCitizenTick;
  const ids = selectTickers(deps.citizens, day);
  for (const id of ids) {
    const store = await deps.repo.loadContext(id);
    const result = await runTick(deps.makeTickDeps(store, day), id);
    await deps.repo.persistTick(store, result, id);
    for (const pinId of result.consumedPins ?? []) await deps.repo.unpinMemory(pinId);
    if (result.consumedDilemma) await deps.repo.clearForcedActions(id);
    await deps.repo.adjustWealth(id, economicDelta(result.decision.action), result.decision.id);
    if (deps.orgEffects) {
      const worldId = (await deps.repo.getCitizenWorldId(id)) ?? "genesis";
      await applyOrgEffect(deps.orgEffects, result, id, day, worldId);
    }
  }
  await deps.repo.setDay(day);
  return { ticked: ids };
}
