export interface ArchiveResult { rootHash: string; txHash: string; ts: number; }

export interface StorageProvider {
  readonly name: string;
  archive(key: string, data: unknown): Promise<ArchiveResult>;
}

function hashString(s: string): string {
  // FNV-1a 32-bit — deterministic, no crypto/network.
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export class FakeStorage implements StorageProvider {
  readonly name = "fake";
  readonly calls: Array<{ key: string; data: unknown; result: ArchiveResult }> = [];

  async archive(key: string, data: unknown): Promise<ArchiveResult> {
    const digest = hashString(JSON.stringify(data));
    const result: ArchiveResult = {
      rootHash: `0xfake${digest}`,
      txHash: `0xtx${hashString(key + digest)}`,
      ts: this.calls.length,
    };
    this.calls.push({ key, data, result });
    return result;
  }
}
