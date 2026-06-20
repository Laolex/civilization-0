import { describe, it, expect } from "vitest";
import { FakeBrain } from "@civ/brain";
import { FakeStorage } from "@civ/storage";
import { ExplainabilityService } from "@civ/explainability";
import type { Organization } from "@civ/shared";
import { runOrgTick, orgPersona } from "./org-tick";

const org: Organization = { id: "o1", name: "Ada Collective", kind: "guild",
  founderId: "ada", treasury: 1000, reputation: 50, goal: "grow influence", createdDay: 0 };

describe("runOrgTick", () => {
  it("orgPersona maps the org into a Citizen shape", () => {
    const p = orgPersona(org, 5);
    expect(p.id).toBe("o1");
    expect(p.name).toBe("Ada Collective");
    expect(p.occupation).toBe("guild organization");
    expect(p.wealth).toBe(1000);
  });

  it("reasons as the org and produces an event + archived trace", async () => {
    let n = 0; const idgen = () => `x${n++}`;
    const result = await runOrgTick(
      { org, members: [{ orgId: "o1", citizenId: "ada", role: "founder", joinedDay: 0 }] },
      { brain: new FakeBrain(() => ({ action: "hire", targetId: "lena", reasoning: "scale the guild",
          memoryWeights: {}, beliefWeights: {} })),
        storage: new FakeStorage(), explain: new ExplainabilityService(new FakeStorage()),
        clock: { day: 5 }, idgen });

    expect(result.action).toBe("hire");
    expect(result.event.actorId).toBe("o1");
    expect(result.event.targetId).toBe("lena");
    expect(result.event.payload).toMatchObject({ orgTick: true, reasoning: "scale the guild" });
    expect(result.trace.zgRootHash).toMatch(/^0xfake/);   // explainability archived it
    expect(result.event.zgRootHash).toMatch(/^0xfake/);   // event archived to storage
  });
});
