// packages/zerog/scripts/smoke-0g-download.ts
import { config as loadDotenv } from "dotenv";
import { resolve } from "node:path";
loadDotenv({ path: resolve(import.meta.dirname, "../../../.env") });
import { loadZeroGConfig } from "../src/config";
import { createZeroGDownloader } from "../src/real-downloader";
import { parseArchivedTrace } from "../src/download";

// A real trace root archived on 0G testnet by the proven live tick.
const ROOT = process.argv[2] ?? "0x5683f71d74232ef492093a7a5e27aa3cef78a39250d4644e9e427c5a51ca4217";

async function main() {
  const config = loadZeroGConfig(process.env);
  const downloader = createZeroGDownloader(config);
  console.log("Downloading from 0G Storage:", ROOT);
  const bytes = await downloader.download(ROOT);
  console.log("Bytes:", bytes.length);
  const rec = parseArchivedTrace(bytes);
  console.log("key:", rec.key);
  console.log("data:", JSON.stringify(rec.data).slice(0, 200));
}

main().catch((e) => { console.error(e); process.exit(1); });
