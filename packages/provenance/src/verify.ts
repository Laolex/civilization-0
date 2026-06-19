import { parseArchivedTrace, type Downloader } from "@civ/zerog/src/download";
import type { ProvenanceRecord } from "./record";

function isProvenanceRecord(data: unknown): data is ProvenanceRecord {
  return (
    !!data &&
    typeof data === "object" &&
    (data as Record<string, unknown>).schema === "civ.provenance/v0"
  );
}

/**
 * Keyless verification: download the archived envelope from 0G Storage by its
 * root hash and recover the provenance record. The verifier needs only the
 * public storage indexer — never a private key.
 */
export async function verifyRecord(downloader: Downloader, rootHash: string): Promise<ProvenanceRecord> {
  const bytes = await downloader.download(rootHash);
  const { data } = parseArchivedTrace(bytes);
  if (!isProvenanceRecord(data)) {
    throw new Error("archived object is not a civ.provenance record");
  }
  return data;
}
