import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
loadDotenv({ path: resolve(import.meta.dirname, "../../../.env") });
import { loadZeroGConfig } from "../src/config";
import { createZeroGStorage } from "../src/real-uploader";

async function main() {
  const config = loadZeroGConfig(process.env);
  const storage = createZeroGStorage(config);
  console.log("Archiving sample object to 0G Storage…");
  const res = await storage.archive("smoke/hello", { msg: "hello 0G", at: Date.now() });
  console.log("rootHash:", res.rootHash);
  console.log("txHash:  ", res.txHash);
}

main().catch((e) => { console.error(e); process.exit(1); });
