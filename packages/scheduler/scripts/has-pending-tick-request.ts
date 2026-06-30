import { pendingInterventions, type Intervention } from "@civ/persistence/src/intervention-write";
import { closePool } from "@civ/persistence";

export function countPendingTickRequests(pending: Intervention[]): number {
  return pending.filter((iv) => iv.type === "tick_request").length;
}

async function main() {
  const count = countPendingTickRequests(await pendingInterventions());
  await closePool();
  if (process.argv.includes("--count")) {
    process.stdout.write(String(count));
    process.exit(0);
  }
  process.exit(count > 0 ? 0 : 1);
}

// Only run when executed directly (not when imported by tests).
if (process.argv[1] && process.argv[1].endsWith("has-pending-tick-request.ts")) {
  main().catch((e) => { console.error(e); process.exit(2); });
}
