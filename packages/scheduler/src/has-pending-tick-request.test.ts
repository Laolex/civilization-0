import { describe, it, expect } from "vitest";
import { countPendingTickRequests } from "../scripts/has-pending-tick-request";
import type { Intervention } from "@civ/persistence/src/intervention-write";

const iv = (type: string): Intervention => ({
  id: type, worldId: "w1", userId: "u1", type, targetCitizenId: null, payload: {},
  status: "pending", appliedDay: null });

describe("countPendingTickRequests", () => {
  it("counts only tick_request rows", () => {
    expect(countPendingTickRequests([iv("tick_request"), iv("whisper"), iv("tick_request")])).toBe(2);
  });
  it("returns 0 when none", () => {
    expect(countPendingTickRequests([iv("whisper")])).toBe(0);
  });
});
