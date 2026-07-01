import { randomUUID } from "node:crypto";
import { SCHEMA_VERSION, GENESIS_PARENT,
  type WealthDelta, type RelationshipDelta, type OrganizationDelta, type EventHeader } from "./types";

function header(worldId: string, tickId: number, eventId: string): EventHeader {
  return { eventId, parentHash: GENESIS_PARENT, worldId, tickId,
    engineVersion: process.env.ENGINE_VERSION ?? "civ0@dev", schemaVersion: SCHEMA_VERSION,
    timestamp: new Date().toISOString() };
}

// null-decision mutations must never collide: fall back to a random fragment instead of the shared "x" placeholder.
const decisionFragment = (decisionId: string | null) => decisionId ?? randomUUID();

export function buildWealthDelta(a: { worldId: string; tickId: number; actor: string; delta: number; decisionId: string | null }): WealthDelta {
  return { kind: "WealthDelta", header: header(a.worldId, a.tickId, `wd-${a.actor}-${a.tickId}-${decisionFragment(a.decisionId)}`),
    actor: a.actor, delta: a.delta, decisionId: a.decisionId };
}
export function buildRelationshipDelta(a: { worldId: string; tickId: number; A: string; B: string;
  field: "trust" | "friendship" | "influence"; delta: number; decisionId: string | null }): RelationshipDelta {
  return { kind: "RelationshipDelta",
    header: header(a.worldId, a.tickId, `rd-${a.A}-${a.B}-${a.field}-${a.tickId}-${decisionFragment(a.decisionId)}`),
    a: a.A, b: a.B, field: a.field, delta: a.delta, decisionId: a.decisionId };
}
export function buildOrganizationDelta(a: { worldId: string; tickId: number; op: "founded" | "member_added";
  orgId: string; founderId?: string; citizenId?: string; role?: string; decisionId: string | null }): OrganizationDelta {
  return { kind: "OrganizationDelta",
    header: header(a.worldId, a.tickId, `od-${a.op}-${a.orgId}-${a.citizenId ?? a.founderId ?? ""}-${a.tickId}`),
    op: a.op, orgId: a.orgId, founderId: a.founderId, citizenId: a.citizenId, role: a.role, decisionId: a.decisionId };
}
