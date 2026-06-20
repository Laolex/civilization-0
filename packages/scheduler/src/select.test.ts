import { describe, it, expect } from "vitest";
import { selectTickers } from "./select";

const pop = [
  { id: "founder", tier: 3 as const },
  { id: "active", tier: 2 as const },
  { id: "extra", tier: 1 as const },
];

describe("selectTickers", () => {
  it("ticks tier-3 every day", () => {
    expect(selectTickers(pop, 1)).toContain("founder");
    expect(selectTickers(pop, 2)).toContain("founder");
  });
  it("ticks tier-2 every 3rd day and tier-1 every 7th", () => {
    expect(selectTickers(pop, 3)).toEqual(expect.arrayContaining(["founder", "active"]));
    expect(selectTickers(pop, 3)).not.toContain("extra");
    expect(selectTickers(pop, 7)).toEqual(expect.arrayContaining(["founder", "extra"]));
  });
});
