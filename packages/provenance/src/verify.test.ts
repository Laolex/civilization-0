import { describe, it, expect } from "vitest";
import type { Downloader } from "@civ/zerog";
import { verifyRecord } from "./verify";
import type { ProvenanceRecord } from "./provenance";

const record: ProvenanceRecord = {
  schema: "civ.provenance/v0",
  agent: "trading-agent-01",
  question: "Should I open a long on ETH right now?",
  decision: { action: "open_long", targetId: null, reasoning: "momentum" },
  drivers: { memories: [{ id: "m1", weight: 0.8 }], beliefs: [{ id: "b1", weight: 0.6 }] },
  meta: { provider: "0xprovider", model: "qwen-test", verified: true },
};

// A downloader that returns exactly what ZeroGStorage archives:
// JSON.stringify({ key, data }).
function fakeDownloader(envelope: unknown): Downloader {
  return {
    async download() {
      return new TextEncoder().encode(JSON.stringify(envelope));
    },
  };
}

describe("verifyRecord", () => {
  it("recovers the archived provenance record from 0G Storage bytes", async () => {
    const dl = fakeDownloader({ key: "provenance/prov-1", data: record });
    const recovered = await verifyRecord(dl, "0xroot");
    expect(recovered).toEqual(record);
  });

  it("rejects an archived object that is not a provenance record", async () => {
    const dl = fakeDownloader({ key: "trace/x", data: { decision: "invest" } });
    await expect(verifyRecord(dl, "0xroot")).rejects.toThrow(/provenance/i);
  });
});
