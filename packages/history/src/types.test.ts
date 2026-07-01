import { describe, it, expect } from "vitest";
import { SCHEMA_VERSION, CANON_VERSION, GENESIS_PARENT, eventKind } from "./index";
import type { CognitiveTransition, AnchorEvent, Genesis, WealthDelta, RelationshipDelta, OrganizationDelta } from "./index";

describe("history types", () => {
  it("pins schema + canon versions and genesis parent", () => {
    expect(SCHEMA_VERSION).toBe(2);
    expect(CANON_VERSION).toBe("jcs-1");
    expect(GENESIS_PARENT).toBe("0x" + "0".repeat(64));
  });

  it("discriminates event kinds", () => {
    const anchor = { merkleRoot: "0xab" } as AnchorEvent;
    const ct = { actor: "1" } as CognitiveTransition;
    expect(eventKind(anchor)).toBe("Anchor");
    expect(eventKind(ct)).toBe("CognitiveTransition");
  });
});

const hdr = (kind: string) => ({ eventId: `e-${kind}`, parentHash: GENESIS_PARENT, worldId: "w1",
  tickId: 1, engineVersion: "t", schemaVersion: SCHEMA_VERSION, timestamp: "2026-06-30T00:00:00.000Z" });

describe("1B event model", () => {
  it("bumps the schema version to 2", () => { expect(SCHEMA_VERSION).toBe(2); });

  it("discriminates all six kinds via the explicit discriminant", () => {
    const g = { kind: "Genesis", header: hdr("g") } as Genesis;
    const w = { kind: "WealthDelta", header: hdr("w") } as WealthDelta;
    const r = { kind: "RelationshipDelta", header: hdr("r") } as RelationshipDelta;
    const o = { kind: "OrganizationDelta", header: hdr("o") } as OrganizationDelta;
    expect(eventKind(g)).toBe("Genesis");
    expect(eventKind(w)).toBe("WealthDelta");
    expect(eventKind(r)).toBe("RelationshipDelta");
    expect(eventKind(o)).toBe("OrganizationDelta");
  });

  it("falls back structurally for v1 events with no kind discriminant", () => {
    const legacyCT = { header: hdr("ct"), actor: "c1" } as unknown as CognitiveTransition; // no `kind`
    const legacyAnchor = { header: hdr("a"), merkleRoot: "0xab" } as unknown as { merkleRoot: string };
    expect(eventKind(legacyCT as any)).toBe("CognitiveTransition");
    expect(eventKind(legacyAnchor as any)).toBe("Anchor");
  });
});
