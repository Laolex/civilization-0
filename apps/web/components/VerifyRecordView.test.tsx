// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import React from "react";
import type { ProvenanceRecord } from "@civ/provenance/src/record";
import { VerifyRecordView } from "./VerifyRecordView";

const record: ProvenanceRecord = {
  schema: "civ.provenance/v0",
  agent: "trading-agent-01",
  question: "ETH broke resistance — long, short, or hold?",
  decision: { action: "open_long", targetId: null, reasoning: "momentum looks durable" },
  drivers: { memories: [{ id: "m1", weight: 0.8 }], beliefs: [{ id: "b1", weight: 0.7 }] },
  meta: { provider: "0xprovider", model: "qwen-test", verified: true },
};

describe("VerifyRecordView", () => {
  it("shows the decision, agent, and reasoning recovered from 0G", () => {
    render(<VerifyRecordView record={record} rootHash="0x44c3cc04" />);
    expect(screen.getByText("open_long")).toBeDefined();
    expect(screen.getByText(/trading-agent-01/)).toBeDefined();
    expect(screen.getByText(/momentum looks durable/)).toBeDefined();
  });

  it("shows the brain-weighted drivers", () => {
    render(<VerifyRecordView record={record} rootHash="0x44c3cc04" />);
    expect(screen.getByText("m1")).toBeDefined();
    expect(screen.getByText("0.80")).toBeDefined();
    expect(screen.getByText("b1")).toBeDefined();
  });

  it("shows a verified-on-0G-Compute badge when meta.verified is true", () => {
    render(<VerifyRecordView record={record} rootHash="0x44c3cc04" />);
    expect(screen.getByText(/verified on 0G Compute/i)).toBeDefined();
  });
});
