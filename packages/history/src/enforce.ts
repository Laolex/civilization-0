export type Dimension = "Cognitive" | "Economic" | "Relational" | "Institutional" | "System";

export class FaithfulnessError extends Error {
  constructor(public dimension: Dimension, public detail: unknown) {
    super(`faithfulness violation [${dimension}]: ${JSON.stringify(detail)}`);
    this.name = "FaithfulnessError";
  }
}

export function enforcementArmed(): boolean { return process.env.HISTORY_ENFORCE === "1"; }

export function divergenceBudget(dim: Dimension): number {
  const n = Number(process.env[`HISTORY_BUDGET_${dim.toUpperCase()}`]);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

/** Proof A gate. Throws (→ caller ROLLBACK) only when enforcement is armed AND the dimension's budget
 *  is 0 AND the assertion failed. Otherwise warn-only (shadow / still-ramping dimension). */
export function assertFaithful(dim: Dimension, ok: boolean, detail: unknown): void {
  if (ok) return;
  if (enforcementArmed() && divergenceBudget(dim) === 0) throw new FaithfulnessError(dim, detail);
  console.warn(`[history] faithfulness divergence [${dim}] (shadow/over-budget):`, detail);
}
