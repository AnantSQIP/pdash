#!/usr/bin/env bash
# Launch the pdash always-on supervisor fully DETACHED from the current shell/session
# (new session via setsid + nohup, stdio to /dev/null) so it survives this terminal,
# this SSH/Claude session, and logout. Idempotent: the supervisor itself holds a
# flock, so running this twice will not create a second supervisor.
ROOT="/home/sqip031/pdash"
setsid nohup bash "$ROOT/scripts/keep-alive.sh" >/dev/null 2>&1 < /dev/null &
disown 2>/dev/null || true
echo "keep-alive supervisor launched (detached). Logs: $ROOT/.keep-alive.log"
