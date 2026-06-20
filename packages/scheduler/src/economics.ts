// Deterministic per-action economic delta applied to a citizen's wealth or an
// org's treasury after each tick. Post-decision only — the engine is unchanged.
const DELTA: Record<string, number> = {
  work: 8, trade: 6, partner: 5, lead: 3,
  invest: -15, hire: -12, create_org: -10, start_company: -25,
  join: 0, leave: 0,
};
export function economicDelta(action: string): number {
  return DELTA[action] ?? 0;
}
