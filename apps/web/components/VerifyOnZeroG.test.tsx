// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { VerifyOnZeroG } from "./VerifyOnZeroG";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("VerifyOnZeroG — render smoke", () => {
  it("renders the Verify on 0G button initially", () => {
    render(<VerifyOnZeroG rootHash="0xdeadbeef" />);
    expect(screen.getByRole("button", { name: /verify on 0g/i })).toBeDefined();
  });

  it("shows loading state while fetching", async () => {
    // Fetch that never resolves
    vi.stubGlobal(
      "fetch",
      vi.fn(() => new Promise(() => {})),
    );
    render(<VerifyOnZeroG rootHash="0xdeadbeef" />);
    fireEvent.click(screen.getByRole("button", { name: /verify on 0g/i }));
    await waitFor(() =>
      expect(screen.getByRole("button", { name: /retrieving from 0g/i })).toBeDefined(),
    );
  });

  it("shows verified panel after successful fetch", async () => {
    const mockExcerpt = { decision: "invest", verified: true };
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          json: () =>
            Promise.resolve({
              ok: true,
              key: "trace/ada/decision-1",
              bytes: 549,
              excerpt: mockExcerpt,
            }),
        }),
      ),
    );

    render(<VerifyOnZeroG rootHash="0x1b53d66c" />);
    fireEvent.click(screen.getByRole("button", { name: /verify on 0g/i }));
    await waitFor(() =>
      expect(screen.getByText(/✓ Verified on 0G Testnet/)).toBeDefined(),
    );
    // The excerpt JSON is rendered in a <pre>
    expect(screen.getByText(/"decision": "invest"/)).toBeDefined();
    expect(screen.getByText(/"verified": true/)).toBeDefined();
  });

  it("shows error message on fetch failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          json: () =>
            Promise.resolve({ ok: false, error: "0G Storage download failed" }),
        }),
      ),
    );

    render(<VerifyOnZeroG rootHash="0xdeadbeef" />);
    fireEvent.click(screen.getByRole("button", { name: /verify on 0g/i }));
    await waitFor(() =>
      expect(screen.getByText(/Could not reach 0G Storage/)).toBeDefined(),
    );
  });

  it("shows social drivers after successful fetch with socialDrivers", async () => {
    const excerpt = {
      decision: { action: "invest", targetId: "marcus" },
      verified: true,
      socialQuery: "who do I trust on risk?",
      socialDrivers: [
        {
          id: "marcus",
          name: "Marcus Vale",
          relationshipStrength: 0.68,
          relevance: 0.46,
          blendedScore: 0.31,
          trust: 71,
          influence: 65,
          neighborText: "steady",
        },
      ],
      orgDriver: null,
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(() =>
        Promise.resolve({
          json: () =>
            Promise.resolve({ ok: true, key: "k", bytes: 100, excerpt }),
        }),
      ),
    );

    render(<VerifyOnZeroG rootHash="0xabc123" />);
    fireEvent.click(screen.getByRole("button", { name: /verify on 0g/i }));
    expect(await screen.findByText("Marcus Vale")).toBeDefined();
  });
});
