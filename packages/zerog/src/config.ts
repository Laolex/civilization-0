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
  return {
    privateKey,
    evmRpc: env.ZG_EVM_RPC ?? "https://evmrpc-testnet.0g.ai",
    storageIndexer: env.ZG_STORAGE_INDEXER ?? "https://indexer-storage-testnet-turbo.0g.ai",
    computeProvider: env.ZG_COMPUTE_PROVIDER || undefined,
    computeModel: env.ZG_COMPUTE_MODEL || undefined,
    fund: { deposit: 10, transfer: 1n * 10n ** 18n },
  };
}
