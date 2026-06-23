import { describe, it, expect } from "vitest";
import { canIntervene } from "./intervention-authz";

const owner = { id: "u1", plan: "free" };
const other = { id: "u2", plan: "free" };
const proOther = { id: "u2", plan: "pro" };

describe("canIntervene", () => {
  it("allows the owner of a private world regardless of plan", () => {
    expect(canIntervene(owner, { id: "w1", ownerId: "u1" })).toBe(true);
  });
  it("denies a non-owner on a world they don't own", () => {
    expect(canIntervene(other, { id: "w1", ownerId: "u1" })).toBe(false);
  });
  it("allows premium plans on the shared world", () => {
    expect(canIntervene(proOther, { id: "genesis", ownerId: null })).toBe(true);
  });
  it("denies free plans on the shared world", () => {
    expect(canIntervene(other, { id: "genesis", ownerId: null })).toBe(false);
  });
});
