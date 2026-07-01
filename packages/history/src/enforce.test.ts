import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { assertFaithful, enforcementArmed } from "./enforce";

describe("enforce / Proof A gate", () => {
  const env = process.env;
  beforeEach(() => { process.env = { ...env }; });
  afterEach(() => { process.env = env; vi.restoreAllMocks(); });

  it("warns (never throws) in shadow mode", () => {
    delete process.env.HISTORY_ENFORCE;
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertFaithful("Economic", false, { x: 1 })).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });

  it("throws when armed and the dimension is at budget 0", () => {
    process.env.HISTORY_ENFORCE = "1";
    expect(() => assertFaithful("Economic", false, { x: 1 })).toThrow(/faithfulness/i);
  });

  it("does not throw on a faithful (ok=true) assertion even when armed", () => {
    process.env.HISTORY_ENFORCE = "1";
    expect(() => assertFaithful("Economic", true, {})).not.toThrow();
  });

  it("stays warn-only for a dimension with a nonzero budget", () => {
    process.env.HISTORY_ENFORCE = "1"; process.env.HISTORY_BUDGET_INSTITUTIONAL = "10";
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => assertFaithful("Institutional", false, {})).not.toThrow();
    expect(warn).toHaveBeenCalled();
  });
});
