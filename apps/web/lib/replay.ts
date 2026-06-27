import type { SocialDriverView } from "./types";

/** Order-independent key for an undirected edge between two node ids. */
export function edgeKey(a: string, b: string): string {
  return a < b ? `${a}|${b}` : `${b}|${a}`;
}

/** Map each social driver to the (decider ↔ driver) edge it lit, valued by blended score. */
export function replayEdges(deciderId: string, drivers: SocialDriverView[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const d of drivers) {
    if (d.id === deciderId) continue;
    m.set(edgeKey(deciderId, d.id), Math.max(0, Math.min(1, d.blendedScore)));
  }
  return m;
}
