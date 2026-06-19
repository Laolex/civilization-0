/**
 * LIVE end-to-end proof of @civ/provenance against real 0G.
 *   1. createProvenance() wires a real 0G Compute brain + 0G Storage.
 *   2. civ.trace() reasons on 0G Compute and archives the record on 0G Storage.
 *   3. createVerifier() (KEYLESS) downloads + recovers the record by root hash.
 *
 * Run: pnpm -C /opt/civilization-0/packages/provenance exec \
 *        tsx --conditions require scripts/smoke-trace.ts
 *
 * NEVER prints the private key.
 */
import { createProvenance } from "../src/real";
import { createVerifier } from "../src/real-verify";

// Env (ZG_PRIVATE_KEY, ZG_COMPUTE_PROVIDER, …) is sourced from .env by the
// caller, so process.env is already populated.

async function main() {
  const civ = await createProvenance({ verifyBaseUrl: "https://verify.civ0.xyz" });

  const result = await civ.trace({
    agent: "trading-agent-01",
    question: "ETH just broke resistance at $3.2k on rising volume. Open a long, short, or hold?",
    occupation: "autonomous trading agent",
    memories: [
      { id: "m1", summary: "ETH broke $3.2k resistance on above-average volume", importance: 8 },
      { id: "m2", summary: "Funding rates are mildly positive but not extreme", importance: 5 },
      { id: "m3", summary: "An unrelated NFT mint is trending on social", importance: 2 },
    ],
    beliefs: [
      { id: "b1", statement: "breakouts on volume tend to follow through short-term", confidence: 0.7 },
      { id: "b2", statement: "chasing green candles late is how you get wicked", confidence: 0.6 },
    ],
    actions: ["open_long", "open_short", "hold"],
  });

  console.log("decision:", JSON.stringify(result.decision));
  console.log("drivers:", JSON.stringify(result.drivers));
  console.log("verified (0G Compute):", result.verified);
  console.log("rootHash (0G Storage):", result.rootHash);
  console.log("txHash:", result.txHash);
  console.log("verifyUrl:", result.verifyUrl);

  if (!result.verified) throw new Error("ASSERT FAILED: compute result not verified");
  if (!result.rootHash) throw new Error("ASSERT FAILED: no storage root hash");
  if (result.drivers.memories.length === 0) throw new Error("ASSERT FAILED: no memory drivers recorded");

  console.log("\n--- KEYLESS VERIFY (download from 0G Storage by root hash) ---");
  const verify = createVerifier();
  const recovered = await verify(result.rootHash);
  console.log("recovered.schema:", recovered.schema);
  console.log("recovered.decision:", JSON.stringify(recovered.decision));
  console.log("recovered.drivers:", JSON.stringify(recovered.drivers));

  if (recovered.schema !== "civ.provenance/v0") throw new Error("ASSERT FAILED: bad schema");
  if (recovered.decision.action !== result.decision.action) throw new Error("ASSERT FAILED: decision mismatch");

  console.log("\nLIVE PROOF OK: reasoned on 0G Compute, archived on 0G Storage, recovered keyless.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
