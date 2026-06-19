import { createZeroGDownloader } from "@civ/zerog/src/real-downloader";
import { verifyRecord } from "./verify";
import type { ProvenanceRecord } from "./record";

const DEFAULT_INDEXER = "https://indexer-storage-testnet-turbo.0g.ai";

/**
 * KEYLESS verification. Returns a function that, given a root hash, downloads
 * the archived record from 0G Storage and recovers it. Needs only the public
 * storage indexer — never a private key. Deep-imports the downloader to avoid
 * pulling the (broken-ESM) compute SDK through the @civ/zerog index.
 */
export function createVerifier(
  storageIndexer: string = DEFAULT_INDEXER,
): (rootHash: string) => Promise<ProvenanceRecord> {
  const downloader = createZeroGDownloader(storageIndexer);
  return (rootHash: string) => verifyRecord(downloader, rootHash);
}
