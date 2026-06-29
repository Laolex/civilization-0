import { describe, it, expect } from "vitest";
import { canonicalJSON } from "./hash";

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
