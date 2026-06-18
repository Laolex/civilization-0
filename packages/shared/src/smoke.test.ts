import { describe, it, expect } from "vitest";

describe("toolchain", () => {
  it("runs typescript tests", () => {
    const sum = (a: number, b: number): number => a + b;
    expect(sum(2, 3)).toBe(5);
  });
});
