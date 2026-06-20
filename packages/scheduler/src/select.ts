export interface Ticker { id: string; tier: 1 | 2 | 3; }
const CADENCE: Record<1 | 2 | 3, number> = { 3: 1, 2: 3, 1: 7 };

export function selectTickers(citizens: Ticker[], day: number): string[] {
  return citizens.filter((c) => day % CADENCE[c.tier] === 0).map((c) => c.id);
}
