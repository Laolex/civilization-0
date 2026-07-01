import { getPool } from "@civ/persistence";
import { proofB } from "../src/audit";

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--world");
  const world = i >= 0 ? args[i + 1] ?? "default" : "default";
  const r = await proofB(getPool(), world);
  console.log(r.ok ? `fold(genesis ⊕ events) == legacy ✓  (world ${world})`
    : `fold MISMATCH ✗  (world ${world})\n${JSON.stringify(r.mismatches, null, 2)}`);
  process.exit(r.ok ? 0 : 1);
}
if (import.meta.url === `file://${process.argv[1]}`) void main();
