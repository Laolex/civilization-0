import { describe, it, expect } from "vitest";
import { FakeStorage } from "./index";

describe("FakeStorage", () => {
  it("returns a deterministic content hash and records the call", async () => {
    const s = new FakeStorage();
    const r1 = await s.archive("event/evt_1", { type: "start_company" });
    const r2 = await s.archive("event/evt_1", { type: "start_company" });
    expect(r1.rootHash).toMatch(/^0xfake/);
    expect(r1.rootHash).toBe(r2.rootHash);
    expect(s.calls).toHaveLength(2);
    expect(s.calls[0].key).toBe("event/evt_1");
  });

  it("differs by content", async () => {
    const s = new FakeStorage();
    const a = await s.archive("k", { v: 1 });
    const b = await s.archive("k", { v: 2 });
    expect(a.rootHash).not.toBe(b.rootHash);
  });
});
