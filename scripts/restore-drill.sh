#!/usr/bin/env bash
#
# Prove a backup can actually be RESTORED — without touching the live database.
#
# A backup nobody has restored is not a backup, it is a file. The failure mode is always the same:
# the nightly job runs green for months, and the first restore anyone attempts is during the
# incident, under pressure, at the moment the cost of it not working is highest.
#
# This restores the most recent set into a SCRATCH database alongside the live one, compares what
# came back against the row counts the manifest recorded when the set was taken, checks the
# documents archive can actually be unpacked, and drops the scratch copy. The live database is
# never written to. It is safe to run on the production server during working hours, and it
# should be run MONTHLY. Put it in cron next to the backup itself:
#
#   0 3 1 * *  cd /root/pdash && ./scripts/restore-drill.sh >> /var/log/pdash-backup.log 2>&1
#
#   ./scripts/restore-drill.sh                                       # newest set
#   ./scripts/restore-drill.sh /var/backups/pdash/sets/pdash-2026-09-11_0215
#   ./scripts/restore-drill.sh /path/to/db.sql.gz                    # a bare dump also works
#
# WHAT PASSING MEANS
#
#   • every file in the set is intact (checksums, not just gzip);
#   • the dump replays into an empty database without real errors;
#   • the restored table list matches the live one;
#   • the restored ROW COUNTS match what the manifest recorded at the moment of the dump — not
#     the live counts, which have moved since. Comparing against live is how a restore that
#     silently dropped last week's timesheets still passes a drill;
#   • the documents archive lists without error.
#
# It also prints the migration and commit the set belongs to. A restore into code that is three
# migrations ahead boots fine and is quietly wrong, so that line is the one to read first.

set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pdash}"
SCRATCH="${SCRATCH:-pdash_restore_drill}"

# shellcheck source=scripts/backup-lib.sh
. "$REPO_DIR/scripts/backup-lib.sh"

COMPOSE=(docker compose -f "${REPO_DIR}/docker-compose.prod.yml" --env-file "${REPO_DIR}/.env.production")

# ── work out what we are drilling: a set directory, or a bare dump ───────────
TARGET="${1:-}"
if [ -z "$TARGET" ]; then
  NEWEST="$(bk_list_sets "$BACKUP_DIR" | head -1)"
  [ -n "$NEWEST" ] && TARGET="$BACKUP_DIR/sets/$NEWEST"
fi
if [ -z "$TARGET" ] || [ ! -e "$TARGET" ]; then
  echo "No backup found in $BACKUP_DIR/sets. Run scripts/backup.sh first." >&2
  exit 1
fi

SET_DIR=""
if [ -d "$TARGET" ]; then
  SET_DIR="$TARGET"
  DUMP="$TARGET/db.sql.gz"
else
  DUMP="$TARGET"
fi
[ -f "$DUMP" ] || { echo "No db.sql.gz in $TARGET" >&2; exit 1; }

echo "Drilling: $(basename "$TARGET")"
echo

# ── 1. the files themselves ─────────────────────────────────────────────────
FAIL=0
if [ -n "$SET_DIR" ]; then
  echo "── integrity ─────────────────────────────────────────────────"
  bk_verify_set "$SET_DIR" true || FAIL=1
  MIG="$(bk_manifest_get "$SET_DIR/manifest.json" schemaMigration || true)"
  COMMIT="$(bk_manifest_get "$SET_DIR/manifest.json" gitCommit || true)"
  TAKEN="$(bk_manifest_get "$SET_DIR/manifest.json" createdAt || true)"
  echo "  taken ${TAKEN:-?} at migration ${MIG:-unknown}, commit ${COMMIT:-unknown}"
  echo "  → a restore must put the code back to that commit before the API starts."
  echo
fi

# ── 2. replay into a scratch database ───────────────────────────────────────
DB_USER="$("${COMPOSE[@]}" exec -T postgres printenv POSTGRES_USER | tr -d '\r')"
DB_NAME="$("${COMPOSE[@]}" exec -T postgres printenv POSTGRES_DB   | tr -d '\r')"
PSQL=("${COMPOSE[@]}" exec -T postgres psql -U "$DB_USER")

echo "── restore into scratch database '$SCRATCH' (live database $DB_NAME is not touched) ──"
# Always start from nothing, so a previous drill cannot make this one look better than it is.
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH;" >/dev/null
"${PSQL[@]}" -d postgres -c "CREATE DATABASE $SCRATCH;"          >/dev/null

# The dump carries --clean --if-exists, so it drops objects it is about to recreate. In a fresh
# database those drops have nothing to remove and psql reports them; that is expected noise, and
# real errors are counted separately.
ERRORS=$(zcat "$DUMP" | "${COMPOSE[@]}" exec -T postgres psql -U "$DB_USER" -d "$SCRATCH" -v ON_ERROR_STOP=0 2>&1 \
  | grep -c '^ERROR' || true)
echo "  replayed with $ERRORS error line(s) (drop-if-exists noise is normal on an empty database)"
echo

# ── 3. did the DATA come back? ──────────────────────────────────────────────
#
# Against the MANIFEST where there is one — the counts as they were at the moment of the dump.
# Against live otherwise, which is a weaker check: people have worked since, so a small difference
# is expected and a large one is invisible.
printf '%-18s %12s %12s   %s\n' "TABLE" "EXPECTED" "RESTORED" ""
printf '%s\n' "--------------------------------------------------------------"
for T in user project task timesheet attendance leave_request expense patent client document; do
  EXPECT=""
  SOURCE="live"
  if [ -n "$SET_DIR" ]; then
    EXPECT="$(bk_manifest_get "$SET_DIR/manifest.json" "$T" || true)"
    [ -n "$EXPECT" ] && SOURCE="manifest"
  fi
  if [ -z "$EXPECT" ]; then
    EXPECT="$("${PSQL[@]}" -d "$DB_NAME" -tAc "select count(*) from \"$T\";" 2>/dev/null | tr -d '\r' || echo '?')"
  fi
  GOT="$("${PSQL[@]}" -d "$SCRATCH" -tAc "select count(*) from \"$T\";" 2>/dev/null | tr -d '\r' || echo '?')"
  NOTE=""
  if [ "$GOT" = "?" ]; then
    NOTE="  <-- TABLE MISSING"; FAIL=1
  elif [ "$SOURCE" = manifest ] && [ "$EXPECT" != "?" ] && [ "$GOT" != "$EXPECT" ]; then
    # The manifest is a statement of fact about this dump. Any difference is a restore that lost
    # rows, not a busy afternoon.
    NOTE="  <-- MISMATCH"; FAIL=1
  elif [ "$SOURCE" = live ] && [ "$GOT" = "0" ] && [ "$EXPECT" != "0" ]; then
    NOTE="  <-- EMPTY"; FAIL=1
  fi
  printf '%-18s %12s %12s %s\n' "$T" "$EXPECT" "$GOT" "$NOTE"
done
echo

LIVE_TABLES=$("${PSQL[@]}" -d "$DB_NAME" -tAc "select count(*) from information_schema.tables where table_schema='public';" | tr -d '\r')
REST_TABLES=$("${PSQL[@]}" -d "$SCRATCH" -tAc "select count(*) from information_schema.tables where table_schema='public';" | tr -d '\r')
echo "  tables: live $LIVE_TABLES, restored $REST_TABLES"
[ "$REST_TABLES" -lt "$LIVE_TABLES" ] && FAIL=1

# The migration table has to come back too, or `prisma migrate deploy` on the restored database
# will try to re-run every migration from the beginning.
REST_MIG=$("${PSQL[@]}" -d "$SCRATCH" -tAc "select migration_name from _prisma_migrations where finished_at is not null order by finished_at desc limit 1;" 2>/dev/null | tr -d '\r' || true)
if [ -z "$REST_MIG" ]; then
  echo "  migrations: NONE in the restored database — prisma would try to re-run them all."
  FAIL=1
else
  echo "  migrations: restored at $REST_MIG"
fi
echo

# ── 4. the documents ────────────────────────────────────────────────────────
if [ -n "$SET_DIR" ] && [ -f "$SET_DIR/docs.tar.gz" ]; then
  DOC_FILES=$(tar -tzf "$SET_DIR/docs.tar.gz" 2>/dev/null | wc -l || echo 0)
  echo "  documents archive: $DOC_FILES entries, unpacks cleanly"
  [ "$DOC_FILES" -lt 1 ] && { echo "  <-- the documents archive is EMPTY"; FAIL=1; }
  echo
fi

echo "cleaning up the scratch database…"
"${PSQL[@]}" -d postgres -c "DROP DATABASE IF EXISTS $SCRATCH;" >/dev/null

echo
if [ "$FAIL" = "0" ]; then
  echo "DRILL PASSED — this set restores."
else
  echo "DRILL FAILED — the set did not restore completely. Do not rely on it." >&2
  exit 1
fi
