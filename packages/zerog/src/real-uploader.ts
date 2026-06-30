import { ethers } from "ethers";
import { Indexer, MemData } from "@0gfoundation/0g-storage-ts-sdk";
import { ZeroGStorage, type Uploader } from "./storage";
import type { ZeroGConfig } from "./config";
import { ZeroGStorageError } from "./errors";
import { makeEvmProvider } from "./evm";

export class RealUploader implements Uploader {
  private readonly signer: ethers.Wallet;
  private readonly indexer: Indexer;
  constructor(private readonly config: ZeroGConfig) {
    const provider = makeEvmProvider(config.evmRpcs);
    this.signer = new ethers.Wallet(config.privateKey, provider);
    this.indexer = new Indexer(config.storageIndexer);
  }

  async upload(bytes: Uint8Array): Promise<{ rootHash: string; txHash: string }> {
    const memData = new MemData(bytes);
    const [tx, err] = await this.indexer.upload(memData, this.config.evmRpc, this.signer);
    if (err) throw new ZeroGStorageError(`indexer.upload error: ${String(err)}`, { cause: err });
    if (!tx) throw new ZeroGStorageError("indexer.upload returned no result");
    // The SDK may return a single-file result or a multi-file result
    if ("rootHash" in tx) {
      return { rootHash: tx.rootHash, txHash: tx.txHash };
    }
    // Multi-file result (rootHashes / txHashes arrays)
    if ("rootHashes" in tx && tx.rootHashes.length > 0 && tx.txHashes.length > 0) {
      return { rootHash: tx.rootHashes[0]!, txHash: tx.txHashes[0]! };
    }
    throw new ZeroGStorageError("indexer.upload returned no rootHash");
  }
}

export function createZeroGStorage(config: ZeroGConfig): ZeroGStorage {
  return new ZeroGStorage(new RealUploader(config));
}
