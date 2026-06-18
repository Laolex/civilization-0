import { describe, it, expect } from "vitest";
import { loadZeroGConfig } from "./config";
import { ZeroGStorageError, ZeroGBrainError } from "./errors";

describe("loadZeroGConfig", () => {
  it("reads env and applies testnet defaults", () => {
    const c = loadZeroGConfig({ ZG_PRIVATE_KEY: "0xabc" });
    expect(c.privateKey).toBe("0xabc");
    expect(c.evmRpc).toBe("https://evmrpc-testnet.0g.ai");
    expect(c.storageIndexer).toBe("https://indexer-storage-testnet-turbo.0g.ai");
    expect(c.fund.deposit).toBeGreaterThan(0);
  });
  it("throws when the private key is missing", () => {
    expect(() => loadZeroGConfig({})).toThrow(/ZG_PRIVATE_KEY/);
  });
});

describe("errors", () => {
  it("are named and carry a cause", () => {
    const e = new ZeroGStorageError("boom", { cause: new Error("inner") });
    expect(e.name).toBe("ZeroGStorageError");
    expect(new ZeroGBrainError("x").name).toBe("ZeroGBrainError");
  });
});
