import { describe, it, expect } from "vitest";
import { SCHEMA_VERSION, CANON_VERSION, GENESIS_PARENT, eventKind } from "./index";
import type { CognitiveTransition, AnchorEvent } from "./index";

describe("history types", () => {
  it("pins schema + canon versions and genesis parent", () => {
    expect(SCHEMA_VERSION).toBe(1);
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
