// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { SocialDrivers } from "./SocialDrivers";
import type { SocialDriverView } from "../lib/types";

const drivers: SocialDriverView[] = [
  { id: "marcus", name: "Marcus Vale", relationshipStrength: 0.68, relevance: 0.46, blendedScore: 0.31, trust: 71, influence: 65, neighborText: "Marcus invests steadily" },
  { id: "lena", name: "Lena Cho", relationshipStrength: 0.68, relevance: 0.10, blendedScore: 0.07, trust: 70, influence: 66, neighborText: "Lena is cautious" },
];

describe("SocialDrivers", () => {
  it("renders one row per driver with the blended math", () => {
    render(<SocialDrivers drivers={drivers} socialQuery="who do I trust on risk?" />);
    expect(screen.getByText("Marcus Vale")).toBeDefined();
    expect(screen.getByText("Lena Cho")).toBeDefined();
    expect(screen.getByText(/0\.31/)).toBeDefined(); // blended score shown
  });

  it("reveals raw recompute inputs on toggle", () => {
    render(<SocialDrivers drivers={drivers} socialQuery="who do I trust on risk?" />);
    expect(screen.queryByText("Marcus invests steadily")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /recompute/i }));
    expect(screen.getByText("Marcus invests steadily")).toBeDefined();
  });
});
