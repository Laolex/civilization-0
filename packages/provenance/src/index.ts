// Pure, network-free surface (safe to import anywhere):
export * from "./provenance";
export * from "./verify";

// Real 0G wiring. Importing these pulls the 0G SDKs; the write path's compute
// SDK has a broken ESM build, so run consumers with `tsx --conditions require`.
export { createProvenance, type CreateProvenanceOptions } from "./real";
export { createVerifier } from "./real-verify";
