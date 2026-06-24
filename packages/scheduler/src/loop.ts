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
export async function foundOrg(orgRepo: OrgRepository, founderId: string, day: number, idgen: () => string): Promise<string> {
  const id = idgen();
  await orgRepo.createOrg({ id, name: `${founderId}'s collective`, kind: "guild",
    founderId, treasury: 0, reputation: 50, goal: "advance the collective", createdDay: day });
  await orgRepo.addMembership({ orgId: id, citizenId: founderId, role: "founder", joinedDay: day });
  return id;
}

async function applyOrgEffect(eff: OrgEffects, result: TickResult, citizenId: string, day: number): Promise<void> {
  const action = result.decision.action;
  if (action === "create_org") {
    await foundOrg(eff.orgRepo, citizenId, day, eff.idgen);
  } else if (action === "join" && result.decision.targetId) {
    const org = await eff.orgRepo.getOrg(result.decision.targetId);
    if (org) await eff.orgRepo.addMembership({ orgId: org.id, citizenId, role: "member", joinedDay: day });
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
    await deps.repo.adjustWealth(id, economicDelta(result.decision.action));
    if (deps.orgEffects) await applyOrgEffect(deps.orgEffects, result, id, day);
  }
  await deps.repo.setDay(day);
  return { ticked: ids };
}
