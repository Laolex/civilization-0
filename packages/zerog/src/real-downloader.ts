// packages/zerog/src/real-downloader.ts
import { Indexer } from "@0gfoundation/0g-storage-ts-sdk";
import type { Downloader } from "./download";
import { ZeroGStorageError } from "./errors";

export class RealDownloader implements Downloader {
  private readonly indexer: Indexer;
  constructor(storageIndexer: string) {
    this.indexer = new Indexer(storageIndexer);
  }

  async download(rootHash: string): Promise<Uint8Array> {
    // downloadToBlob is browser/Node-safe and needs no signer (read path).
    const [blob, err] = await this.indexer.downloadToBlob(rootHash);
    if (err) throw new ZeroGStorageError(`0G Storage download failed for root "${rootHash}"`, { cause: err });
    if (!blob) throw new ZeroGStorageError(`0G Storage returned no data for root "${rootHash}"`);
    return new Uint8Array(await blob.arrayBuffer());
  }
}

export function createZeroGDownloader(storageIndexer: string): RealDownloader {
  return new RealDownloader(storageIndexer);
}
