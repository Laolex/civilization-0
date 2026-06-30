import { describe, it, expect, vi } from "vitest";
import type { ActionType, Memory } from "@civ/shared";
import type { Intervention } from "@civ/persistence/src/intervention-write";
import { drainInterventions, makeWhisperApplier, makeWorldEventApplier, makeDilemmaApplier, makeTickRequestApplier, type DrainDeps } from "./interventions";

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

  it("dispatches a world_event to applyWorldEvent and a whisper to applyWhisper", async () => {
    const calls: string[] = [];
    const deps: DrainDeps = {
      pending: async () => [ivOf({ id: "w1", type: "whisper" }), ivOf({ id: "e1", type: "world_event" })],
      applyWhisper: async (iv) => { calls.push(`whisper:${iv.id}`); },
      applyWorldEvent: async (iv) => { calls.push(`event:${iv.id}`); },
      markApplied: async () => {}, markFailed: async () => {},
    };
    const out = await drainInterventions(deps, 5);
    expect(out).toEqual({ applied: 2, failed: 0 });
    expect(calls).toEqual(["whisper:w1", "event:e1"]);
  });

  it("leaves a truly unknown type pending (not applied/failed)", async () => {
    const marked: string[] = [];
    const deps: DrainDeps = {
      pending: async () => [ivOf({ id: "x1", type: "prophecy" })],
      applyWhisper: async () => { throw new Error("nope"); },
      markApplied: async (id) => { marked.push(`a:${id}`); },
      markFailed: async (id) => { marked.push(`f:${id}`); },
    };
    const out = await drainInterventions(deps, 5);
    expect(out).toEqual({ applied: 0, failed: 0 });
    expect(marked).toEqual([]);
  });

  it("makeWorldEventApplier sets the world's headline; throws on missing headline", async () => {
    const set: Array<[string, string]> = [];
    const repo = { setWorldHeadline: async (w: string, h: string) => { set.push([w, h]); } };
    const apply = makeWorldEventApplier(repo);
    await apply(ivOf({ id: "e1", type: "world_event", worldId: "w9", payload: { headline: "War breaks out" } }), 2);
    expect(set).toEqual([["w9", "War breaks out"]]);
    await expect(apply(ivOf({ id: "e2", type: "world_event", payload: {} }), 2)).rejects.toThrow();
  });

  it("makeWorldEventApplier rejects an all-whitespace headline and does not call setWorldHeadline", async () => {
    const set: Array<[string, string]> = [];
    const repo = { setWorldHeadline: async (w: string, h: string) => { set.push([w, h]); } };
    const apply = makeWorldEventApplier(repo);
    await expect(
      apply(ivOf({ id: "e3", type: "world_event", worldId: "w9", payload: { headline: "   " } }), 2)
    ).rejects.toThrow();
    expect(set).toEqual([]);
  });

  it("makeWorldEventApplier rejects a headline longer than 140 chars", async () => {
    const set: Array<[string, string]> = [];
    const repo = { setWorldHeadline: async (w: string, h: string) => { set.push([w, h]); } };
    const apply = makeWorldEventApplier(repo);
    const longHeadline = "A".repeat(141);
    await expect(
      apply(ivOf({ id: "e4", type: "world_event", worldId: "w9", payload: { headline: longHeadline } }), 2)
    ).rejects.toThrow();
    expect(set).toEqual([]);
  });

  it("makeWorldEventApplier writes the TRIMMED headline when surrounding whitespace is present", async () => {
    const set: Array<[string, string]> = [];
    const repo = { setWorldHeadline: async (w: string, h: string) => { set.push([w, h]); } };
    const apply = makeWorldEventApplier(repo);
    await apply(ivOf({ id: "e5", type: "world_event", worldId: "w9", payload: { headline: "  War  " } }), 2);
    expect(set).toEqual([["w9", "War"]]);
  });

  it("dispatches a dilemma to applyDilemma", async () => {
    const calls: string[] = [];
    const deps: DrainDeps = {
      pending: async () => [ivOf({ id: "d1", type: "dilemma" })],
      applyWhisper: async () => { throw new Error("should not be called"); },
      applyDilemma: async (iv) => { calls.push(`dilemma:${iv.id}`); },
      markApplied: async () => {}, markFailed: async () => {},
    };
    const out = await drainInterventions(deps, 5);
    expect(out).toEqual({ applied: 1, failed: 0 });
    expect(calls).toEqual(["dilemma:d1"]);
  });

  it("makeDilemmaApplier sets the forced action set and writes a framing pin", async () => {
    const setCalls: Array<[string, ActionType[]]> = [];
    const pins: Memory[] = [];
    const repo = {
      getCitizenWorldId: async () => "w1",
      setForcedActions: async (id: string, a: ActionType[]) => { setCalls.push([id, a]); },
      addPinnedMemory: async (m: Memory) => { pins.push(m); },
    };
    const apply = makeDilemmaApplier(repo, { embed: () => [1] });
    await apply(ivOf({ id: "d1", type: "dilemma", worldId: "w1", targetCitizenId: "ada",
      payload: { text: "  Stay or go?  ", actions: ["work", "quit_job"] } }), 3);
    expect(setCalls).toEqual([["ada", ["work", "quit_job"]]]);
    expect(pins[0].id).toBe("dl-d1");
    expect(pins[0].pinned).toBe(true);
    expect(pins[0].importance).toBe(10);
    expect(pins[0].summary).toBe("Stay or go?"); // trimmed
  });

  it("makeDilemmaApplier rejects fewer than 2 actions and writes nothing", async () => {
    const setCalls: unknown[] = [];
    const pins: unknown[] = [];
    const repo = {
      getCitizenWorldId: async () => "w1",
      setForcedActions: async () => { setCalls.push(1); },
      addPinnedMemory: async () => { pins.push(1); },
    };
    const apply = makeDilemmaApplier(repo, { embed: () => [1] });
    await expect(apply(ivOf({ id: "d2", type: "dilemma", worldId: "w1", targetCitizenId: "ada",
      payload: { text: "x", actions: ["work"] } }), 3)).rejects.toThrow();
    expect(setCalls).toEqual([]);
    expect(pins).toEqual([]);
  });

  it("makeDilemmaApplier rejects an unknown action verb", async () => {
    const repo = {
      getCitizenWorldId: async () => "w1",
      setForcedActions: async () => {},
      addPinnedMemory: async () => {},
    };
    const apply = makeDilemmaApplier(repo, { embed: () => [1] });
    await expect(apply(ivOf({ id: "d3", type: "dilemma", worldId: "w1", targetCitizenId: "ada",
      payload: { text: "x", actions: ["work", "fly"] } }), 3)).rejects.toThrow();
  });

  it("makeDilemmaApplier rejects a citizen not in the intervention world", async () => {
    const repo = {
      getCitizenWorldId: async () => "other-world",
      setForcedActions: async () => {},
      addPinnedMemory: async () => {},
    };
    const apply = makeDilemmaApplier(repo, { embed: () => [1] });
    await expect(apply(ivOf({ id: "d4", type: "dilemma", worldId: "w1", targetCitizenId: "ada",
      payload: { text: "x", actions: ["work", "quit_job"] } }), 3)).rejects.toThrow();
  });
});

describe("tick_request", () => {
  it("makeTickRequestApplier is a no-op that resolves", async () => {
    const apply = makeTickRequestApplier();
    await expect(apply({ id: "iv1", worldId: "w1", userId: "u1", type: "tick_request",
      targetCitizenId: null, payload: {}, status: "pending", appliedDay: null }, 5)).resolves.toBeUndefined();
  });

  it("drainInterventions routes tick_request to applyTickRequest and marks it applied", async () => {
    const marked: string[] = [];
    const applyTickRequest = vi.fn(async () => {});
    const res = await drainInterventions({
      pending: async () => [{ id: "t1", worldId: "w1", userId: "u1", type: "tick_request",
        targetCitizenId: null, payload: {}, status: "pending", appliedDay: null }],
      applyWhisper: async () => {},
      applyTickRequest,
      markApplied: async (id) => { marked.push(id); },
      markFailed: async () => {},
    }, 9);
    expect(applyTickRequest).toHaveBeenCalledOnce();
    expect(res.applied).toBe(1);
    expect(marked).toEqual(["t1"]);
  });
});
