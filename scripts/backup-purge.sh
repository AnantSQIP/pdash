#!/usr/bin/env bash
#
# Delete the OLD backups — the ones taken before the system was cleared — so the archive starts
# from the cutover and nothing in it is demo data.
#
# THIS IS THE ONE SCRIPT IN THIS SET THAT DESTROYS THINGS. Everything else here only ever writes.
# Read the plan it prints before you answer the prompt: once these files are gone, the data they
# held is gone with them, and the whole point of the preceding weeks was that it was not.
#
# WHAT MAKES IT SAFE
#
#   • it does nothing at all without --yes, and then still asks you to type PURGE;
#   • it prints every file it intends to remove, with its size and date, and a total, FIRST;
#   • it never touches anything created at or after the cutover moment — the new regime's own
#     backups cannot be caught by a purge of the old one, even if you run this a week late;
#   • it keeps the newest backup that still VERIFIES, in each directory, unless you say otherwise.
#     A purge that leaves you with nothing is one typo away from a purge that leaves you with
#     nothing you wanted. --no-keep-last removes even that, and asks for a second confirmation;
#   • it refuses any directory that is not recognisably a backup directory, and any directory
#     inside the git repo;
#   • it is safe to run twice: the second run finds nothing left to do.
#
# USAGE
#
#   ./scripts/backup-purge.sh                       # print the plan and stop (refuses to delete)
#   ./scripts/backup-purge.sh --yes                 # print the plan, ask, then delete
#   ./scripts/backup-purge.sh --yes --dir /root/backups
#   ./scripts/backup-purge.sh --yes --cutover '2026-09-11 00:00'
#   ./scripts/backup-purge.sh --yes --no-keep-last  # leave nothing at all from before the cutover
#   CONFIRM=PURGE ./scripts/backup-purge.sh --yes   # for a non-interactive shell
#
# ON THE SERVER it defaults to /var/backups/pdash AND /root/backups — the second is the ad-hoc
# db-only dump the original deploy script installed, which nobody verified and which holds no
# documents. ON YOUR MACHINE it defaults to the pull destination.

set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
# shellcheck source=scripts/backup-lib.sh
. "$REPO_ROOT/scripts/backup-lib.sh"

CONFIRMED=false
KEEP_LAST=true
DRY_RUN=false
CUTOVER_RAW=""
DIRS=()

while [ $# -gt 0 ]; do
  case "$1" in
    --yes)          CONFIRMED=true;;
    --dry-run)      DRY_RUN=true;;
    --no-keep-last) KEEP_LAST=false;;
    --keep-last)    KEEP_LAST=true;;
    --cutover)      CUTOVER_RAW="${2:?--cutover needs a timestamp}"; shift;;
    --dir)          DIRS+=("${2:?--dir needs a path}"); shift;;
    -h|--help)      sed -n '2,40p' "${BASH_SOURCE[0]}"; exit 0;;
    *) echo "unknown option: $1" >&2; exit 2;;
  esac
  shift
done

# ── the cutover moment ───────────────────────────────────────────────────────
#
# Default: NOW. Everything that exists at the moment you run this is "before the cutover"; the
# first backup of the new regime is taken after it and is therefore untouchable by definition.
# Pass --cutover explicitly if you are purging days later and want a fixed line.
if [ -n "$CUTOVER_RAW" ]; then
  CUTOVER_S="$(date -d "$CUTOVER_RAW" +%s)" || { echo "FATAL: unreadable --cutover '$CUTOVER_RAW'" >&2; exit 2; }
else
  CUTOVER_S="$(date +%s)"
fi
CUTOVER_H="$(date -d "@$CUTOVER_S" -Is)"

# ── which directories ────────────────────────────────────────────────────────
if [ "${#DIRS[@]}" -eq 0 ]; then
  for d in /var/backups/pdash /root/backups "${DEST:-/mnt/c/Users/anant/pdash-backups}"; do
    [ -d "$d" ] && DIRS+=("$d")
  done
fi
if [ "${#DIRS[@]}" -eq 0 ]; then
  echo "Nothing to do: none of the default backup directories exist on this machine."
  exit 0
fi

# A wrong path here is an `rm -rf` on something that is not a backup. Every directory must clear
# all three of these before a single file is listed, let alone removed.
for d in "${DIRS[@]}"; do
  abs="$(readlink -m "$d")"
  case "$abs" in
    /|/root|/home|/var|/var/backups|/mnt|/mnt/c|/mnt/c/Users)
      echo "FATAL: refusing to purge '$abs' — that is not a backup directory." >&2; exit 1;;
  esac
  case "$abs/" in
    "$REPO_ROOT"/*)
      echo "FATAL: refusing to purge '$abs' — it is inside the git repo." >&2; exit 1;;
  esac
  # It must LOOK like one of ours: a sets/ directory, or files with our names in it.
  # (no pipe here: `find … | grep -q` can die of SIGPIPE under pipefail and fail a good check)
  if [ ! -d "$abs/sets" ] && [ -z "$(find "$abs" -maxdepth 1 -name 'pdash-*' -print -quit 2>/dev/null)" ]; then
    echo "FATAL: refusing to purge '$abs' — no sets/ directory and no pdash-* files. Wrong path?" >&2
    exit 1
  fi
done

human() { du -sh "$1" 2>/dev/null | cut -f1; }

# ── build the plan ───────────────────────────────────────────────────────────
#
# One pass, no deletions. The list is printed in full before anything is asked, because a
# confirmation prompt you cannot check the consequences of is theatre.
PLAN="$(mktemp)"
KEPT="$(mktemp)"
trap 'rm -f "$PLAN" "$KEPT"' EXIT

consider() {  # <path> — add to the plan unless it postdates the cutover
  local p="$1" mt
  mt="$(stat -c %Y "$p" 2>/dev/null || echo 0)"
  if [ "$mt" -ge "$CUTOVER_S" ]; then
    printf '  KEEP (after cutover)  %-52s %8s  %s\n' "$p" "$(human "$p")" "$(date -d "@$mt" '+%Y-%m-%d %H:%M')" >> "$KEPT"
    return
  fi
  printf '%s\t%s\t%s\n' "$p" "$(human "$p")" "$(date -d "@$mt" '+%Y-%m-%d %H:%M')" >> "$PLAN"
}

# The newest thing in a directory that still passes verification — the one copy a mistake can be
# undone from. Found before anything is planned, so it can be excluded from the plan rather than
# restored afterwards.
newest_good() {
  local dir="$1" name
  while read -r name; do
    [ -n "$name" ] || continue
    if bk_verify_set "$dir/sets/$name" true >/dev/null 2>&1; then echo "$dir/sets/$name"; return; fi
  done <<EOF
$(bk_list_sets "$dir")
EOF
  # Old flat layout: a bare pdash-db-*.sql.gz next to its docs tarball.
  local f
  while read -r f; do
    [ -n "$f" ] || continue
    if bk_verify_db_file "$f" >/dev/null 2>&1; then echo "$f"; return; fi
  done <<EOF
$(find "$dir" -maxdepth 1 -type f -name 'pdash-*.sql.gz' -printf '%T@ %p\n' 2>/dev/null | sort -rn | cut -d' ' -f2-)
EOF
}

echo "=== PURGE PLAN"
echo "    cutover:  $CUTOVER_H   (nothing at or after this moment is touched)"
echo "    keep-last: $KEEP_LAST"
echo

for d in "${DIRS[@]}"; do
  abs="$(readlink -m "$d")"
  echo "--- $abs"
  SPARED=""
  if [ "$KEEP_LAST" = true ]; then
    SPARED="$(newest_good "$abs" || true)"
    if [ -n "$SPARED" ]; then
      echo "    sparing the newest VERIFIED backup here: $(basename "$SPARED")"
    else
      echo "    WARNING: nothing in this directory verifies — there is no good copy to spare."
    fi
  fi

  # set directories
  while read -r name; do
    [ -n "$name" ] || continue
    [ "$abs/sets/$name" = "$SPARED" ] && continue
    consider "$abs/sets/$name"
  done <<EOF
$(bk_list_sets "$abs")
EOF

  # old flat layout + the ad-hoc /root/backups dumps + anything half-written
  while read -r f; do
    [ -n "$f" ] || continue
    [ "$f" = "$SPARED" ] && continue
    consider "$f"
  done <<EOF
$(find "$abs" -maxdepth 1 -type f \( -name 'pdash-*.sql.gz' -o -name 'pdash-*.tar.gz' -o -name '*.partial' \) 2>/dev/null | sort)
EOF
done

echo
if [ ! -s "$PLAN" ]; then
  echo "Nothing to purge — every backup here is either after the cutover or is the one being spared."
  [ -s "$KEPT" ] && { echo; cat "$KEPT"; }
  exit 0
fi

printf '%-56s %8s  %s\n' "TO BE DELETED" "SIZE" "LAST WRITTEN"
printf '%s\n' "-------------------------------------------------------------------------------"
while IFS=$'\t' read -r p size when; do
  printf '%-56s %8s  %s\n' "$p" "$size" "$when"
done < "$PLAN"
COUNT="$(wc -l < "$PLAN")"
echo
if [ -s "$KEPT" ]; then
  echo "Left alone because they postdate the cutover:"
  cat "$KEPT"
  echo
fi
echo "$COUNT item(s) would be deleted."
echo

# ── act ──────────────────────────────────────────────────────────────────────
if [ "$DRY_RUN" = true ]; then
  echo "--dry-run: nothing was deleted."
  exit 0
fi
if [ "$CONFIRMED" != true ]; then
  echo "Refusing to delete anything without --yes. Re-run with --yes once the list above is right."
  exit 1
fi

PHRASE="PURGE"
if [ "$KEEP_LAST" != true ]; then
  echo "⚠ --no-keep-last: this leaves NO pre-cutover backup at all. If the new schedule has not"
  echo "  yet produced a verified set, you will have nothing to fall back to."
  PHRASE="PURGE EVERYTHING"
fi

if [ -n "${CONFIRM:-}" ]; then
  ANSWER="$CONFIRM"
elif [ -t 0 ]; then
  read -r -p "Type $PHRASE to delete the $COUNT item(s) above: " ANSWER
else
  echo "FATAL: not a terminal and CONFIRM is unset — refusing to delete unattended." >&2
  exit 1
fi
if [ "$ANSWER" != "$PHRASE" ]; then
  echo "Not confirmed — nothing was deleted."
  exit 1
fi

DELETED=0
while IFS=$'\t' read -r p _size _when; do
  [ -e "$p" ] || continue          # already gone: running twice is not an error
  rm -rf -- "$p"
  DELETED=$((DELETED + 1))
done < "$PLAN"
# Tidy the empty shells a purge leaves behind, but never the backup root itself.
for d in "${DIRS[@]}"; do
  abs="$(readlink -m "$d")"
  rmdir "$abs/sets" 2>/dev/null || true
  mkdir -p "$abs/sets"
done

echo "Purged $DELETED item(s)."
echo
echo "Now confirm the new regime is running:"
echo "  ./scripts/backup.sh && ./scripts/restore-drill.sh"
