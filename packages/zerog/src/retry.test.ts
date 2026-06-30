import { describe, it, expect, vi } from "vitest";
import { withRetry, isTransientError } from "./retry";

// A no-op sleep so tests don't actually wait; we assert on the delays passed to it.
function recordingSleep() {
  const delays: number[] = [];
  return { delays, sleep: async (ms: number) => { delays.push(ms); } };
}

describe("isTransientError", () => {
  it("treats an ethers-style nested TIMEOUT cause as transient", () => {
    // Shape mirrors the real outage: ZeroGBrainError → cause = ethers { code: 'TIMEOUT' }
    const err = new Error("Failed to create 0G Compute broker");
    (err as { cause?: unknown }).cause = Object.assign(new Error("request timeout"), { code: "TIMEOUT" });
    expect(isTransientError(err)).toBe(true);
  });

  it("matches transient network codes by message", () => {
    for (const m of ["ETIMEDOUT", "ECONNRESET", "socket hang up", "SERVER_ERROR", "503 Service Unavailable"]) {
      expect(isTransientError(new Error(m))).toBe(true);
    }
  });

  it("does not retry a clearly permanent error", () => {
    expect(isTransientError(new Error("ZG_COMPUTE_PROVIDER not set"))).toBe(false);
    expect(isTransientError(new Error("insufficient funds for intrinsic transaction cost"))).toBe(false);
  });
});

describe("withRetry", () => {
  it("returns immediately on success without sleeping", async () => {
    const { delays, sleep } = recordingSleep();
    const fn = vi.fn(async () => "ok");
    await expect(withRetry(fn, { sleep })).resolves.toBe("ok");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it("retries a transient failure then succeeds", async () => {
    const { delays, sleep } = recordingSleep();
    let n = 0;
    const fn = vi.fn(async () => {
      if (++n < 3) throw Object.assign(new Error("request timeout"), { code: "TIMEOUT" });
      return "recovered";
    });
    await expect(withRetry(fn, { sleep, baseMs: 100, factor: 2 })).resolves.toBe("recovered");
    expect(fn).toHaveBeenCalledTimes(3);
    expect(delays).toEqual([100, 200]); // exponential backoff between the 3 attempts
  });

  it("fails fast (no retry) on a non-retryable error", async () => {
    const { delays, sleep } = recordingSleep();
    const fn = vi.fn(async () => { throw new Error("ZG_COMPUTE_PROVIDER not set"); });
    await expect(withRetry(fn, { sleep })).rejects.toThrow("ZG_COMPUTE_PROVIDER not set");
    expect(fn).toHaveBeenCalledTimes(1);
    expect(delays).toEqual([]);
  });

  it("exhausts attempts and throws the last error", async () => {
    const { delays, sleep } = recordingSleep();
    const fn = vi.fn(async () => { throw Object.assign(new Error("request timeout"), { code: "TIMEOUT" }); });
    await expect(withRetry(fn, { sleep, attempts: 4, baseMs: 1 })).rejects.toThrow("request timeout");
    expect(fn).toHaveBeenCalledTimes(4);
    expect(delays).toHaveLength(3); // sleeps happen between attempts, not after the last
  });

  it("caps the backoff at maxMs", async () => {
    const { delays, sleep } = recordingSleep();
    const fn = vi.fn(async () => { throw Object.assign(new Error("timeout"), { code: "TIMEOUT" }); });
    await expect(
      withRetry(fn, { sleep, attempts: 5, baseMs: 1000, factor: 10, maxMs: 3000 }),
    ).rejects.toThrow();
    expect(delays).toEqual([1000, 3000, 3000, 3000]); // 1000, 10000→cap, ...
  });

  it("notifies onRetry for each retry", async () => {
    const { sleep } = recordingSleep();
    const onRetry = vi.fn();
    let n = 0;
    const fn = async () => { if (++n < 2) throw Object.assign(new Error("timeout"), { code: "TIMEOUT" }); return 1; };
    await withRetry(fn, { sleep, onRetry, baseMs: 5 });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
