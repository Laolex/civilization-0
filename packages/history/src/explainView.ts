import type { Executor } from "./append";
import { loadTransition, loadAnchor, loadGenesis, loadEpochStartTick } from "./read";
import { verifyWorldChain } from "./verify";
import { project } from "./project";
import type { ExplainView } from "./types";

/** Reconstruct the authenticated, chain-verified explain trace for one (world, citizen, tick)
 *  straight from the history log. Returns null if no transition was recorded, or a pre-epoch
 *  refusal if the requested tick falls before the world's authenticated cognitive boundary
 *  (Invariant #5 — no pre-boundary cognition may be reconstructed or presented as historical fact). */
export async function buildExplainView(
  tx: Executor,
  worldId: string,
  citizenId: string,
  tickId: number,
): Promise<ExplainView | null | { refused: "pre-epoch"; epochId: string }> {
  const genesis = await loadGenesis(tx, worldId);
  if (genesis) {
    const start = await loadEpochStartTick(tx, worldId);
    if (start != null && tickId < start) {
      const preEpochFound = await loadTransition(tx, worldId, citizenId, tickId);
      if (!preEpochFound) return { refused: "pre-epoch", epochId: genesis.epochId };
    }
  }
  const found = await loadTransition(tx, worldId, citizenId, tickId);
  if (!found) return null;
  const chain = await verifyWorldChain(tx, worldId);
  const anchor = await loadAnchor(tx, worldId, tickId);
  return project(
    { transition: found.transition, eventHash: found.eventHash, parentHash: found.parentHash,
      chainVerified: chain.ok, anchor },
    "explain",
  );
}
