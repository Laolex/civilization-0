import React from "react";
import { describe, it, expect, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href }, children),
}));

// The landing is a server component that reads live proof stats; in a unit test
// there's no DB, so stub the read path to exercise the static-pitch fallback.
vi.mock("@civ/persistence/src/pool", () => ({ getPool: () => ({}) }));
vi.mock("@civ/persistence/src/read", () => ({
  readProofStats: async () => { throw new Error("no db in unit test"); },
}));

import Home from "./page";

describe("landing page", () => {
  it("renders the provenance tagline and the key entry links", async () => {
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain("provenance layer for agentic AI");
    expect(html).toContain("think on 0G");
    expect(html).toContain("lives on 0G");
    expect(html).toContain("Enter the living world");
    expect(html).toContain('href="/map"');
    expect(html).toContain('href="/citizens/ada"');
  });
});
