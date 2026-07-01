import { ethers } from "ethers";
import type { ZeroGConfig } from "./config";
import { makeEvmProvider } from "./evm";

export function getWalletAddress(config: ZeroGConfig): string {
  return new ethers.Wallet(config.privateKey).address;
}

export async function getBalanceOG(config: ZeroGConfig): Promise<number> {
  const provider = makeEvmProvider(config.evmRpcs);
  const wei = await provider.getBalance(getWalletAddress(config));
  return Number(ethers.formatEther(wei));
}
