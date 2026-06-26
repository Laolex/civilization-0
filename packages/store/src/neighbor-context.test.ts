import { describe, it, expect } from "vitest";
import { InMemoryWorldStore } from "./index";
import type { NeighborSummary, OrgContext } from "@civ/shared";

const summary: NeighborSummary = {
  id: "marcus", name: "Marcus", relationship: { trust: 70, friendship: 50, influence: 60 },
  latestAction: "invest", latestReasoning: "backed Ada", wealth: 100000, reputation: 70,
};
const org: OrgContext = { id: "o1", name: "Ada Collective", kind: "guild", latestAction: "partner" };

describe("InMemoryWorldStore neighbor/org context", () => {
  it("defaults to empty/null and round-trips set values", () => {
    const s = new InMemoryWorldStore();
    expect(s.getNeighborCandidates("ada")).toEqual([]);
    expect(s.getOrgContext("ada")).toBeNull();

    s.setNeighborCandidates("ada", [summary]);
    s.setOrgContext("ada", org);
    expect(s.getNeighborCandidates("ada")).toEqual([summary]);
    expect(s.getOrgContext("ada")).toEqual(org);

    s.setOrgContext("ada", null);
    expect(s.getOrgContext("ada")).toBeNull();
  });
});
