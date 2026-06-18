import { describe, it, expect } from "vitest";
import { seedAdaWorld, runDays } from "./scenario";

describe("scenario: Ada starts a company", () => {
  it("produces a coherent, fully-traceable history over multiple days", async () => {
    const { deps, storage } = seedAdaWorld();
    const results = await runDays(deps, "ada", 3);

    // every decision in the run has an archived trace (the 'why' is always durable)
    for (const r of results) {
      expect(r.trace.zgRootHash).toMatch(/^0xfake/);
      const dm = deps.store.getDecisionMemories(r.decision.id);
      expect(dm.length).toBeGreaterThan(0); // memory -> decision link always present
    }

    // at least one major event got archived to storage
    const archived = storage.calls.filter((c) => c.key.startsWith("event/"));
    expect(archived.length).toBeGreaterThan(0);

    // Ada accumulated at least one belief
    expect(deps.store.getBeliefs("ada").length).toBeGreaterThan(0);
  });
});
