export interface ZeroGConfig {
  privateKey: string;
  /** Primary EVM RPC URL (first in the list). Used where an SDK takes one URL. */
  evmRpc: string;
  /** Full ordered EVM RPC list incl. fallbacks — for an ethers FallbackProvider. */
  evmRpcs: string[];
  storageIndexer: string;
  computeProvider?: string;
  computeModel?: string;
  fund: { deposit: number; transfer: bigint };
}

// Default to the official RPC plus a public fallback so a sustained outage of
// one endpoint doesn't stall autonomy. ZG_EVM_RPC overrides this and may be a
// comma-separated list (primary first). Both verified at chainId 16602 (0x40da).
const DEFAULT_EVM_RPCS = "https://evmrpc-testnet.0g.ai,https://0g-galileo-testnet.drpc.org";

export function loadZeroGConfig(env: Record<string, string | undefined>): ZeroGConfig {
  const privateKey = env.ZG_PRIVATE_KEY;
  if (!privateKey) throw new Error("ZG_PRIVATE_KEY is required (set it in .env)");
  // The 0G protocol enforces a MINIMUM of 3 OG to open a Compute ledger
  // (broker.ledger.addLedger), so deposit defaults to 3. Inference itself costs a
  // tiny fraction of an OG, so a small per-provider transfer funds many calls.
  // deposit/balance are in OG (number); transfer is in neuron (1 OG = 1e18), as
  // the SDK's transferFund expects. Both are env-overridable.
  const depositOG = env.ZG_FUND_DEPOSIT ? Number(env.ZG_FUND_DEPOSIT) : 3;
  const transferOG = env.ZG_FUND_TRANSFER ? Number(env.ZG_FUND_TRANSFER) : 0.05;
  const evmRpcs = (env.ZG_EVM_RPC ?? DEFAULT_EVM_RPCS)
    .split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  return {
    privateKey,
    evmRpc: evmRpcs[0] ?? "https://evmrpc-testnet.0g.ai",
    evmRpcs,
    storageIndexer: env.ZG_STORAGE_INDEXER ?? "https://indexer-storage-testnet-turbo.0g.ai",
    computeProvider: env.ZG_COMPUTE_PROVIDER || undefined,
    computeModel: env.ZG_COMPUTE_MODEL || undefined,
    fund: { deposit: depositOG, transfer: BigInt(Math.round(transferOG * 1e18)) },
  };
}
