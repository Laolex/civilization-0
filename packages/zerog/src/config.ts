export interface ZeroGConfig {
  privateKey: string;
  evmRpc: string;
  storageIndexer: string;
  computeProvider?: string;
  computeModel?: string;
  fund: { deposit: number; transfer: bigint };
}

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
  return {
    privateKey,
    evmRpc: env.ZG_EVM_RPC ?? "https://evmrpc-testnet.0g.ai",
    storageIndexer: env.ZG_STORAGE_INDEXER ?? "https://indexer-storage-testnet-turbo.0g.ai",
    computeProvider: env.ZG_COMPUTE_PROVIDER || undefined,
    computeModel: env.ZG_COMPUTE_MODEL || undefined,
    fund: { deposit: depositOG, transfer: BigInt(Math.round(transferOG * 1e18)) },
  };
}
