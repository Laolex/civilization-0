import { ZeroGStorageError } from "./errors";

export interface Downloader {
  download(rootHash: string): Promise<Uint8Array>;
}

export interface ArchivedRecord {
  key: string;
  data: unknown;
}

/** Reverse ZeroGStorage's `JSON.stringify({ key, data })` archive envelope. */
export function parseArchivedTrace(bytes: Uint8Array): ArchivedRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(new TextDecoder().decode(bytes));
  } catch (err) {
    throw new ZeroGStorageError("archived object is not valid JSON", { cause: err });
  }
  if (
    !parsed || typeof parsed !== "object" ||
    typeof (parsed as Record<string, unknown>).key !== "string" ||
    !("data" in (parsed as Record<string, unknown>))
  ) {
    throw new ZeroGStorageError("archived object missing key/data envelope");
  }
  const obj = parsed as Record<string, unknown>;
  return { key: obj.key as string, data: obj.data };
}
