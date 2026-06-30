#!/usr/bin/env bash
# Runs ONE real scheduler tick iff a tick_request is pending, never overlapping
# the 2h scheduler (shared lock). Env (DATABASE_URL etc.) is supplied by systemd.
set -uo pipefail
ROOT="${CIV0_ROOT:-/opt/civilization-0}"
LOCK="${CIV0_LOCK:-/run/civ0-scheduler.lock}"
# tsx is a dependency of the scheduler package and is NOT resolvable from the
# workspace root, so every pnpm/tsx call must run with -C on the package dir
# (same as the run-scheduler invocation below). Running from $ROOT fails with
# "Command tsx not found", which the old code silently swallowed into "0 pending".
SCHED="$ROOT/packages/scheduler"

# Detector exit code: 0 = >=1 pending tick_request, 1 = none, 2 = error.
pnpm -s -C "$SCHED" exec tsx scripts/has-pending-tick-request.ts >/dev/null 2>&1
rc=$?
if [ "$rc" -eq 1 ]; then
  echo "no pending tick_request"
  exit 0
fi
if [ "$rc" -ne 0 ]; then
  # Do NOT treat a detector failure as "nothing to do" — leave the request
  # pending and retry next cycle rather than silently dropping it.
  echo "tick-request detector failed (rc=$rc) — skipping this cycle" >&2
  exit 0
fi

echo "pending tick_request — running one tick"
flock -n "$LOCK" pnpm -C "$SCHED" exec tsx --conditions require scripts/run-scheduler.ts --days 1 \
  || echo "drain skipped (lock busy or balance floor)"
exit 0
