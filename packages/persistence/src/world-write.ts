import { randomBytes } from "node:crypto";
import { getPool } from "./pool";

export interface PlanLimit { populationCap: number; allowPrivate: boolean; maxWorlds: number; api: boolean; }
export const PLAN_LIMITS: Record<"free" | "pro" | "research", PlanLimit> = {
  free: { populationCap: 10, allowPrivate: false, maxWorlds: 1, api: false },
  pro: { populationCap: 100, allowPrivate: true, maxWorlds: 10, api: false },
  research: { populationCap: 100, allowPrivate: true, maxWorlds: 25, api: true },
};

export interface CreateWorldInput { ownerId: string; ownerPlan: "free" | "pro" | "research"; name: string; visibility: "public" | "private"; }

export async function createWorld(input: CreateWorldInput): Promise<{ id: string }> {
  const limit = PLAN_LIMITS[input.ownerPlan];
  if (input.visibility === "private" && !limit.allowPrivate) throw new Error("Your plan does not allow private worlds. Upgrade to Pro.");
  const owned = await getPool().query("SELECT COUNT(*)::int c FROM worlds WHERE owner_id = $1", [input.ownerId]);
  if (owned.rows[0].c >= limit.maxWorlds) throw new Error(`Plan limit reached (${limit.maxWorlds} worlds).`);
  const id = randomBytes(6).toString("hex");
  await getPool().query(
    "INSERT INTO worlds (id,name,owner_id,visibility,population_cap) VALUES ($1,$2,$3,$4,$5)",
    [id, input.name, input.ownerId, input.visibility, limit.populationCap]);
  return { id };
}
export async function worldPopulation(worldId: string): Promise<number> {
  const r = await getPool().query("SELECT COUNT(*)::int c FROM citizens WHERE world_id = $1", [worldId]);
  return r.rows[0].c;
}
