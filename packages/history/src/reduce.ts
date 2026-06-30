import type { CognitiveTransition, WorldState } from "./types";

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
