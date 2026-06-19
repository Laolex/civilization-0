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
    { kind: "compute", title: "0G Compute", detail: { provider: "0xP", model: "qwen", verified: "true" } },
    { kind: "decision", title: "Decision", detail: { action: "invest", target: "marcus", reasoning: "trust" } },
    { kind: "event", title: "Event", detail: { label: "Invest marcus", day: "12" } },
    { kind: "storage", title: "0G Storage", detail: { rootHash: "0xroot", txHash: "0xtx" } },
  ],
};

describe("CausalChain", () => {
  it("renders all node titles in order", () => {
    render(<CausalChain chain={chain} />);
    for (const n of chain.nodes) expect(screen.getByText(n.title)).toBeDefined();
  });

  it("reveals detail on click", () => {
    render(<CausalChain chain={chain} />);
    expect(screen.queryByText("Marcus is trustworthy")).toBeNull();
    fireEvent.click(screen.getByText("Belief b1"));
    expect(screen.getByText("Marcus is trustworthy")).toBeDefined();
  });
});
