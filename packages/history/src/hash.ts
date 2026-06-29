import { createHash } from "node:crypto";
import type { HistoryEvent, Hash } from "./types";

/**
 * Deterministic, language-independent JSON canonicalization (JCS / RFC 8785 intent).
 * Object keys sorted lexicographically (by UTF-16 code unit, matching Array.sort default,
 * which is sufficient for our ASCII keys); arrays keep order; undefined props omitted.
 * NEVER replace this with a bare JSON.stringify for hashing — key order/number formatting
 * are not stable across runtimes and a non-canonical hash silently breaks replay.
 */
export function canonicalJSON(value: unknown): string {
  if (value === null) return "null";
  const t = typeof value;
  if (t === "number") {
    if (!Number.isFinite(value as number)) throw new Error("canonicalJSON: non-finite number");
    return JSON.stringify(value);
  }
  if (t === "boolean" || t === "string") return JSON.stringify(value);
  if (Array.isArray(value)) return "[" + value.map((v) => canonicalJSON(v ?? null)).join(",") + "]";
  if (t === "object") {
    const obj = value as Record<string, unknown>;
    const keys = Object.keys(obj).filter((k) => obj[k] !== undefined).sort();
    return "{" + keys.map((k) => JSON.stringify(k) + ":" + canonicalJSON(obj[k])).join(",") + "}";
  }
  throw new Error(`canonicalJSON: unsupported type ${t}`);
}

export function sha256Hex(input: string): Hash {
  return "0x" + createHash("sha256").update(input, "utf8").digest("hex");
}

/** eventHash = sha256( canon(header) ‖ canon(payload) ), payload = event minus header. */
export function eventHash(event: HistoryEvent): Hash {
  const { header, ...payload } = event;
  return sha256Hex(canonicalJSON(header) + "\n" + canonicalJSON(payload));
}
