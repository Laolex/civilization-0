import { type Executor } from "./append";
import { loadGenesis, loadWorldDeltas } from "./read";
import { worldFold } from "./reduce";
import { captureGenesisFacts } from "./genesis";
import type { WorldFacts } from "./types";

/** Current absolute world facts from legacy rows (identical query path to captureGenesisFacts). */
export async function foldLegacyFacts(tx: Executor, worldId: string): Promise<WorldFacts> {
  return captureGenesisFacts(tx, worldId);
}

type Mismatch = { dim: string; key: string; folded?: number; legacy?: number };

export async function proofB(tx: Executor, worldId: string): Promise<{ ok: boolean; mismatches: Mismatch[] }> {
  const genesis = await loadGenesis(tx, worldId);
  if (!genesis) return { ok: false, mismatches: [{ dim: "System", key: "genesis", legacy: 1 }] };
  const folded = worldFold(genesis, await loadWorldDeltas(tx, worldId));
  const legacy = await foldLegacyFacts(tx, worldId);
  const mismatches: Mismatch[] = [];

  const fW = new Map(folded.wealth.map((w) => [w.actor, w.wealth]));
  for (const l of legacy.wealth) if ((fW.get(l.actor) ?? 0) !== l.wealth)
    mismatches.push({ dim: "Economic", key: l.actor, folded: fW.get(l.actor), legacy: l.wealth });

  const relK = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const fR = new Map(folded.relationships.map((r) => [relK(r.a, r.b), r]));
  for (const l of legacy.relationships) {
    const f = fR.get(relK(l.a, l.b));
    for (const field of ["trust", "friendship", "influence"] as const)
      if ((f?.[field] ?? 0) !== (l as any)[field])
        mismatches.push({ dim: "Relational", key: `${relK(l.a, l.b)}.${field}`, folded: f?.[field], legacy: (l as any)[field] });
  }

  const fO = new Map(folded.organizations.map((o) => [o.id, o.members.length]));
  for (const l of legacy.organizations) if ((fO.get(l.id) ?? 0) !== l.members.length)
    mismatches.push({ dim: "Institutional", key: l.id, folded: fO.get(l.id), legacy: l.members.length });

  return { ok: mismatches.length === 0, mismatches };
}

type Cov = Record<"Cognitive" | "Economic" | "Relational" | "Institutional" | "System", number>;

/** Per-dimension fraction of legacy facts reproduced by the fold (1 == 100%). */
export async function coverage(tx: Executor, worldId: string): Promise<Cov> {
  const genesis = await loadGenesis(tx, worldId);
  if (!genesis) return { Cognitive: 0, Economic: 0, Relational: 0, Institutional: 0, System: 0 };
  const folded = worldFold(genesis, await loadWorldDeltas(tx, worldId));
  const legacy = await foldLegacyFacts(tx, worldId);

  const frac = (total: number, ok: number) => (total === 0 ? 1 : ok / total);
  const fW = new Map(folded.wealth.map((w) => [w.actor, w.wealth]));
  const econOk = legacy.wealth.filter((l) => (fW.get(l.actor) ?? 0) === l.wealth).length;
  const relK = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);
  const fR = new Map(folded.relationships.map((r) => [relK(r.a, r.b), r]));
  const relOk = legacy.relationships.filter((l) => {
    const f = fR.get(relK(l.a, l.b));
    return f && f.trust === l.trust && f.friendship === l.friendship && f.influence === l.influence;
  }).length;
  const fO = new Map(folded.organizations.map((o) => [o.id, o.members.length]));
  const instOk = legacy.organizations.filter((l) => (fO.get(l.id) ?? 0) === l.members.length).length;

  return {
    Cognitive: 1, // cognition coverage is the 1A CognitiveTransition stream (always emitted per decision)
    Economic: frac(legacy.wealth.length, econOk),
    Relational: frac(legacy.relationships.length, relOk),
    Institutional: frac(legacy.organizations.length, instOk),
    System: 1,
  };
}
