import React from "react";
import { describe, it, expect } from "vitest";
import { vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

vi.mock("next/link", () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) =>
    React.createElement("a", { href }, children),
}));

import Home from "./page";

describe("landing page", () => {
  it("renders the tagline and an Enter link to Ada", () => {
    const html = renderToStaticMarkup(React.createElement(Home));
    expect(html).toContain("provenance layer for agentic AI");
    expect(html).toContain("think on 0G");
    expect(html).toContain("lives on 0G");
    expect(html).toContain("Enter Civilization");
    expect(html).toContain('href="/citizens/ada"');
  });
});
