import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
loadDotenv({ path: resolve(import.meta.dirname, "../../../.env") });
import { ethers } from "ethers";
import { createZGComputeNetworkBroker } from "@0gfoundation/0g-compute-ts-sdk";
import { loadZeroGConfig } from "../src/config";
import { ensureFunded } from "../src/real-chat";

async function main() {
  const config = loadZeroGConfig(process.env);
  const wallet = new ethers.Wallet(config.privateKey, new ethers.JsonRpcProvider(config.evmRpc));
  // Never print the private key
  console.log("Wallet:", wallet.address);
  const broker = await createZGComputeNetworkBroker(wallet);
  await ensureFunded(broker, config);
  console.log("Ledger:", await broker.ledger.getLedger());
}

main().catch((e) => { console.error(e); process.exit(1); });
