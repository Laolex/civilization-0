export interface WorldView {
  day: number;
  citizens: { id: string; name: string; tier: number; reputation: number; wealth?: number; occupation?: string }[];
  recentEvents: { id: string; day: number; type: string; actorId: string; targetId: string | null; rootHash?: string | null }[];
}

export function topCitizens(v: WorldView, k: number): WorldView["citizens"] {
  return [...v.citizens].sort((a, b) => b.reputation - a.reputation).slice(0, k);
}

export function recent(v: WorldView, k: number): WorldView["recentEvents"] {
  return [...v.recentEvents].sort((a, b) => b.day - a.day).slice(0, k);
}

export function population(v: WorldView): number {
  return v.citizens.length;
}
