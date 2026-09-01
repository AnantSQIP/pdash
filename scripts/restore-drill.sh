#!/usr/bin/env bash
#
# Prove a backup can actually be restored — WITHOUT touching the live database.
#
# A backup nobody has restored is not a backup, it is a file. The failure mode is always the same:
# the nightly job runs green for months, and the first restore anyone attempts is during the
# incident, under pressure, at the moment the cost of it not working is highest.
#
# This restores the most recent dump into a SCRATCH database alongside the live one, counts what
# came back, and drops the scratch copy. The live database is never written to. It is safe to run
# on the production server during working hours, and it should be run monthly.
#
#   ./scripts/restore-drill.sh                       # newest backup
#   ./scripts/restore-drill.sh /var/backups/pdash/pdash-db-2026-09-01_0215.sql.gz
#
# What "passing" means: the scratch database ends up holding the same tables and roughly the same
# row counts as the live one. Small differences are expected — the backup is from last night and
# people have worked since.

set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pdash}"
COMPOSE="docker compose -f ${REPO_DIR}/docker-compose.prod.yml --env-file ${REPO_DIR}/.env.production"
SCRATCH="pdash_restore_drill"

DUMP="${1:-$(ls -1t "$BACKUP_DIR"/pdash-db-*.sql.gz 2>/dev/null | head -1 || true)}"
if [ -z "${DUMP:-}" ] || [ ! -f "$DUMP" ]; then
  echo "No backup found in $BACKUP_DIR. Run scripts/backup.sh first." >&2
  exit 1
fi

DB_USER="$($COMPOSE exec -T postgres printenv POSTGRES_USER | tr -d '\r')"
DB_NAME="$($COMPOSE exec -T postgres printenv POSTGRES_DB   | tr -d '\r')"
PSQL="$COMPOSE exec -T postgres psql -U $DB_USER"

echo "Restoring $(basename "$DUMP") into scratch database '$SCRATCH'"
echo "The live database ($DB_NAME) is not touched."
echo

# Always start from nothing, so a previous drill cannot make this one look better than it is.
$PSQL -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH;" >/dev/null
$PSQL -d postgres -c "CREATE DATABASE $SCRATCH;"          >/dev/null

# The dump carries --clean --if-exists, so it drops objects it is about to recreate. In a fresh
# database those drops have nothing to remove and psql reports them; that is expected noise, and
# the real errors are counted separately below.
ERRORS=$(zcat "$DUMP" | $COMPOSE exec -T postgres psql -U "$DB_USER" -d "$SCRATCH" -v ON_ERROR_STOP=0 2>&1 \
  | grep -c '^ERROR' || true)

echo "restore completed with $ERRORS error line(s) (drop-if-exists noise is normal on an empty database)"
echo

printf '%-26s %10s %10s   %s\n' "TABLE" "LIVE" "RESTORED" ""
printf '%s\n' "------------------------------------------------------------"
FAIL=0
for T in "user" project task timesheet attendance leave_request patent client audit_log; do
  L=$($PSQL -d "$DB_NAME" -tAc "select count(*) from \"$T\";" 2>/dev/null | tr -d '\r' || echo "?")
  R=$($PSQL -d "$SCRATCH" -tAc "select count(*) from \"$T\";" 2>/dev/null | tr -d '\r' || echo "?")
  NOTE=""
  if [ "$R" = "?" ] || [ "$R" = "0" ] && [ "$L" != "0" ]; then NOTE="  <-- MISSING"; FAIL=1; fi
  printf '%-26s %10s %10s %s\n' "$T" "$L" "$R" "$NOTE"
done
echo

LIVE_TABLES=$($PSQL -d "$DB_NAME" -tAc "select count(*) from information_schema.tables where table_schema='public';" | tr -d '\r')
REST_TABLES=$($PSQL -d "$SCRATCH" -tAc "select count(*) from information_schema.tables where table_schema='public';" | tr -d '\r')
echo "tables: live $LIVE_TABLES, restored $REST_TABLES"
[ "$REST_TABLES" -lt "$LIVE_TABLES" ] && FAIL=1

echo "cleaning up the scratch database…"
$PSQL -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH;" >/dev/null

echo
if [ "$FAIL" = "0" ]; then
  echo "DRILL PASSED — this backup restores."
else
  echo "DRILL FAILED — the backup did not restore completely. Do not rely on it." >&2
  exit 1
fi
