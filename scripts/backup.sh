#!/usr/bin/env bash
#
# Nightly backup of the Squark Dashboard database and uploaded documents.
#
# WHY THIS EXISTS
#
# There were no backups at all. Attendance, timesheets, leave balances, the patent register and
# the client ledger existed in exactly one place. That is not a theoretical risk here: a
# destructive migration has already destroyed 83 timesheet rows on this system once.
#
# WHAT IT TAKES, AND WHY BOTH
#
#   • the DATABASE — everything the application stores;
#   • the DOCUMENTS VOLUME — patent PDFs and attachments live on disk, not in Postgres
#     (DOCUMENT_STORAGE_DIR=/app/.data/documents), so a database dump alone restores a system
#     whose every document link is broken.
#
# WHY pg_dump AND NOT A VOLUME SNAPSHOT
#
# A dump is consistent, portable across Postgres versions, and restorable into a scratch database
# for the drill below. Copying /var/lib/postgresql/data out from under a running server produces a
# file that usually restores and occasionally does not, and you find out which on the day it
# matters.
#
# INSTALL (on the server, once)
#
#   chmod +x ~/pdash/scripts/backup.sh
#   crontab -e
#   15 2 * * *  cd /root/pdash && ./scripts/backup.sh >> /var/log/pdash-backup.log 2>&1
#
# The log line matters: a cron job whose output goes nowhere is a job you will not know has been
# failing. Point it at a file you will actually look at, or at a mailbox.
#
# RESTORE — practise this BEFORE you need it. See scripts/restore-drill.sh.

set -euo pipefail

REPO_DIR="${REPO_DIR:-$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)}"
BACKUP_DIR="${BACKUP_DIR:-/var/backups/pdash}"
KEEP_DAYS="${KEEP_DAYS:-30}"
COMPOSE="docker compose -f ${REPO_DIR}/docker-compose.prod.yml --env-file ${REPO_DIR}/.env.production"
STAMP="$(date +%Y-%m-%d_%H%M)"

mkdir -p "$BACKUP_DIR"

# The credentials live in the container's own environment. Reading them from .env.production here
# would be a second copy that drifts the day somebody rotates the password.
DB_USER="$($COMPOSE exec -T postgres printenv POSTGRES_USER | tr -d '\r')"
DB_NAME="$($COMPOSE exec -T postgres printenv POSTGRES_DB   | tr -d '\r')"

if [ -z "$DB_USER" ] || [ -z "$DB_NAME" ]; then
  echo "[$(date -Is)] FAILED: could not read POSTGRES_USER/POSTGRES_DB from the container." >&2
  exit 1
fi

DB_FILE="$BACKUP_DIR/pdash-db-$STAMP.sql.gz"
DOC_FILE="$BACKUP_DIR/pdash-docs-$STAMP.tar.gz"

echo "[$(date -Is)] backing up database $DB_NAME…"
# --clean --if-exists so the dump can be replayed over an existing database without hand-editing.
# Piped straight to gzip: the uncompressed dump is never written to disk, so a backup cannot fail
# by filling the very disk it is trying to protect.
$COMPOSE exec -T postgres pg_dump -U "$DB_USER" -d "$DB_NAME" --clean --if-exists \
  | gzip -9 > "$DB_FILE.partial"
# Renamed only after a clean exit. A half-written file with the right name is worse than no file,
# because it looks like a backup until the day you restore it.
mv "$DB_FILE.partial" "$DB_FILE"

echo "[$(date -Is)] backing up uploaded documents…"
$COMPOSE exec -T api tar -czf - -C /app/.data . > "$DOC_FILE.partial"
mv "$DOC_FILE.partial" "$DOC_FILE"

DB_SIZE=$(du -h "$DB_FILE"  | cut -f1)
DOC_SIZE=$(du -h "$DOC_FILE" | cut -f1)

# A dump that gunzips cleanly, declares tables, and carries pg_dump's own end-of-dump marker is
# not proof of a good restore, but an empty or truncated file is proof of a bad one — and that is
# the failure worth catching nightly.
if ! gzip -t "$DB_FILE" 2>/dev/null; then
  echo "[$(date -Is)] FAILED: $DB_FILE is not a valid gzip file." >&2
  exit 1
fi

# One pass over the WHOLE dump. `--clean --if-exists` emits several hundred DROP statements before
# the first CREATE TABLE, so a head-limited check finds no schema in a perfectly good dump.
#
# Do NOT reach for `grep -q` or `grep -m1` here, however tempting the early exit looks. grep stops
# at the first match and closes the pipe, zcat is killed by SIGPIPE (141), and `set -o pipefail`
# then reports 141 for the whole pipeline — so the check fails hardest exactly when the dump is
# GOOD and the match is found soonest. awk is used instead because it reads to EOF regardless.
DUMP_CHECK="$(zcat "$DB_FILE" | awk '
  /^CREATE TABLE/                         { tables++ }
  /^-- PostgreSQL database dump complete/ { complete = 1 }
  END                                     { print tables + 0, complete + 0 }')"
TABLE_COUNT="${DUMP_CHECK%% *}"
DUMP_COMPLETE="${DUMP_CHECK##* }"

if [ "$TABLE_COUNT" -lt 1 ]; then
  echo "[$(date -Is)] FAILED: $DB_FILE declares no tables — the dump did not work." >&2
  exit 1
fi
# pg_dump writes that footer last of all, so its absence means the dump was cut short partway.
if [ "$DUMP_COMPLETE" -ne 1 ]; then
  echo "[$(date -Is)] FAILED: $DB_FILE is truncated — pg_dump's end-of-dump marker is missing." >&2
  exit 1
fi

echo "[$(date -Is)] removing backups older than $KEEP_DAYS days…"
find "$BACKUP_DIR" -name 'pdash-db-*.sql.gz'   -mtime "+$KEEP_DAYS" -delete
find "$BACKUP_DIR" -name 'pdash-docs-*.tar.gz' -mtime "+$KEEP_DAYS" -delete
# Anything left half-written by a previous failed run.
find "$BACKUP_DIR" -name '*.partial' -mtime +1 -delete

COUNT=$(find "$BACKUP_DIR" -name 'pdash-db-*.sql.gz' | wc -l)
echo "[$(date -Is)] OK — db $DB_SIZE ($TABLE_COUNT tables), documents $DOC_SIZE, $COUNT database backups retained in $BACKUP_DIR"
