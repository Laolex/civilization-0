import type { CognitiveTransition, WorldState } from "./types";

export function worldStateKey(worldId: string, tickId: number, actor: string): string {
  return `${worldId}:${tickId}:${actor}`;
}

/** Pure reducer: derive minimal 1A world state = latest authenticated transition per (world,tick,actor). */
export function fold(transitions: CognitiveTransition[]): WorldState {
  const latest = new Map<string, CognitiveTransition>();
  for (const t of transitions) {
    latest.set(worldStateKey(t.header.worldId, t.header.tickId, t.actor), t);
  }
  return { latest };
}
