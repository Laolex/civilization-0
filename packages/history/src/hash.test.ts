import { describe, it, expect } from "vitest";
import { canonicalJSON } from "./hash";
import { sha256Hex, eventHash, merkleRoot } from "./hash";
import { verifyChain } from "./hash";
import { GENESIS_PARENT, SCHEMA_VERSION, type CognitiveTransition, type HistoryEvent } from "./index";

describe("canonicalJSON", () => {
  it("is key-order independent", () => {
    expect(canonicalJSON({ b: 1, a: 2 })).toBe(canonicalJSON({ a: 2, b: 1 }));
  });
  it("sorts nested keys and preserves array order", () => {
    expect(canonicalJSON({ z: { y: 1, x: 2 }, a: [3, 1, 2] }))
      .toBe('{"a":[3,1,2],"z":{"x":2,"y":1}}');
  });
  it("serializes null/bool/number/string deterministically", () => {
    expect(canonicalJSON({ n: null, t: true, i: 42, s: "hi" }))
      .toBe('{"i":42,"n":null,"s":"hi","t":true}');
  });
  it("omits undefined object properties", () => {
    expect(canonicalJSON({ a: 1, b: undefined })).toBe('{"a":1}');
  });
});

function fakeCT(over: Partial<CognitiveTransition> = {}): CognitiveTransition {
  return {
    header: { eventId: "e1", parentHash: GENESIS_PARENT, worldId: "w1", tickId: 1,
      engineVersion: "test", schemaVersion: SCHEMA_VERSION, timestamp: "2026-06-27T00:00:00.000Z" },
    actor: "c1", observation: { query: "q" }, retrievedMemories: [], retrievedBeliefs: [],
    socialDrivers: [], availableActions: ["work"], selectedAction: "work", reasoning: "r",
    worldDelta: { relationshipsChanged: [], wealthTransferred: [], eventsCreated: [] },
    execution: { provider: "p", modelId: "m", modelVersion: "v", promptHash: "0x1",
      worldHash: "0x2", verified: true },
    candidates: null, beliefDelta: null, ...over,
  };
}

describe("eventHash", () => {
  it("sha256Hex is a 0x-prefixed 64-hex digest", () => {
    const h = sha256Hex("abc");
    expect(h).toMatch(/^0x[0-9a-f]{64}$/);
  });
  it("is deterministic for equal events", () => {
    expect(eventHash(fakeCT())).toBe(eventHash(fakeCT()));
  });
  it("changes when the payload changes", () => {
    expect(eventHash(fakeCT())).not.toBe(eventHash(fakeCT({ reasoning: "different" })));
  });
  it("changes when the parentHash changes", () => {
    const a = fakeCT();
    const b = fakeCT({ header: { ...a.header, parentHash: sha256Hex("x") } });
    expect(eventHash(a)).not.toBe(eventHash(b));
  });
});

describe("merkleRoot", () => {
  it("is deterministic", () => {
    const hs = [sha256Hex("a"), sha256Hex("b"), sha256Hex("c")];
    expect(merkleRoot(hs)).toBe(merkleRoot(hs));
  });
  it("is order-sensitive", () => {
    expect(merkleRoot([sha256Hex("a"), sha256Hex("b")]))
      .not.toBe(merkleRoot([sha256Hex("b"), sha256Hex("a")]));
  });
  it("returns the single leaf unchanged", () => {
    const h = sha256Hex("only");
    expect(merkleRoot([h])).toBe(h);
  });
});

function chainOf(cts: CognitiveTransition[]) {
  let parent = GENESIS_PARENT;
  return cts.map((raw) => {
    const ev = { ...raw, header: { ...raw.header, parentHash: parent } };
    const h = eventHash(ev);
    const row = { event: ev as HistoryEvent, eventHash: h, parentHash: parent };
    parent = h;
    return row;
  });
}

describe("verifyChain", () => {
  it("accepts a well-formed chain", () => {
    const rows = chainOf([fakeCT({ header: undefined as never }), fakeCT()]
      .map((_, i) => fakeCT({ reasoning: `r${i}` })));
    expect(verifyChain(rows).ok).toBe(true);
  });
  it("detects a tampered payload", () => {
    const rows = chainOf([fakeCT({ reasoning: "a" }), fakeCT({ reasoning: "b" })]);
    (rows[1].event as CognitiveTransition).reasoning = "TAMPERED";
    const r = verifyChain(rows);
    expect(r.ok).toBe(false);
    expect(r.brokenAt).toBe(1);
  });
  it("detects a broken parent link", () => {
    const rows = chainOf([fakeCT({ reasoning: "a" }), fakeCT({ reasoning: "b" })]);
    rows[1].parentHash = sha256Hex("wrong");
    (rows[1].event as CognitiveTransition).header.parentHash = rows[1].parentHash;
    rows[1].eventHash = eventHash(rows[1].event);
    expect(verifyChain(rows).ok).toBe(false);
  });
});
