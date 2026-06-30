import { describe, it, expect } from "vitest";
import { assertCanForceTick, ForceTickError, FORCE_TICK_COOLDOWN_MS } from "./force-tick";

const owner = { id: "u1", plan: "free" };
const world = { id: "w1", ownerId: "u1" };
const T = 1_000_000_000_000;

describe("assertCanForceTick", () => {
  it("allows the owner when no prior request and returns cost metadata", () => {
    expect(assertCanForceTick(owner, world, null, T)).toEqual({ costCredits: 1, estOG: 0.017 });
  });
  it("throws 403 for a non-owner", () => {
    try { assertCanForceTick({ id: "u2", plan: "free" }, world, null, T); throw new Error("no throw"); }
    catch (e) { expect((e as ForceTickError).status).toBe(403); }
  });
  it("throws 429 within the cooldown window with retryAfterMs", () => {
    try { assertCanForceTick(owner, world, T - 1000, T); throw new Error("no throw"); }
    catch (e) {
      const err = e as ForceTickError;
      expect(err.status).toBe(429);
      expect(err.retryAfterMs).toBe(FORCE_TICK_COOLDOWN_MS - 1000);
    }
  });
  it("allows again once the cooldown has elapsed", () => {
    expect(assertCanForceTick(owner, world, T - FORCE_TICK_COOLDOWN_MS, T)).toEqual({ costCredits: 1, estOG: 0.017 });
  });
});
