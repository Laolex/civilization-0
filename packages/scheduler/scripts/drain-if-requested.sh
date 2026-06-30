#!/usr/bin/env bash
# Runs ONE real scheduler tick iff a tick_request is pending, never overlapping
# the 2h scheduler (shared lock). Env (DATABASE_URL etc.) is supplied by systemd.
set -uo pipefail
ROOT="${CIV0_ROOT:-/opt/civilization-0}"
LOCK="${CIV0_LOCK:-/run/civ0-scheduler.lock}"

count="$(pnpm -s -C "$ROOT" exec tsx "$ROOT/packages/scheduler/scripts/has-pending-tick-request.ts" --count 2>/dev/null || echo 0)"
if [ "${count:-0}" -le 0 ]; then
  echo "no pending tick_request"; exit 0
fi
echo "pending tick_request(s): $count — running one tick"
flock -n "$LOCK" pnpm -C "$ROOT/packages/scheduler" exec tsx --conditions require scripts/run-scheduler.ts --days 1 \
  || echo "drain skipped (lock busy or balance floor)"
exit 0
