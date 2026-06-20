import { describe, it, expect } from "vitest";
import { buildLifeStory } from "./lifestory";

describe("buildLifeStory", () => {
  const input = { name: "Ada", occupation: "Engineer", events: [
    { day: 1, type: "work", targetId: null, reasoning: "build the foundation" },
    { day: 3, type: "invest", targetId: "marcus", reasoning: "back a partner" },
  ]};
  it("opens with name + occupation and renders events oldest-first", () => {
    const s = buildLifeStory(input);
    expect(s[0]).toContain("Ada"); expect(s[0]).toContain("Engineer");
    expect(s[1]).toContain("day 1"); expect(s[1]).toContain("work");
    expect(s[2]).toContain("day 3"); expect(s[2]).toContain("marcus");
  });
  it("handles a citizen with no events", () => {
    const s = buildLifeStory({ name: "Bo", occupation: "Farmer", events: [] });
    expect(s.length).toBeGreaterThanOrEqual(1);
    expect(s[0]).toContain("Bo");
  });
});
