import { ethers } from "ethers";
import { ZeroGBrainError } from "./errors";

// Build an ethers provider from one or more 0G EVM RPC URLs. With a single URL
// this is exactly the old behaviour (a plain JsonRpcProvider). With several, it
// returns a FallbackProvider (quorum 1) so a *sustained* outage of the primary
// endpoint fails over to the next instead of stalling autonomy — the retry layer
// in real-chat handles momentary blips; this handles a whole endpoint going dark.
export function makeEvmProvider(rpcs: string[] | string): ethers.AbstractProvider {
  const urls = (Array.isArray(rpcs) ? rpcs : rpcs.split(","))
    .map((u) => u.trim())
    .filter(Boolean);
  if (urls.length === 0) {
    throw new ZeroGBrainError("No 0G EVM RPC URL configured (set ZG_EVM_RPC)");
  }
  if (urls.length === 1) {
    return new ethers.JsonRpcProvider(urls[0]);
  }
  const configs = urls.map((url, i) => ({
    provider: new ethers.JsonRpcProvider(url),
    priority: i + 1, // lower = preferred, so the list order is the failover order
    weight: 1,
    stallTimeout: 2000, // ms to wait on a slow endpoint before trying the next
  }));
  // quorum 1: a single healthy endpoint is enough to answer — this is failover,
  // not consensus.
  return new ethers.FallbackProvider(configs, undefined, { quorum: 1 });
}
