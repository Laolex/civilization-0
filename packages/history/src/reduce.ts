import type { CognitiveTransition, WorldState } from "./types";
import { eventKind, type Genesis, type HistoryEvent, type WorldFacts,
  type WealthDelta, type RelationshipDelta, type OrganizationDelta } from "./types";

// Unit Separator (U+001F): a non-printable control char that cannot occur in a worldId
// or actor id (engine ids are alphanumeric). Using a printable delimiter like ":" would let
// distinct triples collide when an id contained that delimiter (e.g. worldId "w:1"/actor "c1"
// vs worldId "w"/actor "1:c1" both → "w:1:1:c1"), silently dropping a transition in fold().
const KEY_SEP = "\x1F";

export function worldStateKey(worldId: string, tickId: number, actor: string): string {
  if (worldId.includes(KEY_SEP) || actor.includes(KEY_SEP)) {
    // Explicit constraint guard: ids must never contain the separator, so the key is
    // collision-free regardless of id content (Invariant: one transition per real triple).
    throw new Error("worldStateKey: worldId/actor must not contain the U+001F separator");
  }
  return `${worldId}${KEY_SEP}${tickId}${KEY_SEP}${actor}`;
}

/** Pure reducer: derive minimal 1A world state = latest authenticated transition per (world,tick,actor). */
export function fold(transitions: CognitiveTransition[]): WorldState {
  const latest = new Map<string, CognitiveTransition>();
  for (const t of transitions) {
    latest.set(worldStateKey(t.header.worldId, t.header.tickId, t.actor), t);
  }
  return { latest };
}

const relKey = (a: string, b: string) => (a < b ? `${a}\x1F${b}` : `${b}\x1F${a}`);

/** Reconstruct WorldFacts = genesis baseline ⊕ Σ deltas (Invariant #6 — this is the audited semantics). */
export function worldFold(genesis: Genesis, events: HistoryEvent[]): WorldFacts {
  const wealth = new Map<string, number>();
  for (const w of genesis.facts.wealth) wealth.set(w.actor, w.wealth);
  const rels = new Map<string, { a: string; b: string; trust: number; friendship: number; influence: number }>();
  for (const r of genesis.facts.relationships) rels.set(relKey(r.a, r.b), { ...r });
  const orgs = new Map<string, { id: string; founderId: string; treasury: number; members: { citizenId: string; role: string }[] }>();
  for (const o of genesis.facts.organizations) orgs.set(o.id, { ...o, members: o.members.map((m) => ({ ...m })) });

  for (const e of events) {
    switch (eventKind(e)) {
      case "WealthDelta": {
        const w = e as WealthDelta;
        wealth.set(w.actor, Math.max(0, (wealth.get(w.actor) ?? 0) + w.delta));
        break;
      }
      case "RelationshipDelta": {
        const r = e as RelationshipDelta;
        const k = relKey(r.a, r.b);
        const cur = rels.get(k) ?? { a: r.a < r.b ? r.a : r.b, b: r.a < r.b ? r.b : r.a, trust: 0, friendship: 0, influence: 0 };
        cur[r.field] = cur[r.field] + r.delta;
        rels.set(k, cur);
        break;
      }
      case "OrganizationDelta": {
        const o = e as OrganizationDelta;
        if (o.op === "founded") {
          orgs.set(o.orgId, { id: o.orgId, founderId: o.founderId ?? "", treasury: 0,
            members: [{ citizenId: o.founderId ?? "", role: "founder" }] });
        } else if (o.op === "member_added" && o.citizenId) {
          const org = orgs.get(o.orgId) ?? { id: o.orgId, founderId: "", treasury: 0, members: [] };
          if (!org.members.some((m) => m.citizenId === o.citizenId)) org.members.push({ citizenId: o.citizenId, role: o.role ?? "member" });
          orgs.set(o.orgId, org);
        }
        break;
      }
      default: break; // CognitiveTransition / Anchor: no world-state delta
    }
  }
  return {
    wealth: [...wealth.entries()].map(([actor, w]) => ({ actor, wealth: w })),
    relationships: [...rels.values()],
    organizations: [...orgs.values()],
  };
}
