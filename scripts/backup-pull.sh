#!/usr/bin/env bash
#
# Pull the Contabo backup sets down to THIS machine — the off-site half.
#
# WHY THIS EXISTS
#
# scripts/backup.sh already takes a verified nightly set on the server. Every one of those files
# lives in /var/backups/pdash — on the same VPS as the data it is protecting. That covers the
# failure everybody plans for (a bad migration, a dropped table) and none of the ones that
# actually end companies: the disk, the host, a billing lapse, a compromised root account. A
# backup on the machine it backs up is a snapshot, not a backup.
#
# This script is the second copy. It runs on YOUR machine, reaches out to the server, and needs
# nothing running locally except ssh.
#
# IT IS ALSO THE WATCHDOG. The server cannot tell you it has stopped backing up — a dead cron job
# makes no noise at all. So this checks, every time it runs, whether the newest set on the server
# is fresh and whether the server left a failure marker, and it fails LOUDLY if either is wrong.
# That is the check that catches the six months of silence.
#
# USAGE (from WSL, in the repo):
#
#   bash scripts/backup-pull.sh
#
#   FRESH=false bash scripts/backup-pull.sh    # take what is already there; don't dump first
#   DEST=/mnt/d/pdash-backups bash ...         # somewhere else (an external drive is better)
#   STALE_HOURS=72 bash ...                    # how old the newest set may be before this shouts
#   bash scripts/backup-pull.sh --verify-only  # re-verify what is already held; transfer nothing
#   bash scripts/backup-pull.sh --report       # print the inventory and stop
#   bash scripts/backup-pull.sh --install-schedule
#                                              # register the daily Windows scheduled task
#
# It NEVER deletes anything on the server, and never deletes a local set just because the server
# has pruned it. The local copy is meant to OUTLIVE the server's window:
#
#            daily     Sundays    1st of the month
#   server    30d        90d           365d
#   local     90d       365d          forever
#
set -euo pipefail

REMOTE_USER="${REMOTE_USER:-root}"
REMOTE_HOST="${REMOTE_HOST:-217.76.59.244}"
SSH_PORT="${SSH_PORT:-2222}"
REMOTE_DIR="${REMOTE_DIR:-/var/backups/pdash}"
REMOTE_REPO="${REMOTE_REPO:-/root/pdash}"
DEST="${DEST:-/mnt/c/Users/anant/pdash-backups}"
FRESH="${FRESH:-true}"
STALE_HOURS="${STALE_HOURS:-36}"
# Local retention — deliberately longer than the server's. 0 on a tier = keep forever.
KEEP_DAILY="${KEEP_DAILY:-90}"
KEEP_WEEKLY="${KEEP_WEEKLY:-365}"
KEEP_MONTHLY="${KEEP_MONTHLY:-0}"

MODE=pull
case "${1:-}" in
  --verify-only)      MODE=verify;;
  --report)           MODE=report;;
  --install-schedule) MODE=schedule;;
  "")                 ;;
  *) echo "unknown option: $1  (--verify-only | --report | --install-schedule)" >&2; exit 2;;
esac

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/backup-lib.sh
. "$REPO_ROOT/scripts/backup-lib.sh"

SSH=(ssh -p "$SSH_PORT" -o ConnectTimeout=20 -o BatchMode=yes "${REMOTE_USER}@${REMOTE_HOST}")

# ── preflight ────────────────────────────────────────────────────────────────
#
# The destination must NOT sit inside the git repo. These files contain every person's PII, the
# patent register, the client ledger, every password hash — and, in config.tar.gz, the live JWT
# signing key and database password. This repo is public. One `git add -A` on a set inside the
# working tree publishes all of it irreversibly.
DEST="$(readlink -m "$DEST")"
case "$DEST/" in
  "$REPO_ROOT"/*)
    echo "FATAL: DEST ($DEST) is inside the git repo ($REPO_ROOT)."
    echo "       These sets hold PII, the patent register, password hashes and the live secrets,"
    echo "       and this repo is public. Put them somewhere outside it — the default"
    echo "       /mnt/c/Users/anant/pdash-backups is fine, an external drive is better."
    exit 1;;
esac

mkdir -p "$DEST/sets"
BK_LOG="${LOG:-$DEST/backup-pull.log}"

# ── --install-schedule ───────────────────────────────────────────────────────
#
# WSL has no reliable cron: the distro is not running when Windows is idle, so a crontab entry
# inside WSL simply does not fire on the days it matters most. Windows Task Scheduler does, and it
# can start WSL to run this. Wake-the-machine is deliberately NOT set — the task runs at the next
# opportunity instead, because a laptop that wakes itself at 3am in a bag is its own problem.
if [ "$MODE" = schedule ]; then
  CMD="wsl.exe -e bash -lc 'cd $REPO_ROOT && bash scripts/backup-pull.sh >> $DEST/backup-pull.log 2>&1'"
  if command -v schtasks.exe >/dev/null 2>&1; then
    echo "Registering the daily task 'pdash-backup-pull' at 08:30…"
    schtasks.exe /Create /TN "pdash-backup-pull" /TR "$CMD" /SC DAILY /ST 08:30 /F
    echo "Done. Check it with:  schtasks.exe /Query /TN pdash-backup-pull"
  else
    echo "schtasks.exe is not reachable from here. Run this in an ADMIN PowerShell on Windows:"
    echo
    echo "  schtasks /Create /TN \"pdash-backup-pull\" /TR \"$CMD\" /SC DAILY /ST 08:30 /F"
    echo
    echo "Or, on a Linux box with a real cron:  30 8 * * * cd $REPO_ROOT && bash scripts/backup-pull.sh"
  fi
  exit 0
fi

# ── --report ─────────────────────────────────────────────────────────────────
write_inventory() {
  {
    echo "# pdash backups held on this machine"
    echo
    echo "Written by scripts/backup-pull.sh at $(date -Is). Do not edit — it is rewritten each run."
    echo
    echo "Location: $DEST/sets"
    echo "Retention here: daily ${KEEP_DAILY}d, Sundays ${KEEP_WEEKLY}d, 1st-of-month $([ "$KEEP_MONTHLY" -eq 0 ] && echo forever || echo "${KEEP_MONTHLY}d")."
    echo
    echo '```'
    printf '%-26s %8s  %-32s %s\n' "SET" "SIZE" "MIGRATION" "TAKEN AT"
    bk_inventory "$DEST"
    echo '```'
    echo
    echo "Total: $(bk_list_sets "$DEST" | wc -l) sets, $(du -sh "$DEST/sets" 2>/dev/null | cut -f1) on disk."
    echo
    echo "To restore one of these, see scripts/BACKUPS.md."
  } > "$DEST/INVENTORY.md"
}

if [ "$MODE" = report ]; then
  write_inventory
  cat "$DEST/INVENTORY.md"
  exit 0
fi

# ── --verify-only ────────────────────────────────────────────────────────────
if [ "$MODE" = verify ]; then
  BAD=0
  while read -r name; do
    [ -n "$name" ] || continue
    echo "$name"
    bk_verify_set "$DEST/sets/$name" true || BAD=1
  done <<EOF
$(bk_list_sets "$DEST")
EOF
  write_inventory
  [ "$BAD" -eq 0 ] || { echo "AT LEAST ONE HELD SET IS CORRUPT — see above." >&2; exit 1; }
  echo "every held set verifies."
  exit 0
fi

bk_say "=== pulling from ${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR} -> ${DEST}"

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

# ── take a fresh set first ───────────────────────────────────────────────────
#
# Without this the newest set on the server can be almost 24 hours old, so the off-site copy is a
# day behind for no reason. backup.sh verifies its own output and is safe to run on demand — and
# it is the SAME script cron runs, not a second way of dumping that could drift from it.
if [ "$FRESH" = true ]; then
  bk_say "running scripts/backup.sh on the server for an up-to-the-minute set…"
  if ! "${SSH[@]}" "cd ${REMOTE_REPO} && ./scripts/backup.sh" >>"$BK_LOG" 2>&1; then
    bk_say "WARN: the remote backup run failed — falling back to whatever is already on the server."
    bk_say "      (see $BK_LOG for its output; the pull below still happens)"
  fi
fi

# ── watchdog: is the SERVER still backing up at all? ─────────────────────────
REMOTE_FAILED="$("${SSH[@]}" "cat ${REMOTE_DIR}/LAST_RUN_FAILED 2>/dev/null | tail -1" || true)"
REMOTE_NEWEST="$("${SSH[@]}" "ls -1 ${REMOTE_DIR}/sets 2>/dev/null | sort | tail -1" || true)"
STALE=0
if [ -n "$REMOTE_NEWEST" ]; then
  NEWEST_DATE="$(bk_set_date "$REMOTE_NEWEST" || true)"
  if [ -n "$NEWEST_DATE" ]; then
    AGE_H=$(( ( $(date +%s) - $(date -d "$NEWEST_DATE" +%s) ) / 3600 ))
    if [ "$AGE_H" -gt "$STALE_HOURS" ]; then
      bk_say "STALE: the newest set on the server is ${REMOTE_NEWEST} (~${AGE_H}h old, limit ${STALE_HOURS}h)."
      STALE=1
    fi
  fi
fi
[ -n "$REMOTE_FAILED" ] && bk_say "SERVER REPORTS A FAILED RUN: $REMOTE_FAILED"

# ── transfer ─────────────────────────────────────────────────────────────────
#
# rsync when both ends have it: it resumes a part-transferred file instead of starting the
# gigabyte again, and skips what is already here. It is NOT given --delete — the server prunes at
# 30 days and this copy is meant to outlive that. --partial-dir keeps half-transferred pieces out
# of the set directory itself, so an interrupted run never leaves a set that looks complete.
FAILED_TRANSFER=0
BEFORE="$(mktemp)"; bk_list_sets "$DEST" | sort > "$BEFORE"

if command -v rsync >/dev/null 2>&1 && "${SSH[@]}" 'command -v rsync >/dev/null 2>&1'; then
  bk_say "transferring with rsync…"
  # A transfer error must NOT abort the run: whatever did arrive still has to be verified, and a
  # set that arrived broken has to be deleted rather than left looking finished.
  rsync -a --partial --partial-dir=.rsync-partial --human-readable \
    -e "ssh -p ${SSH_PORT} -o BatchMode=yes" \
    "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/sets/" "$DEST/sets/" 2>&1 | tee -a "$BK_LOG" \
    || bk_say "WARN: rsync reported an error — verifying what did arrive."
else
  bk_say "rsync not on both ends — falling back to scp, whole sets at a time."
  REMOTE_SETS="$("${SSH[@]}" "ls -1 ${REMOTE_DIR}/sets 2>/dev/null" || true)"
  for s in $REMOTE_SETS; do
    [ -d "$DEST/sets/$s" ] && continue
    bk_say "  fetching $s"
    # Staged then renamed, so an interrupted copy never lands under the real name.
    rm -rf "${DEST:?}/sets/.incoming"
    if scp -r -P "$SSH_PORT" -o BatchMode=yes \
         "${REMOTE_USER}@${REMOTE_HOST}:${REMOTE_DIR}/sets/${s}" "$DEST/sets/.incoming" >>"$BK_LOG" 2>&1; then
      mv "$DEST/sets/.incoming" "$DEST/sets/$s"
    else
      bk_say "  WARN: $s did not transfer — leaving it for the next run."
      rm -rf "${DEST:?}/sets/.incoming"
      FAILED_TRANSFER=1
    fi
  done
fi

AFTER="$(mktemp)"; bk_list_sets "$DEST" | sort > "$AFTER"
NEW="$(comm -13 "$BEFORE" "$AFTER" || true)"
rm -f "$BEFORE" "$AFTER"

# ── verify what ARRIVED, rather than trusting the transfer ───────────────────
#
# The server verified each file as it wrote it. This verifies the COPY, which is a different
# failure: a transfer cut off partway leaves a file of plausible size whose gzip trailer can
# survive by luck. The checksums recorded on the server settle it byte for byte — which is the
# only way to know the off-site copy is restorable rather than merely present.
FAILED=0
if [ -z "$NEW" ]; then
  bk_say "nothing new — the local copy already has every set on the server."
else
  for s in $NEW; do
    bk_say "verifying $s"
    if bk_verify_set "$DEST/sets/$s" true | tee -a "$BK_LOG"; then
      MIG="$(bk_manifest_get "$DEST/sets/$s/manifest.json" schemaMigration || true)"
      bk_say "OK  $s ($(du -sh "$DEST/sets/$s" | cut -f1), migration ${MIG:-unknown})"
    else
      bk_say "CORRUPT: $s did not verify after transfer — removing the bad copy so the next run refetches it."
      rm -rf "${DEST:?}/sets/${s:?}"
      FAILED=1
    fi
  done
fi

# ── local retention + report ─────────────────────────────────────────────────
PRUNED="$(bk_prune_sets "$DEST" "$KEEP_DAILY" "$KEEP_WEEKLY" "$KEEP_MONTHLY")"
bk_sweep_partials "$DEST"
find "$DEST/sets" -maxdepth 1 -name '.rsync-partial' -type d -exec rm -rf {} + 2>/dev/null || true

LOCAL_NEWEST="$(bk_list_sets "$DEST" | head -1)"
[ -n "$LOCAL_NEWEST" ] && echo "$LOCAL_NEWEST" > "$DEST/LATEST"
write_inventory

bk_say "held locally: $(bk_list_sets "$DEST" | wc -l) sets, newest ${LOCAL_NEWEST:-none}, $(du -sh "$DEST/sets" 2>/dev/null | cut -f1) in $DEST/sets (pruned ${PRUNED:-0})"
bk_say "inventory: $DEST/INVENTORY.md"

if [ "$FAILED" -ne 0 ] || [ "$FAILED_TRANSFER" -ne 0 ]; then
  bk_say "FINISHED WITH ERRORS — at least one set failed to transfer or arrived corrupt. Run again."
  exit 1
fi
if [ -n "$REMOTE_FAILED" ] || [ "$STALE" -ne 0 ]; then
  bk_say "FINISHED, BUT THE SERVER SIDE NEEDS ATTENTION — see the STALE/FAILED lines above."
  exit 1
fi
bk_say "done."
