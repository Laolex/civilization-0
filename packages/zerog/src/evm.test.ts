import { describe, it, expect } from "vitest";
import { ethers } from "ethers";
import { makeEvmProvider } from "./evm";
import { ZeroGBrainError } from "./errors";

// Note: ethers providers connect lazily, so constructing them here makes no
// network calls — these assertions are offline.
describe("makeEvmProvider", () => {
  it("returns a plain JsonRpcProvider for a single URL", () => {
    const p = makeEvmProvider(["https://evmrpc-testnet.0g.ai"]);
    expect(p).toBeInstanceOf(ethers.JsonRpcProvider);
    expect(p).not.toBeInstanceOf(ethers.FallbackProvider);
  });

  it("returns a FallbackProvider when given multiple URLs", () => {
    const p = makeEvmProvider([
      "https://evmrpc-testnet.0g.ai",
      "https://0g-galileo-testnet.drpc.org",
    ]);
    expect(p).toBeInstanceOf(ethers.FallbackProvider);
  });

  it("accepts a comma-separated string and trims/ignores blanks", () => {
    const p = makeEvmProvider(" https://a.example , , https://b.example ");
    expect(p).toBeInstanceOf(ethers.FallbackProvider);
  });

  it("collapses a single effective URL to a JsonRpcProvider", () => {
    const p = makeEvmProvider("https://only.example, ,");
    expect(p).toBeInstanceOf(ethers.JsonRpcProvider);
    expect(p).not.toBeInstanceOf(ethers.FallbackProvider);
  });

  it("throws when no URL is configured", () => {
    expect(() => makeEvmProvider([])).toThrow(ZeroGBrainError);
    expect(() => makeEvmProvider("   ,  ")).toThrow(/ZG_EVM_RPC/);
  });
});
