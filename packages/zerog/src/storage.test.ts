import { describe, it, expect } from "vitest";
import { ZeroGStorage, type Uploader } from "./storage";
import { ZeroGStorageError } from "./errors";

class FakeUploader implements Uploader {
  calls: Uint8Array[] = [];
  constructor(private impl: () => Promise<{ rootHash: string; txHash: string }>) {}
  async upload(bytes: Uint8Array) { this.calls.push(bytes); return this.impl(); }
}

describe("ZeroGStorage", () => {
  it("serializes {key,data}, uploads, and maps to ArchiveResult", async () => {
    const up = new FakeUploader(async () => ({ rootHash: "0xroot", txHash: "0xtx" }));
    const s = new ZeroGStorage(up);
    expect(s.name).toBe("0g-storage");
    const r = await s.archive("event/e1", { type: "start_company" });
    expect(r).toMatchObject({ rootHash: "0xroot", txHash: "0xtx" });
    expect(typeof r.ts).toBe("number");
    const sent = JSON.parse(new TextDecoder().decode(up.calls[0]));
    expect(sent).toEqual({ key: "event/e1", data: { type: "start_company" } });
  });

  it("wraps uploader failures in ZeroGStorageError", async () => {
    const up = new FakeUploader(async () => { throw new Error("net down"); });
    const s = new ZeroGStorage(up);
    const err = await s.archive("k", {}).catch((e) => e);
    expect(err).toBeInstanceOf(ZeroGStorageError);
    expect((err.cause as Error).message).toBe("net down");
  });
});
