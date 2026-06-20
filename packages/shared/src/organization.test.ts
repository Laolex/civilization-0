import { describe, it, expect } from "vitest";
import { ALL_ACTIONS, type ActionType, type Organization, type Membership } from "./index";

describe("org shared types", () => {
  it("ALL_ACTIONS includes the org lifecycle actions", () => {
    for (const a of ["create_org", "join", "leave"] as ActionType[]) {
      expect(ALL_ACTIONS).toContain(a);
    }
  });
  it("Organization and Membership object literals are well-formed", () => {
    const org: Organization = { id: "o1", name: "Ada Collective", kind: "guild",
      founderId: "ada", treasury: 1000, reputation: 50, goal: "grow influence", createdDay: 0 };
    const m: Membership = { orgId: "o1", citizenId: "ada", role: "founder", joinedDay: 0 };
    expect(org.kind).toBe("guild");
    expect(m.role).toBe("founder");
  });
});
