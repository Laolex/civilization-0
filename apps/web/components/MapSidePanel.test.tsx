// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import { MapSidePanel } from "./MapSidePanel";

afterEach(() => vi.unstubAllGlobals());

const chain = {
  decisionId: "d1", rootHash: "0xroot", txHash: "0xtx",
  nodes: [
    { kind: "social", title: "Social context", detail: { query: "q", neighbors: "1" },
      socialDrivers: [{ id: "marcus", name: "Marcus Vale", relationshipStrength: 0.68, relevance: 0.46, blendedScore: 0.31, trust: 71, influence: 65, neighborText: "steady" }],
      socialQuery: "q" },
    { kind: "decision", title: "Decision", detail: { action: "invest", target: "marcus", reasoning: "trust" } },
  ],
};

describe("MapSidePanel", () => {
  it("fetches and renders the citizen's chain", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true, chain }) }));
    render(<MapSidePanel citizenId="ada" name="Ada" onReplay={() => {}} onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText("Social context")).toBeDefined());
  });
});
