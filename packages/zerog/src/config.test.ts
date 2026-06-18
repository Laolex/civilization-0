import { describe, it, expect } from "vitest";
import { loadZeroGConfig } from "./config";
import { ZeroGStorageError, ZeroGBrainError } from "./errors";

describe("loadZeroGConfig", () => {
  it("reads env and applies testnet defaults", () => {
    const c = loadZeroGConfig({ ZG_PRIVATE_KEY: "0xabc" });
    expect(c.privateKey).toBe("0xabc");
    expect(c.evmRpc).toBe("https://evmrpc-testnet.0g.ai");
    expect(c.storageIndexer).toBe("https://indexer-storage-testnet-turbo.0g.ai");
    expect(c.fund.deposit).toBe(0.1);
    expect(c.fund.transfer).toBe(5n * 10n ** 16n); // 0.05 OG in neuron
  });
  it("allows overriding fund amounts via env (OG → neuron)", () => {
    const c = loadZeroGConfig({ ZG_PRIVATE_KEY: "0xabc", ZG_FUND_DEPOSIT: "0.3", ZG_FUND_TRANSFER: "0.2" });
    expect(c.fund.deposit).toBe(0.3);
    expect(c.fund.transfer).toBe(2n * 10n ** 17n); // 0.2 OG in neuron
  });
  it("throws when the private key is missing", () => {
    expect(() => loadZeroGConfig({})).toThrow(/ZG_PRIVATE_KEY/);
  });
});

describe("errors", () => {
  it("are named and carry a cause", () => {
    const cause = new Error("inner");
    const e = new ZeroGStorageError("boom", { cause });
    expect(e.name).toBe("ZeroGStorageError");
    expect(e.cause).toBe(cause);
    expect(new ZeroGBrainError("x").name).toBe("ZeroGBrainError");
  });
});
