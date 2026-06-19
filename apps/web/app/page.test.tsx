import { describe, it, expect } from "vitest";

describe("landing page", () => {
  it("exports a default function component", async () => {
    const mod = await import("./page");
    expect(typeof mod.default).toBe("function");
  });
});
