import { describe, it, expect, vi } from "vitest";
import { runDay, type DayDeps } from "./loop";

it("drains interventions before ticking and unpins consumed pins after", async () => {
  const calls: string[] = [];
  const repo = {
    loadContext: async () => { calls.push("load"); return {} as never; },
    persistTick: async () => { calls.push("persist"); },
    adjustWealth: async () => {},
    setDay: async () => {},
    unpinMemory: async (id: string) => { calls.push(`unpin:${id}`); },
  };
  const deps = {
    repo: repo as unknown as DayDeps["repo"],
    makeTickDeps: () => ({} as never),
    citizens: [{ id: "ada", tier: 3 as const }],
    drain: async () => { calls.push("drain"); return { applied: 1, failed: 0 }; },
    runTick: async () => ({ decision: { action: "work" }, consumedPins: ["p1"] } as never),
  };
  await runDay(deps as unknown as DayDeps, 5);
  expect(calls[0]).toBe("drain");
  expect(calls).toContain("unpin:p1");
});

it("ticks a citizen targeted by a drained intervention even when cadence would skip them", async () => {
  const ticked: string[] = [];
  const repo = {
    loadContext: async (id: string) => { ticked.push(id); return {} as never; },
    persistTick: async () => {},
    adjustWealth: async () => {},
    setDay: async () => {},
    unpinMemory: async () => {},
    clearForcedActions: async () => {},
  };
  const deps = {
    repo: repo as unknown as DayDeps["repo"],
    makeTickDeps: () => ({} as never),
    // tier-2 citizen ticks only when day % 3 === 0; day 5 would normally skip her.
    citizens: [{ id: "lena", tier: 2 as const }],
    drain: async () => ({ applied: 1, failed: 0, targets: ["lena"] }),
    runTick: async () => ({ decision: { action: "work" }, consumedPins: [] } as never),
  };
  await runDay(deps as unknown as DayDeps, 5);
  expect(ticked).toEqual(["lena"]);
});

it("does not double-tick a citizen that is both scheduled and targeted", async () => {
  const ticked: string[] = [];
  const repo = {
    loadContext: async (id: string) => { ticked.push(id); return {} as never; },
    persistTick: async () => {},
    adjustWealth: async () => {},
    setDay: async () => {},
    unpinMemory: async () => {},
    clearForcedActions: async () => {},
  };
  const deps = {
    repo: repo as unknown as DayDeps["repo"],
    makeTickDeps: () => ({} as never),
    // tier-3 ticks every day, so day 6 already schedules ada; a target must not re-add her.
    citizens: [{ id: "ada", tier: 3 as const }],
    drain: async () => ({ applied: 1, failed: 0, targets: ["ada"] }),
    runTick: async () => ({ decision: { action: "work" }, consumedPins: [] } as never),
  };
  await runDay(deps as unknown as DayDeps, 6);
  expect(ticked).toEqual(["ada"]);
});

it("ignores a drained target that is not a known citizen", async () => {
  const ticked: string[] = [];
  const repo = {
    loadContext: async (id: string) => { ticked.push(id); return {} as never; },
    persistTick: async () => {},
    adjustWealth: async () => {},
    setDay: async () => {},
    unpinMemory: async () => {},
    clearForcedActions: async () => {},
  };
  const deps = {
    repo: repo as unknown as DayDeps["repo"],
    makeTickDeps: () => ({} as never),
    citizens: [{ id: "lena", tier: 2 as const }],
    drain: async () => ({ applied: 1, failed: 0, targets: ["ghost"] }),
    runTick: async () => ({ decision: { action: "work" }, consumedPins: [] } as never),
  };
  await runDay(deps as unknown as DayDeps, 5);
  expect(ticked).toEqual([]);
});

it("clears the forced action set after a tick that consumed a dilemma", async () => {
  const calls: string[] = [];
  const repo = {
    loadContext: async () => ({} as never),
    persistTick: async () => {},
    adjustWealth: async () => {},
    setDay: async () => {},
    unpinMemory: async () => {},
    clearForcedActions: async (id: string) => { calls.push(`clear:${id}`); },
  };
  const deps = {
    repo: repo as unknown as DayDeps["repo"],
    makeTickDeps: () => ({} as never),
    citizens: [{ id: "ada", tier: 3 as const }],
    runTick: async () => ({ decision: { action: "work" }, consumedPins: [], consumedDilemma: true } as never),
  };
  await runDay(deps as unknown as DayDeps, 5);
  expect(calls).toContain("clear:ada");
});
