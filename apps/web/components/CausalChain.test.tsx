// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { CausalChain } from "./CausalChain";
import type { CausalChainView } from "../lib/types";

const chain: CausalChainView = {
  decisionId: "d1",
  rootHash: "0xroot", txHash: "0xtx",
  nodes: [
    { kind: "memory", title: "Memory m1", weight: 0.6, detail: { summary: "Marcus helped me", weight: "0.60" } },
    { kind: "belief", title: "Belief b1", weight: 0.8, detail: { statement: "Marcus is trustworthy", weight: "0.80" } },
    { kind: "social", title: "Social context", weight: 0.31, detail: { query: "who do I trust on risk?", neighbors: "1" },
      socialDrivers: [{ id: "marcus", name: "Marcus Vale", relationshipStrength: 0.68, relevance: 0.46, blendedScore: 0.31, trust: 71, influence: 65, neighborText: "Marcus invests steadily" }],
      socialQuery: "who do I trust on risk?" },
    { kind: "compute", title: "0G Compute", detail: { provider: "0xP", model: "qwen", verified: "true" } },
    { kind: "decision", title: "Decision", detail: { action: "invest", target: "marcus", reasoning: "trust" } },
    { kind: "event", title: "Event", detail: { label: "Invest marcus", day: "12" } },
    { kind: "storage", title: "0G Storage", detail: { rootHash: "0xroot", txHash: "0xtx" } },
  ],
};

describe("CausalChain", () => {
  it("renders all node titles in order", () => {
    render(<CausalChain chain={chain} />);
    // Query all data-title elements in DOM order and assert they match the causal sequence
    const titles = screen.getAllByText(/./, { selector: "[data-title]" }).map((el) => el.textContent);
    expect(titles).toEqual(chain.nodes.map((n) => n.title));
  });

  it("reveals detail on click", () => {
    render(<CausalChain chain={chain} />);
    expect(screen.queryByText("Marcus is trustworthy")).toBeNull();
    fireEvent.click(screen.getByText("Belief b1"));
    expect(screen.getByText("Marcus is trustworthy")).toBeDefined();
  });

  it("renders the social node body on click", () => {
    render(<CausalChain chain={chain} />);
    fireEvent.click(screen.getByText("Social context"));
    expect(screen.getByText("Marcus Vale")).toBeDefined();
  });
});
