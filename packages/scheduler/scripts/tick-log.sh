#!/usr/bin/env bash
# Lightweight autonomy monitor. Invoked by the scheduler service's ExecStopPost,
# so it runs after EVERY tick — clean success, non-zero exit, OR a TimeoutStartSec
# kill on a wedged 0G upload. Appends one line to tick.log with the systemd
# result and the world's current day + event count (pulled straight from the DB),
# so progress (or a stall) is visible at a glance:  tail -f /opt/civilization-0/tick.log
set -uo pipefail
LOG=/opt/civilization-0/tick.log
TS=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
RESULT="${SERVICE_RESULT:-unknown}"   # systemd sets this: success | timeout | exit-code | signal | ...
# node-postgres accepts sslmode=no-verify (skip CA check); libpq/psql does not —
# map it to libpq's "require" (encrypt, don't verify) so this log query connects.
PSQL_URL="${DATABASE_URL/sslmode=no-verify/sslmode=require}"
DAY=$(psql "$PSQL_URL" -tAc "SELECT day FROM world_state WHERE id=1" 2>/dev/null | tr -d '[:space:]')
EVENTS=$(psql "$PSQL_URL" -tAc "SELECT count(*) FROM events" 2>/dev/null | tr -d '[:space:]')
printf '%s  result=%-9s day=%-4s events=%s\n' "$TS" "$RESULT" "${DAY:-?}" "${EVENTS:-?}" >> "$LOG"
