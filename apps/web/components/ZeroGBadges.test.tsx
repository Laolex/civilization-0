// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ZeroGBadges } from "./ZeroGBadges";

describe("ZeroGBadges", () => {
  it("shows both badges and a verify link when a root hash is present", () => {
    render(<ZeroGBadges rootHash="0xabc" verified />);
    expect(screen.getByText(/0G Compute/)).toBeTruthy();
    const storage = screen.getByText(/0G Storage/).closest("a");
    expect(storage?.getAttribute("href")).toBe("/verify/0xabc");
  });
  it("renders nothing when no provenance", () => {
    const { container } = render(<ZeroGBadges rootHash={null} verified={false} />);
    expect(container.textContent).toBe("");
  });
});
