import { describe, it, expect } from "vitest";
import type { Memory } from "@civ/shared";
import type { Intervention } from "@civ/persistence/src/intervention-write";
import { drainInterventions, makeWhisperApplier, type DrainDeps } from "./interventions";

function ivOf(over: Partial<Intervention> = {}): Intervention {
  return { id: "iv1", worldId: "w1", userId: "u1", type: "whisper",
    targetCitizenId: "ada", payload: { text: "trust Marcus less" },
    status: "pending", appliedDay: null, ...over };
}

describe("drainInterventions", () => {
  it("applies each pending whisper and marks it applied", async () => {
    const applied: string[] = [];
    const deps: DrainDeps = {
      pending: async () => [ivOf()],
      applyWhisper: async () => {},
      markApplied: async (id) => { applied.push(id); },
      markFailed: async () => {},
    };
    const out = await drainInterventions(deps, 5);
    expect(out).toEqual({ applied: 1, failed: 0 });
    expect(applied).toEqual(["iv1"]);
  });

  it("marks a whisper failed (without throwing) when the applier throws", async () => {
    const failed: string[] = [];
    const deps: DrainDeps = {
      pending: async () => [ivOf({ id: "bad" })],
      applyWhisper: async () => { throw new Error("unknown citizen"); },
      markApplied: async () => {},
      markFailed: async (id) => { failed.push(id); },
    };
    const out = await drainInterventions(deps, 5);
    expect(out).toEqual({ applied: 0, failed: 1 });
    expect(failed).toEqual(["bad"]);
  });

  it("ignores non-whisper types (left for later sub-projects)", async () => {
    const deps: DrainDeps = {
      pending: async () => [ivOf({ id: "we1", type: "world_event" })],
      applyWhisper: async () => { throw new Error("should not be called"); },
      markApplied: async () => {}, markFailed: async () => {},
    };
    const out = await drainInterventions(deps, 5);
    expect(out).toEqual({ applied: 0, failed: 0 });
  });

  it("derives the pinned-memory id deterministically from the intervention id (idempotent re-apply)", async () => {
    const ids: string[] = [];
    const repo = {
      getCitizenWorldId: async () => "w1",
      addPinnedMemory: async (m: Memory) => { ids.push(m.id); },
    };
    const embedder = { embed: () => [1] };
    const apply = makeWhisperApplier(repo, embedder);
    await apply(ivOf({ id: "iv9" }), 3);
    await apply(ivOf({ id: "iv9" }), 4); // a re-apply of the same intervention
    // Same memory id both times — so the repo's ON CONFLICT (id) DO NOTHING
    // makes the second insert a no-op rather than a duplicate whisper.
    expect(ids).toEqual(["wh-iv9", "wh-iv9"]);
  });

  it("resilient to markFailed rejection: continues processing remaining interventions", async () => {
    const applied: string[] = [];
    const failed: string[] = [];
    const deps: DrainDeps = {
      pending: async () => [
        ivOf({ id: "iv1" }),
        ivOf({ id: "iv2" }),
      ],
      applyWhisper: async (iv) => {
        if (iv.id === "iv1") throw new Error("first fails");
      },
      markApplied: async (id) => { applied.push(id); },
      markFailed: async (id) => {
        failed.push(id);
        if (id === "iv1") throw new Error("markFailed transient error");
      },
    };
    const out = await drainInterventions(deps, 5);
    // Despite markFailed rejecting for iv1, drainInterventions should not throw
    // and should still process iv2 (apply it successfully)
    expect(out).toEqual({ applied: 1, failed: 1 });
    expect(applied).toEqual(["iv2"]);
    expect(failed).toEqual(["iv1"]);
  });
});
