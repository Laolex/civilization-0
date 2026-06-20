import type { OrgRepository } from "@civ/persistence";
import { runOrgTick, type OrgTickDeps } from "./org-tick";

export interface OrgDayDeps {
  repo: OrgRepository;
  makeOrgTickDeps: (day: number) => OrgTickDeps;
  orgIds: string[];
}

export async function runOrgDay(deps: OrgDayDeps, day: number): Promise<{ ticked: string[] }> {
  const ticked: string[] = [];
  for (const orgId of deps.orgIds) {
    const ctx = await deps.repo.loadOrgContext(orgId);
    if (!ctx) continue;
    const result = await runOrgTick(ctx, deps.makeOrgTickDeps(day));
    await deps.repo.persistOrgTick(orgId, result.event, result.trace, 0);
    ticked.push(orgId);
  }
  return { ticked };
}
