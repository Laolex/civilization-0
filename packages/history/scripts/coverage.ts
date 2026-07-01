import { getPool } from "@civ/persistence";
import { coverage } from "../src/audit";

async function main() {
  const args = process.argv.slice(2);
  const i = args.indexOf("--world");
  const world = i >= 0 ? args[i + 1] ?? "default" : "default";
  const cov = await coverage(getPool(), world);
  console.log(`WORLD ${world}`);
  for (const [dim, frac] of Object.entries(cov)) console.log(`${dim.padEnd(14)} ${(frac * 100).toFixed(1)}%`);
  process.exit(0);
}
if (import.meta.url === `file://${process.argv[1]}`) void main();
