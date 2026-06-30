import { type Executor, loadWorldEvents } from "./append";
import { loadLegacyActions } from "./read";
import { verifyChain } from "./hash";
import { fold, worldStateKey } from "./reduce";
import { eventKind, type CognitiveTransition } from "./types";

export async function verifyWorldChain(
  tx: Executor,
  worldId: string,
): Promise<{ ok: boolean; brokenAt?: number; reason?: string }> {
  // Verify the FULL per-world chain across ALL event kinds. append() links every event
  // (CognitiveTransition AND AnchorEvent) to the true tip, so the authentic chain is the whole
  // ordered sequence. Filtering to one kind would gap the linkage and false-report an honestly
  // anchored chain (…T, Anchor, T…) as broken once HISTORY_ANCHOR is on. (Invariant #3.)
  const rows = await loadWorldEvents(tx, worldId);
  return verifyChain(rows);
}

/**
 * Historical Faithfulness Proof: assert fold(history) reflects legacy reality.
 * WARN-ONLY in 1A — returns divergences; callers log, never throw. Fail-hard in 1B.
 */
export async function faithfulnessProof(
  tx: Executor,
  worldId: string,
): Promise<{ ok: boolean; divergences: { key: string; folded?: string; legacy?: string }[] }> {
  const rows = await loadWorldEvents(tx, worldId);
  const transitions = rows
    .map((r) => r.event)
    .filter((e) => eventKind(e) === "CognitiveTransition") as CognitiveTransition[];
  const ws = fold(transitions);
  const legacy = await loadLegacyActions(tx, worldId);

  const divergences: { key: string; folded?: string; legacy?: string }[] = [];
  for (const l of legacy) {
    const key = worldStateKey(worldId, l.tick, l.actor);
    const folded = ws.latest.get(key)?.selectedAction;
    if (folded !== l.action) divergences.push({ key, folded, legacy: l.action });
  }
  return { ok: divergences.length === 0, divergences };
}
