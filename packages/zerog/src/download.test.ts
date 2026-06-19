import { describe, it, expect } from "vitest";
import { parseArchivedTrace } from "./download";
import { ZeroGStorageError } from "./errors";

function envelope(obj: unknown): Uint8Array {
  return new TextEncoder().encode(JSON.stringify(obj));
}

describe("parseArchivedTrace", () => {
  it("reverses the {key,data} archive envelope", () => {
    const bytes = envelope({ key: "trace/d1", data: { decision: "invest", meta: { verified: true } } });
    const rec = parseArchivedTrace(bytes);
    expect(rec.key).toBe("trace/d1");
    expect((rec.data as any).decision).toBe("invest");
    expect((rec.data as any).meta.verified).toBe(true);
  });

  it("throws ZeroGStorageError on non-JSON bytes", () => {
    expect(() => parseArchivedTrace(new TextEncoder().encode("not json"))).toThrow(ZeroGStorageError);
  });

  it("throws ZeroGStorageError when the envelope lacks key/data", () => {
    expect(() => parseArchivedTrace(envelope({ nope: 1 }))).toThrow(ZeroGStorageError);
  });
});
