export const SHARED_WORLD_ID = "genesis";
const PREMIUM_PLANS = new Set(["pro", "research"]);

export function canIntervene(
  user: { id: string; plan: string },
  world: { id: string; ownerId: string | null },
): boolean {
  if (world.ownerId && world.ownerId === user.id) return true;
  if (world.id === SHARED_WORLD_ID) return PREMIUM_PLANS.has(user.plan);
  return false;
}
