import type { ArchiveResult, StorageProvider } from "@civ/storage";
import { ZeroGStorageError } from "./errors";

export interface Uploader {
  upload(bytes: Uint8Array): Promise<{ rootHash: string; txHash: string }>;
}

export class ZeroGStorage implements StorageProvider {
  readonly name = "0g-storage";
  constructor(private readonly uploader: Uploader) {}

  async archive(key: string, data: unknown): Promise<ArchiveResult> {
    const bytes = new TextEncoder().encode(JSON.stringify({ key, data }));
    try {
      const { rootHash, txHash } = await this.uploader.upload(bytes);
      return { rootHash, txHash, ts: Date.now() };
    } catch (err) {
      throw new ZeroGStorageError(`0G Storage upload failed for key "${key}"`, { cause: err });
    }
  }
}
