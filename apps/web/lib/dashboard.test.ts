import { describe, it, expect } from "vitest";
import { topCitizens, recent, population, type WorldView } from "./dashboard";

function view(): WorldView {
  return {
    day: 5,
    citizens: [
      { id: "a", name: "Ada", tier: 3, reputation: 50 },
      { id: "b", name: "Bo", tier: 1, reputation: 90 },
      { id: "c", name: "Cy", tier: 2, reputation: 70 },
    ],
    recentEvents: [
      { id: "e1", day: 1, type: "work", actorId: "a", targetId: null },
      { id: "e3", day: 5, type: "invest", actorId: "c", targetId: "a" },
      { id: "e2", day: 3, type: "start_company", actorId: "a", targetId: "b" },
    ],
  };
}

describe("dashboard selectors", () => {
  it("topCitizens sorts by reputation desc and truncates to k", () => {
    const top = topCitizens(view(), 2);
    expect(top.map((c) => c.id)).toEqual(["b", "c"]);
  });
  it("topCitizens does not mutate the input", () => {
    const v = view();
    topCitizens(v, 2);
    expect(v.citizens.map((c) => c.id)).toEqual(["a", "b", "c"]);
  });
  it("recent returns newest day first, truncated to k", () => {
    const r = recent(view(), 2);
    expect(r.map((e) => e.id)).toEqual(["e3", "e2"]);
  });
  it("population counts citizens", () => {
    expect(population(view())).toBe(3);
  });
});
