#!/usr/bin/env bash
#
# Nightly backup of the Squark Dashboard — the SERVER half. Runs on Contabo.
#
# WHY THIS EXISTS
#
# There were no backups at all. Attendance, timesheets, leave balances, the patent register and
# the client ledger existed in exactly one place. That is not a theoretical risk here: a
# destructive migration has already destroyed 83 timesheet rows on this system once.
#
# WHAT ONE RUN PRODUCES — a SET, which is the unit of everything
#
#   /var/backups/pdash/sets/pdash-YYYY-MM-DD_HHMM/
#     db.sql.gz        the database: everything the application stores
#     docs.tar.gz      the documents volume: patent PDFs and attachments live on DISK
#                      (DOCUMENT_STORAGE_DIR=/app/.data/documents), so a database dump alone
#                      restores a system whose every document link is broken
#     config.tar.gz    .env.production, the compose file, the Caddyfile, root's crontab — what it
#                      takes to stand the stack back up on a different machine.
#                      ⚠ THIS FILE HOLDS LIVE SECRETS (DB password, JWT signing key). It is
#                      written 0600. Set BACKUP_CONFIG=false to leave it out.
#     manifest.json    what this set IS: the migration it was taken at, the git commit, row
#                      counts, sizes, checksums. A dump with no migration state is a dump nobody
#                      can safely restore, because nothing says which code it matches.
#     SHA256SUMS       so the copy on the laptop can be proved identical to the copy written here
#
# The set is assembled in a staging directory and only moved into sets/ once every file in it has
# passed verification. A half-written set never appears under a name that looks complete — which
# matters, because a file that looks like a backup until the day you restore it is worse than no
# file at all.
#
# WHY pg_dump AND NOT A VOLUME SNAPSHOT
#
# A dump is consistent, portable across Postgres versions, and restorable into a scratch database
# for the drill. Copying /var/lib/postgresql/data out from under a running server produces a file
# that usually restores and occasionally does not, and you find out which on the day it matters.
#
# RETENTION (server): daily for 30 days, Sunday sets for 90, 1st-of-month sets for 365.
# The laptop keeps more, for longer — see scripts/backup-pull.sh. Deliberately: the copy that
# survives the server dying is the one worth hoarding.
#
# INSTALL (on the server, once)
#
#   chmod +x /root/pdash/scripts/backup.sh
#   crontab -e
#   15 2 * * *  cd /root/pdash && ./scripts/backup.sh >> /var/log/pdash-backup.log 2>&1
#
# The log line matters: a cron job whose output goes nowhere is a job you will not know has been
# failing. This script is also loud in three other places on failure (syslog, a LAST_RUN_FAILED
# marker in the backup root that the next run and the laptop both read, and $BACKUP_ALERT_CMD).
#
# RESTORE — practise it BEFORE you need it: scripts/restore-drill.sh, and scripts/BACKUPS.md.

set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pdash}"
# GFS retention, in days. 0 on the monthly tier would mean "keep month-ends forever".
KEEP_DAILY="${KEEP_DAILY:-30}"
KEEP_WEEKLY="${KEEP_WEEKLY:-90}"
KEEP_MONTHLY="${KEEP_MONTHLY:-365}"
BACKUP_CONFIG="${BACKUP_CONFIG:-true}"

# shellcheck source=scripts/backup-lib.sh
. "$(dirname "${BASH_SOURCE[0]}")/backup-lib.sh"

COMPOSE=(docker compose -f "${REPO_DIR}/docker-compose.prod.yml" --env-file "${REPO_DIR}/.env.production")

mkdir -p "$BACKUP_DIR/sets" "$BACKUP_DIR/.staging"
# Assigned, not defaulted: backup-lib.sh has already given BK_LOG a value, so `${BK_LOG:-…}` here
# would silently keep /dev/null and this script would keep no log of its own at all.
BK_LOG="${BACKUP_LOG:-$BACKUP_DIR/backup.log}"

SET_NAME="$(bk_new_set_name)"
STAGE="$BACKUP_DIR/.staging/$SET_NAME"

# Any failure anywhere is loud, and leaves nothing behind that could be mistaken for a backup.
cleanup_failed() {
  local rc=$?
  rm -rf "$STAGE"
  bk_alert "$BACKUP_DIR" "backup.sh exited $rc while building $SET_NAME — no set was written. Log: $BK_LOG"
  exit "$rc"
}
trap cleanup_failed ERR

mkdir -p "$STAGE"

# If the LAST run failed, say so again now. A marker nobody is reminded of is a marker nobody
# reads, and the whole point of it is that a run of silent failures cannot accumulate.
if [ -f "$BACKUP_DIR/LAST_RUN_FAILED" ]; then
  bk_say "NOTE: the previous run failed — $(tail -1 "$BACKUP_DIR/LAST_RUN_FAILED")"
fi

bk_say "=== backup set $SET_NAME"

# The credentials live in the container's own environment. Reading them from .env.production here
# would be a second copy that drifts the day somebody rotates the password.
DB_USER="$("${COMPOSE[@]}" exec -T postgres printenv POSTGRES_USER | tr -d '\r')"
DB_NAME="$("${COMPOSE[@]}" exec -T postgres printenv POSTGRES_DB   | tr -d '\r')"
if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
  bk_alert "$BACKUP_DIR" "could not read POSTGRES_USER/POSTGRES_DB from the container — is the stack up?"
  rm -rf "$STAGE"; exit 1
fi
PSQL=("${COMPOSE[@]}" exec -T postgres psql -U "$DB_USER" -d "$DB_NAME" -tAc)

# ── the database ─────────────────────────────────────────────────────────────
bk_say "dumping database $DB_NAME…"
# --clean --if-exists so the dump can be replayed over an existing database without hand-editing.
# Piped straight to gzip: the uncompressed dump is never written to disk, so a backup cannot fail
# by filling the very disk it is trying to protect.
"${COMPOSE[@]}" exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
  | gzip -9 > "$STAGE/db.sql.gz"

# ── the documents volume ─────────────────────────────────────────────────────
#
# Uploaded bytes are on disk, not in Postgres — except for the DocumentBlob fallback the API
# writes when a disk write fails, which rides along in the database dump. Both halves are
# therefore covered, and neither on its own is enough.
bk_say "archiving uploaded documents…"
"${COMPOSE[@]}" exec -T api tar -czf - -C /app/.data . > "$STAGE/docs.tar.gz"

# ── the configuration needed to stand this back up ───────────────────────────
if [ "$BACKUP_CONFIG" = true ]; then
  bk_say "archiving configuration (⚠ contains secrets — mode 0600)…"
  CONFTMP="$(mktemp -d)"
  mkdir -p "$CONFTMP/config"
  for f in .env.production docker-compose.prod.yml; do
    [ -f "$REPO_DIR/$f" ] && cp -p "$REPO_DIR/$f" "$CONFTMP/config/"
  done
  [ -f /etc/caddy/Caddyfile ] && cp -p /etc/caddy/Caddyfile "$CONFTMP/config/Caddyfile"
  crontab -l > "$CONFTMP/config/root.crontab" 2>/dev/null || true
  # A restore's first question is "which code was this?" — answer it inside the config archive too,
  # so the answer survives even if the manifest is lost.
  git -C "$REPO_DIR" rev-parse HEAD > "$CONFTMP/config/git-commit.txt" 2>/dev/null || true
  tar -czf "$STAGE/config.tar.gz" -C "$CONFTMP" config
  chmod 600 "$STAGE/config.tar.gz"
  rm -rf "$CONFTMP"
fi

# ── the manifest: what this set is, and what code it belongs to ──────────────
#
# THE MIGRATION STATE IS THE POINT. Restoring a dump into a checkout that is three migrations
# ahead gives you an application that boots and is quietly wrong. The set records which migration
# the schema was at and which commit was deployed, so a restore can put the code back to match.
bk_say "recording the manifest…"
MIGRATION="$("${PSQL[@]}" "select migration_name from _prisma_migrations where finished_at is not null order by finished_at desc limit 1;" 2>/dev/null | tr -d '\r' || true)"
MIGRATION_COUNT="$("${PSQL[@]}" "select count(*) from _prisma_migrations where finished_at is not null;" 2>/dev/null | tr -d '\r' || echo 0)"
PG_VERSION="$("${PSQL[@]}" "show server_version;" 2>/dev/null | tr -d '\r' || true)"
GIT_COMMIT="$(git -C "$REPO_DIR" rev-parse --short HEAD 2>/dev/null || echo unknown)"
TABLE_COUNT="$("${PSQL[@]}" "select count(*) from information_schema.tables where table_schema='public';" 2>/dev/null | tr -d '\r' || echo 0)"

# Row counts for the tables whose loss would actually hurt. A restore that comes back with the
# right table list and an empty timesheet table has not worked, and only counts reveal that.
ROWS=""
for T in user project task timesheet attendance leave_request expense patent client document; do
  N="$("${PSQL[@]}" "select count(*) from \"$T\";" 2>/dev/null | tr -d '\r' || echo -1)"
  ROWS="${ROWS}${ROWS:+, }\"$T\": ${N:--1}"
done

DB_SHA="$(sha256sum "$STAGE/db.sql.gz" | cut -d' ' -f1)"
DOC_SHA="$(sha256sum "$STAGE/docs.tar.gz" 2>/dev/null | cut -d' ' -f1 || true)"

cat > "$STAGE/manifest.json" <<JSON
{
  "set": "$SET_NAME",
  "createdAt": "$(date -Is)",
  "host": "$(hostname)",
  "database": "$DB_NAME",
  "postgresVersion": "$PG_VERSION",
  "schemaMigration": "${MIGRATION:-unknown}",
  "migrationsApplied": ${MIGRATION_COUNT:-0},
  "gitCommit": "$GIT_COMMIT",
  "tableCount": ${TABLE_COUNT:-0},
  "dbSha256": "$DB_SHA",
  "docsSha256": "${DOC_SHA:-}",
  "rowCounts": { $ROWS }
}
JSON

(cd "$STAGE" && sha256sum ./* > SHA256SUMS.tmp && mv SHA256SUMS.tmp SHA256SUMS)

# ── verify before publishing ─────────────────────────────────────────────────
#
# A dump that gunzips cleanly, declares tables and carries pg_dump's own end marker is not proof
# of a good restore — scripts/restore-drill.sh is what proves that — but an empty or truncated
# file is proof of a BAD one, and that is the failure worth catching nightly.
bk_say "verifying…"
if ! bk_verify_set "$STAGE" true; then
  bk_alert "$BACKUP_DIR" "the set $SET_NAME failed verification and was discarded. The database has NOT been backed up tonight."
  rm -rf "$STAGE"
  exit 1
fi

mv "$STAGE" "$BACKUP_DIR/sets/$SET_NAME"
echo "$SET_NAME" > "$BACKUP_DIR/LATEST"
bk_clear_failure_marker "$BACKUP_DIR"
trap - ERR

# ── retention ────────────────────────────────────────────────────────────────
PRUNED="$(bk_prune_sets "$BACKUP_DIR" "$KEEP_DAILY" "$KEEP_WEEKLY" "$KEEP_MONTHLY")"
bk_sweep_partials "$BACKUP_DIR"
rmdir "$BACKUP_DIR/.staging" 2>/dev/null || true

HELD="$(bk_list_sets "$BACKUP_DIR" | wc -l)"
TOTAL="$(du -sh "$BACKUP_DIR/sets" 2>/dev/null | cut -f1)"
bk_say "OK — $SET_NAME written (migration ${MIGRATION:-unknown}, commit $GIT_COMMIT); pruned ${PRUNED:-0}; holding $HELD sets, ${TOTAL:-0} in $BACKUP_DIR/sets"
