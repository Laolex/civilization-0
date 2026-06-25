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
