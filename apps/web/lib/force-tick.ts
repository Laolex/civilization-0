import { canIntervene } from "@civ/persistence/src/intervention-authz";

const COOLDOWN_ENV = Number(process.env.FORCE_TICK_COOLDOWN_MS);
// Guard against a non-numeric env value: NaN comparisons are always false,
// which would silently disable the cooldown entirely.
export const FORCE_TICK_COOLDOWN_MS = Number.isFinite(COOLDOWN_ENV) ? COOLDOWN_ENV : 120_000;

export interface ForceTickCost { costCredits: number; estOG: number; }

export class ForceTickError extends Error {
  status: number;
  retryAfterMs?: number;
  constructor(status: number, message: string, retryAfterMs?: number) {
    super(message);
    this.name = "ForceTickError";
    this.status = status;
    this.retryAfterMs = retryAfterMs;
  }
}

/**
 * The single place this feature becomes "expensive" when a paid rail lands.
 * Today: owner check + per-world cooldown. Later: deduct a credit / charge, throw 402.
 */
export function assertCanForceTick(
  user: { id: string; plan: string },
  world: { id: string; ownerId: string | null },
  lastTickRequestMs: number | null,
  now: number,
): ForceTickCost {
  if (!canIntervene(user, world)) throw new ForceTickError(403, "forbidden");
  if (lastTickRequestMs !== null) {
    const elapsed = now - lastTickRequestMs;
    if (elapsed < FORCE_TICK_COOLDOWN_MS) {
      throw new ForceTickError(429, "cooldown", FORCE_TICK_COOLDOWN_MS - elapsed);
    }
  }
  return { costCredits: 1, estOG: 0.017 };
}
