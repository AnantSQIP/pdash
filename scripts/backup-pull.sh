#!/usr/bin/env bash
#
# Pull the Contabo backups down to THIS machine — the off-site copy.
#
# WHY THIS EXISTS
#
# scripts/backup.sh already takes a verified nightly dump of the database and the uploaded
# documents. Every one of those files lives in /var/backups/pdash — on the same VPS as the data
# it is protecting. That covers the failure everybody plans for (a bad migration, a dropped
# table) and none of the ones that actually end companies: the disk, the host, a billing lapse,
# a compromised root account. A backup on the machine it backs up is a snapshot, not a backup.
#
# This script is the second copy. It runs on YOUR machine, reaches out to the server, and never
# needs anything running locally except ssh.
#
# USAGE (from WSL, in the repo):
#
#   bash scripts/backup-pull.sh
#
#   FRESH=false bash scripts/backup-pull.sh    # take what is already there; don't dump first
#   DEST=/mnt/d/pdash-backups bash ...         # somewhere else (an external drive is better)
#   KEEP_DAYS=365 bash ...                     # keep local copies longer than the server does
#
# It NEVER deletes anything on the server, and it never deletes a local file just because the
# server has pruned it. The local copy is meant to outlive the server's 30-day window.
#
set -euo pipefail

REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_HOST="${REMOTE_HOST:-217.76.59.244}"
SSH_PORT="${SSH_PORT:-2222}"
REMOTE_DIR="${REMOTE_DIR:-/var/backups/pdash}"
REMOTE_REPO="${REMOTE_REPO:-/root/pdash}"
DEST="${DEST:-/mnt/c/Users/anant/pdash-backups}"
KEEP_DAYS="${KEEP_DAYS:-90}"
FRESH="${FRESH:-true}"

SSH=(ssh -p "$SSH_PORT" -o ConnectTimeout=20 -o BatchMode=yes "${REMOTE_USER}@${REMOTE_HOST}")
REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# ── preflight ────────────────────────────────────────────────────────────────
#
# The destination must NOT sit inside the git repo. These files contain every person's PII, the
# patent register, the client ledger and every password hash — and this repo is public. One
# `git add -A` on a dump inside the working tree publishes all of it irreversibly.
DEST="$(readlink -m "$DEST")"
case "$DEST/" in
  "$REPO_ROOT"/*)
    echo "FATAL: DEST ($DEST) is inside the git repo ($REPO_ROOT)."
    echo "       These dumps hold PII, the patent register and password hashes, and this repo is"
    echo "       public. Put them somewhere outside it — the default /mnt/c/Users/anant/pdash-backups"
    echo "       is fine, an external drive is better."
    exit 1;;
esac

mkdir -p "$DEST"
LOG="${LOG:-$DEST/backup-pull.log}"
say() { echo "[$(date -Is)] $*" | tee -a "$LOG"; }

say "=== pulling backups from ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR} -> ${DEST}"

if ! "${SSH[@]}" true 2>/dev/null; then
  cat <<EOF
FATAL: cannot reach ${REMOTE_USER}@${REMOTE_HOST} on port ${SSH_PORT} without a password.

This needs key-based ssh, because a scheduled job cannot type a passphrase. Set it up once:

  ssh-keygen -t ed25519 -C "pdash-backup"                      # if you have no key yet
  ssh-copy-id -p ${SSH_PORT} ${REMOTE_USER}@${REMOTE_HOST}     # asks for the root password once

Then run this again.
EOF
  exit 1
fi

# ── take a fresh dump first ──────────────────────────────────────────────────
#
# Without this the newest file on the server can be almost 24 hours old, so the off-site copy is
# a day behind for no reason. backup.sh is idempotent and verifies its own output, so running it
# on demand is safe — and it is the SAME script cron runs, not a second way of dumping that could
# drift from it.
if [ "$FRESH" = true ]; then
  say "running scripts/backup.sh on the server for an up-to-the-minute dump…"
  if ! "${SSH[@]}" "cd ${REMOTE_REPO} && ./scripts/backup.sh" >>"$LOG" 2>&1; then
    say "WARN: the remote backup run failed — falling back to whatever is already on the server."
    say "      (see $LOG for its output; the pull below still happens)"
  fi
fi

# ── transfer ─────────────────────────────────────────────────────────────────
#
# rsync when both ends have it: it resumes a part-transferred file instead of starting the
# gigabyte again, and skips what is already here. scp otherwise, one missing file at a time.
# Neither is given --delete: the server prunes at 30 days and this copy is meant to outlive that.
BEFORE="$(mktemp)"; find "$DEST" -maxdepth 1 -type f \( -name '*.sql.gz' -o -name '*.tar.gz' \) -printf '%f\n' | sort > "$BEFORE"

if command -v rsync >/dev/null 2>&1 && "${SSH[@]}" 'command -v rsync >/dev/null 2>&1'; then
  say "transferring with rsync…"
  rsync -az --partial --human-readable \
    -e "ssh -p ${SSH_PORT} -o BatchMode=yes" \
    --include='pdash-db-*.sql.gz' --include='pdash-docs-*.tar.gz' --exclude='*' \
    "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/" "$DEST/" 2>&1 | tee -a "$LOG"
else
  say "rsync not available on both ends — falling back to scp for missing files only."
  REMOTE_LIST="$("${SSH[@]}" "ls -1 ${REMOTE_DIR} 2>/dev/null | grep -E '^pdash-(db|docs)-.*\.(sql|tar)\.gz$' || true")"
  for f in $REMOTE_LIST; do
    if [ -f "$DEST/$f" ]; then continue; fi
    say "  fetching $f"
    # .partial then rename, so an interrupted transfer never leaves a file that looks complete.
    scp -P "$SSH_PORT" -o BatchMode=yes "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/${f}" "$DEST/${f}.partial" >>"$LOG" 2>&1
    mv "$DEST/${f}.partial" "$DEST/${f}"
  done
fi

AFTER="$(mktemp)"; find "$DEST" -maxdepth 1 -type f \( -name '*.sql.gz' -o -name '*.tar.gz' \) -printf '%f\n' | sort > "$AFTER"
NEW="$(comm -13 "$BEFORE" "$AFTER" || true)"
rm -f "$BEFORE" "$AFTER"

# ── verify what arrived ──────────────────────────────────────────────────────
#
# The server verified the dump when it wrote it. This verifies the COPY, which is a different
# failure: a transfer cut off partway leaves a file of plausible size that gunzips to a dump with
# no end marker. Checking here is the only way to know the off-site copy is restorable, and the
# checks are the same three backup.sh uses so a file cannot pass there and fail here for a
# reason that isn't real corruption.
FAILED=0
if [ -z "$NEW" ]; then
  say "nothing new to fetch — the local copy is already current."
else
  for f in $NEW; do
    p="$DEST/$f"
    if ! gzip -t "$p" 2>/dev/null; then
      say "CORRUPT: $f is not a valid gzip file — deleting the bad copy."
      rm -f "$p"; FAILED=1; continue
    fi
    case "$f" in
      pdash-db-*)
        # awk, not grep: grep -q closes the pipe on first match, zcat dies of SIGPIPE, and
        # pipefail then reports failure precisely when the dump is GOOD. awk reads to EOF.
        read -r TABLES COMPLETE <<<"$(zcat "$p" | awk '
          /^CREATE TABLE/                         { t++ }
          /^-- PostgreSQL database dump complete/ { c = 1 }
          END                                     { print t + 0, c + 0 }')"
        if [ "$TABLES" -lt 1 ] || [ "$COMPLETE" -ne 1 ]; then
          say "CORRUPT: $f — ${TABLES} tables, end-marker=${COMPLETE}. Truncated in transfer; deleting."
          rm -f "$p"; FAILED=1
        else
          say "OK  $f ($(du -h "$p" | cut -f1), ${TABLES} tables)"
        fi;;
      pdash-docs-*)
        if ! tar -tzf "$p" >/dev/null 2>&1; then
          say "CORRUPT: $f is not a readable tar archive — deleting."
          rm -f "$p"; FAILED=1
        else
          say "OK  $f ($(du -h "$p" | cut -f1))"
        fi;;
    esac
  done
fi

# ── local retention ──────────────────────────────────────────────────────────
find "$DEST" -maxdepth 1 -name 'pdash-db-*.sql.gz'   -mtime "+$KEEP_DAYS" -delete
find "$DEST" -maxdepth 1 -name 'pdash-docs-*.tar.gz' -mtime "+$KEEP_DAYS" -delete
find "$DEST" -maxdepth 1 -name '*.partial' -mtime +1 -delete

DB_COUNT=$(find "$DEST" -maxdepth 1 -name 'pdash-db-*.sql.gz' | wc -l)
NEWEST=$(find "$DEST" -maxdepth 1 -name 'pdash-db-*.sql.gz' -printf '%T@ %f\n' | sort -rn | head -1 | cut -d' ' -f2-)
TOTAL=$(du -sh "$DEST" 2>/dev/null | cut -f1)

say "held locally: ${DB_COUNT} database backups, newest ${NEWEST:-none}, ${TOTAL:-0} total in ${DEST}"
if [ "$FAILED" -ne 0 ]; then
  say "FINISHED WITH ERRORS — at least one file arrived corrupt and was deleted. Run again."
  exit 1
fi
say "done."
