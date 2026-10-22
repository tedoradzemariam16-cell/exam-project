#!/usr/bin/env bash
# Runs the SQL migrations and database tests against a throwaway local
# PostgreSQL cluster. Requires PostgreSQL 15+ binaries (initdb, pg_ctl, psql).
set -euo pipefail
cd "$(dirname "$0")/../.."

PG_BIN="${PG_BIN:-$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1)}"
WORK="$(mktemp -d)"
PORT="${PG_TEST_PORT:-54329}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  chown postgres "$WORK"
  RUN_AS=(su postgres -c)
fi
run() { if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }

cleanup() { run "$PG_BIN/pg_ctl -D $WORK/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$WORK"; }
trap cleanup EXIT

run "$PG_BIN/initdb -D $WORK/data -A trust -U postgres" >/dev/null
run "$PG_BIN/pg_ctl -D $WORK/data -o '-p $PORT -k $WORK -c listen_addresses=' -l $WORK/log -w start" >/dev/null

PSQL=(psql -h "$WORK" -p "$PORT" -U postgres -d postgres -v ON_ERROR_STOP=1 -q -X -o /dev/null)
"${PSQL[@]}" -f tests/db/supabase_stub.sql
for f in supabase/migrations/*.sql; do
  echo "migrate: $f"
  "${PSQL[@]}" -f "$f"
done
for t in tests/db/*.test.sql; do
  echo "test: $t"
  "${PSQL[@]}" -f "$t"
done
echo "All database tests passed."
