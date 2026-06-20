import { ethers } from "ethers";
import type { ZeroGConfig } from "./config";

export function getWalletAddress(config: ZeroGConfig): string {
  return new ethers.Wallet(config.privateKey).address;
}

export async function getBalanceOG(config: ZeroGConfig): Promise<number> {
  const provider = new ethers.JsonRpcProvider(config.evmRpc);
  const wei = await provider.getBalance(getWalletAddress(config));
  return Number(ethers.formatEther(wei));
}
