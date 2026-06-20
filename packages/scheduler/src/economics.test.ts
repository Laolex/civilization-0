import { describe, it, expect } from "vitest";
import { economicDelta } from "./economics";

describe("economicDelta", () => {
  it("rewards productive actions and charges for big moves", () => {
    expect(economicDelta("work")).toBeGreaterThan(0);
    expect(economicDelta("partner")).toBeGreaterThan(0);
    expect(economicDelta("start_company")).toBeLessThan(0);
    expect(economicDelta("hire")).toBeLessThan(0);
    expect(economicDelta("invest")).toBeLessThan(0);
  });
  it("is deterministic and 0 for unknown/neutral actions", () => {
    expect(economicDelta("join")).toBe(0);
    expect(economicDelta("something_else")).toBe(0);
    expect(economicDelta("work")).toBe(economicDelta("work"));
  });
});
