import type { Executor } from "./append";
import { loadTransition, loadAnchor } from "./read";
import { verifyWorldChain } from "./verify";
import { project } from "./project";
import type { ExplainView } from "./types";

/** Reconstruct the authenticated, chain-verified explain trace for one (world, citizen, tick)
 *  straight from the history log. Returns null if no transition was recorded. */
export async function buildExplainView(
  tx: Executor,
  worldId: string,
  citizenId: string,
  tickId: number,
): Promise<ExplainView | null> {
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
