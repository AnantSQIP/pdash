#!/usr/bin/env bash
#
# Shared helpers for the backup scripts. Sourced, never executed.
#
#   scripts/backup.sh         — takes a backup set on the server (Contabo)
#   scripts/backup-pull.sh    — copies those sets to the owner's machine
#   scripts/restore-drill.sh  — proves a set actually restores
#   scripts/backup-purge.sh   — deletes the pre-cutover backups
#
# WHY A SHARED FILE
#
# The server verifies a dump when it writes it and the laptop verifies the same dump when it
# arrives. Those are two different failures (a bad dump; a bad transfer) and they must be caught
# by the SAME checks — otherwise a file passes on one side and fails on the other for a reason
# that is not corruption, and the first thing anybody does with a check that cries wolf is stop
# reading it. One implementation, sourced by both, cannot drift.
#
# THE LAYOUT, which is identical on the server and on the laptop:
#
#   <root>/
#     sets/
#       pdash-YYYY-MM-DD_HHMM/      one run = one directory = one restorable point in time
#         db.sql.gz                 pg_dump --clean --if-exists, gzipped
#         docs.tar.gz               everything under the api container's /app/.data
#         config.tar.gz             .env.production, compose file, Caddyfile, crontab  (server only,
#                                   mode 0600 — HOLDS LIVE SECRETS)
#         manifest.json             what this set is: migration state, git commit, row counts, sizes
#         SHA256SUMS                checksums of the four files above
#     LATEST                        name of the newest set that passed verification
#     LAST_RUN_FAILED               present ONLY when the most recent run failed; holds the reason
#
# A set directory is the unit of everything: it is verified as a whole, transferred as a whole,
# pruned as a whole and restored as a whole. There is no way to end up holding a database from
# Tuesday and the documents from Friday.

# ── naming ───────────────────────────────────────────────────────────────────

BK_SET_PREFIX="pdash-"

# The name for a set taken now. Sortable, and readable at a glance on either side.
bk_new_set_name() { echo "${BK_SET_PREFIX}$(date +%Y-%m-%d_%H%M)"; }

# The YYYY-MM-DD out of a set name, or nothing if it isn't one.
bk_set_date() {
  local name="${1##*/}"
  case "$name" in
    "${BK_SET_PREFIX}"[0-9][0-9][0-9][0-9]-[0-9][0-9]-[0-9][0-9]_[0-9][0-9][0-9][0-9])
      name="${name#"$BK_SET_PREFIX"}"; echo "${name%%_*}";;
    *) return 1;;
  esac
}

# Newest first. Set names sort lexicographically in time order, which is the point of the format.
bk_list_sets() {
  local root="$1"
  [ -d "$root/sets" ] || return 0
  find "$root/sets" -mindepth 1 -maxdepth 1 -type d -name "${BK_SET_PREFIX}*" -printf '%f\n' 2>/dev/null | sort -r
}

# ── talking ──────────────────────────────────────────────────────────────────

BK_LOG="${BK_LOG:-/dev/null}"
# Progress on stdout, failures on stderr — so a green run is silent on stderr and cron's mail
# means something went wrong, rather than arriving every single night until nobody opens it.
bk_say() { echo "[$(date -Is)] $*" | tee -a "$BK_LOG"; }

# A failure nobody hears about is the whole problem with backups, so a failure here is loud in
# four places at once: stderr (which cron mails), the log file, the syslog, and a marker file in
# the backup root that the NEXT run and the laptop both look at. Set BACKUP_ALERT_CMD to add a
# fifth (`BACKUP_ALERT_CMD='curl -fsS -d @- https://…'` — the message arrives on stdin).
bk_alert() {
  local root="$1"; shift
  local msg="$*"
  echo "[$(date -Is)] BACKUP FAILURE: $msg" | tee -a "$BK_LOG" >&2
  command -v logger >/dev/null 2>&1 && logger -t pdash-backup -p user.err -- "$msg"
  if [ -n "${root:-}" ] && [ -d "$root" ]; then
    printf '%s\n%s\n' "$(date -Is)" "$msg" > "$root/LAST_RUN_FAILED" 2>/dev/null || true
  fi
  if [ -n "${BACKUP_ALERT_CMD:-}" ]; then
    printf 'pdash backup failed at %s\n%s\n' "$(date -Is)" "$msg" | sh -c "$BACKUP_ALERT_CMD" \
      || echo "  (BACKUP_ALERT_CMD itself failed)" >&2
  fi
}

bk_clear_failure_marker() { rm -f "${1:?}/LAST_RUN_FAILED" 2>/dev/null || true; }

# ── verification ─────────────────────────────────────────────────────────────

# "<table count> <1 if the dump is complete, else 0>" for a gzipped pg_dump.
#
# ONE pass over the WHOLE file. `--clean --if-exists` emits hundreds of DROPs before the first
# CREATE TABLE, so a head-limited check finds no schema in a perfectly good dump.
#
# Do NOT reach for `grep -q` or `grep -m1`, however tempting the early exit looks: grep stops at
# the first match and closes the pipe, zcat dies of SIGPIPE (141), and `set -o pipefail` reports
# 141 for the pipeline — so the check fails hardest exactly when the dump is GOOD and the match is
# found soonest. awk reads to EOF regardless.
bk_db_dump_stats() {
  zcat "$1" | awk '
    /^CREATE TABLE/                         { t++ }
    /^-- PostgreSQL database dump complete/ { c = 1 }
    END                                     { print t + 0, c + 0 }'
}

# Verify one dump file. Echoes the table count on success; on failure explains and returns 1.
bk_verify_db_file() {
  local f="$1" tables complete stats
  if [ ! -s "$f" ]; then echo "missing or empty: $f"; return 1; fi
  if ! gzip -t "$f" 2>/dev/null; then echo "not a valid gzip file: $f"; return 1; fi
  stats="$(bk_db_dump_stats "$f")"
  tables="${stats%% *}"; complete="${stats##* }"
  if [ "$tables" -lt 1 ]; then echo "declares no tables — the dump did not work: $f"; return 1; fi
  # pg_dump writes that footer last of all, so its absence means the dump was cut short.
  if [ "$complete" -ne 1 ]; then echo "truncated — pg_dump's end-of-dump marker is missing: $f"; return 1; fi
  echo "$tables"
}

bk_verify_docs_file() {
  local f="$1"
  if [ ! -s "$f" ]; then echo "missing or empty: $f"; return 1; fi
  if ! tar -tzf "$f" >/dev/null 2>&1; then echo "not a readable tar archive: $f"; return 1; fi
  echo "ok"
}

# Pull one value out of a manifest without needing jq on the server. The trailing trim matters:
# a number that is last on its line captures the space before the closing brace with it, and
# "12 " != "12" when a drill compares row counts.
bk_manifest_get() {
  [ -f "$1" ] || return 1
  sed -n "s/.*\"$2\"[[:space:]]*:[[:space:]]*\"\{0,1\}\([^\",}]*\)\"\{0,1\}.*/\1/p" "$1" \
    | sed 's/[[:space:]]*$//' | head -1
}

# Verify a whole set. Prints one line per file. Returns 1 if anything is wrong.
#
# `strict` (the second argument, default true) also re-computes the SHA256SUMS. That is the check
# that proves a TRANSFER — a copy cut off partway leaves a plausible-looking file whose gzip
# trailer happens to survive often enough to matter.
bk_verify_set() {
  local dir="$1" strict="${2:-true}" rc=0 out
  if [ ! -d "$dir" ]; then echo "  no such set: $dir"; return 1; fi

  if [ ! -f "$dir/manifest.json" ]; then
    echo "  manifest.json missing — this set was never finished"; rc=1
  fi

  if out="$(bk_verify_db_file "$dir/db.sql.gz")"; then
    echo "  ok   db.sql.gz    ($(du -h "$dir/db.sql.gz" | cut -f1), ${out} tables)"
  else
    echo "  FAIL db.sql.gz    $out"; rc=1
  fi

  # A set from an install with no uploaded documents legitimately has none.
  if [ -e "$dir/docs.tar.gz" ]; then
    if out="$(bk_verify_docs_file "$dir/docs.tar.gz")"; then
      echo "  ok   docs.tar.gz  ($(du -h "$dir/docs.tar.gz" | cut -f1))"
    else
      echo "  FAIL docs.tar.gz  $out"; rc=1
    fi
  fi

  if [ -e "$dir/config.tar.gz" ]; then
    if tar -tzf "$dir/config.tar.gz" >/dev/null 2>&1; then
      echo "  ok   config.tar.gz ($(du -h "$dir/config.tar.gz" | cut -f1))"
    else
      echo "  FAIL config.tar.gz not a readable tar archive"; rc=1
    fi
  fi

  if [ "$strict" = true ]; then
    if [ -f "$dir/SHA256SUMS" ]; then
      if (cd "$dir" && sha256sum -c SHA256SUMS >/dev/null 2>&1); then
        echo "  ok   SHA256SUMS  (every file byte-for-byte as written)"
      else
        echo "  FAIL SHA256SUMS  checksums do not match — this copy is corrupt"; rc=1
      fi
    else
      echo "  FAIL SHA256SUMS  missing — cannot prove this copy is intact"; rc=1
    fi
  fi

  return "$rc"
}

# ── retention ────────────────────────────────────────────────────────────────

# Grandfather-father-son pruning, by the DATE IN THE SET NAME rather than by mtime — a file
# copied to the laptop today has today's mtime and would otherwise look new forever, so the two
# sides would keep different things while claiming the same policy.
#
#   bk_prune_sets <root> <daily_days> <weekly_days> <monthly_days> [dry_run]
#
# A set is kept if ANY of these hold:
#   • it is younger than <daily_days>;
#   • it is a Sunday set younger than <weekly_days>;
#   • it is a 1st-of-month set younger than <monthly_days>  (0 = keep month-ends forever);
#   • it is the newest set there is — the last copy is never pruned, whatever the dates say.
bk_prune_sets() {
  local root="$1" daily="$2" weekly="$3" monthly="$4" dry="${5:-false}"
  local newest removed=0 name d age dow dom keep set_s now_s
  newest="$(bk_list_sets "$root" | head -1)"
  now_s="$(date +%s)"

  while read -r name; do
    [ -n "$name" ] || continue
    [ "$name" = "$newest" ] && continue
    d="$(bk_set_date "$name")" || continue
    set_s="$(date -d "$d" +%s 2>/dev/null)" || continue
    age=$(( (now_s - set_s) / 86400 ))
    dow="$(date -d "$d" +%u)"
    dom="$(date -d "$d" +%d)"

    keep=false
    [ "$age" -le "$daily" ] && keep=true
    if [ "$keep" = false ] && [ "$dow" = "7" ] && { [ "$weekly" -eq 0 ] || [ "$age" -le "$weekly" ]; }; then keep=true; fi
    if [ "$keep" = false ] && [ "$dom" = "01" ] && { [ "$monthly" -eq 0 ] || [ "$age" -le "$monthly" ]; }; then keep=true; fi

    if [ "$keep" = false ]; then
      if [ "$dry" = true ]; then
        echo "would prune $name (${age}d old)"
      else
        rm -rf "${root:?}/sets/${name:?}"
        removed=$((removed + 1))
      fi
    fi
  done <<EOF
$(bk_list_sets "$root")
EOF

  [ "$dry" = true ] || echo "$removed"
}

# Anything a previous run left half-written. `.partial` is only ever an in-flight file.
bk_sweep_partials() {
  find "${1:?}" -name '*.partial' -mtime +1 -delete 2>/dev/null || true
}

# ── reporting ────────────────────────────────────────────────────────────────

# One line per set, newest first: name, size, and the migration it belongs to.
bk_inventory() {
  local root="$1" name dir size mig when
  while read -r name; do
    [ -n "$name" ] || continue
    dir="$root/sets/$name"
    size="$(du -sh "$dir" 2>/dev/null | cut -f1)"
    mig="$(bk_manifest_get "$dir/manifest.json" schemaMigration || true)"
    when="$(bk_manifest_get "$dir/manifest.json" createdAt || true)"
    printf '%-26s %8s  %-32s %s\n' "$name" "${size:-?}" "${mig:-unknown migration}" "${when:-}"
  done <<EOF
$(bk_list_sets "$root")
EOF
}
