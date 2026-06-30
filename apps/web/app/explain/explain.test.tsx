// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { ExplainPanel } from "./ExplainPanel";
import type { ExplainView } from "@civ/history/src/types";

const base: ExplainView = {
  world: "w1", citizen: "c1", tick: 5, observation: { query: "save up" },
  retrievedMemories: [], retrievedBeliefs: [], socialDrivers: [], availableActions: ["work"],
  selectedAction: "work", reasoning: "r", worldDelta: null,
  execution: { provider: "0g-compute", modelId: "llama", modelVersion: "v", promptHash: "", worldHash: "", verified: true },
  candidates: "unavailable", beliefDelta: "unavailable",
  eventHash: "0xaa", parentHash: "0x00", chainVerified: true, anchor: null,
};

describe("ExplainPanel", () => {
  it("renders 'unavailable' for null cognition (Invariant #1)", () => {
    render(<ExplainPanel view={base} />);
    // candidates + beliefΔ are the two unauthenticated 1A fields — both must say "unavailable", never fabricated.
    expect(screen.getAllByText(/unavailable/i).length).toBeGreaterThanOrEqual(2);
  });

  it("shows the chain-verified badge and the authenticated selected action", () => {
    render(<ExplainPanel view={base} />);
    expect(screen.getByText(/chain verified/i)).toBeTruthy();
    expect(screen.getByTestId("explain-selected").textContent).toContain("work");
  });

  it("marks a broken chain when chainVerified is false", () => {
    render(<ExplainPanel view={{ ...base, chainVerified: false }} />);
    expect(screen.getByText(/chain broken/i)).toBeTruthy();
  });
});
