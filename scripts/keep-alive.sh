#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# pdash / SquarkIP — always-on supervisor.
#
# Keeps the demo link alive by ensuring three things stay up:
#   1. API      → http://localhost:4000/api/v1/health
#   2. Web      → http://localhost:3001  (Next.js production server)
#   3. Tunnel   → cloudflared quick tunnel that publishes the public URL
#
# DESIGN RULES (protect the boss's live link):
#   • NEVER restart a HEALTHY service. It only (re)starts something that is DOWN.
#   • It ADOPTS an already-running cloudflared instead of spawning a new one, so
#     the current public URL is preserved. A quick-tunnel URL changes only if the
#     tunnel process actually dies and has to be recreated — and if that happens
#     the new URL is written to ~/pdash/.tunnel-url and logged loudly.
#   • Single-instance (flock) so two supervisors never fight.
#
# Detached & session-independent: launch via scripts/keep-alive-start.sh
# ─────────────────────────────────────────────────────────────────────────────
set -u

ROOT="/home/sqip031/pdash"
CF="/home/sqip031/.local/bin/cloudflared"
API_PORT=4000
WEB_PORT=3001
INTERVAL=15

LOG="$ROOT/.keep-alive.log"
URLFILE="$ROOT/.tunnel-url"
LOCK="$ROOT/.keep-alive.lock"

log(){ echo "$(date '+%F %T') $*" >>"$LOG" 2>&1; }
is_up(){ curl -sf -o /dev/null --max-time 5 "$1" 2>/dev/null; }

# ── Production hardening (the public tunnel serves real users over HTTPS) ──────
# The API keys ALL of its hardening off NODE_ENV==='production' (Secure cookies,
# the validateEnv boot guard, and — critically — refusing the weak default JWT
# secret). Left unset, the public site ran in development mode and signed tokens
# with a guessable dev secret. We force production here, loading host secrets from
# .env.production (git-ignored). SAFETY: if no strong secret is configured we stay
# in development rather than boot-loop validateEnv and take the demo DOWN.
export NODE_ENV=production
if [ -f "$ROOT/.env.production" ]; then set -a; . "$ROOT/.env.production"; set +a; fi
if [ -z "${JWT_ACCESS_SECRET:-}" ] || [ "${#JWT_ACCESS_SECRET}" -lt 32 ] \
   || [ "${JWT_ACCESS_SECRET:-}" = "dev-access-secret-local-only-change-in-prod" ]; then
  export NODE_ENV=development
  log "WARN: production requested but JWT_ACCESS_SECRET is weak/unset — staying in development. Create $ROOT/.env.production with a strong (>=32 char) JWT_ACCESS_SECRET + CORS_ORIGINS to enable production hardening."
fi

# single instance
exec 9>"$LOCK" || exit 0
if ! flock -n 9; then
  echo "$(date '+%F %T') supervisor already running; exiting" >>"$LOG"
  exit 0
fi

start_api(){
  log "API :$API_PORT DOWN -> starting"
  ( cd "$ROOT" && setsid nohup node apps/api/dist/main.js >>"$ROOT/.api.log" 2>&1 & ) 2>/dev/null
}

start_web(){
  log "WEB :$WEB_PORT DOWN -> starting"
  ( cd "$ROOT/apps/web" && setsid nohup env API_ORIGIN="http://localhost:$API_PORT" \
      npx next start -p "$WEB_PORT" >>"$ROOT/.web.log" 2>&1 & ) 2>/dev/null
}

tunnel_running(){ pgrep -f 'cloudflared tunnel --url' >/dev/null 2>&1; }

start_tunnel(){
  log "TUNNEL DOWN -> creating a NEW quick tunnel (public URL will CHANGE)"
  ( setsid nohup "$CF" tunnel --url "http://localhost:$WEB_PORT" --no-autoupdate \
      >>"$ROOT/.cf-tunnel.log" 2>&1 & ) 2>/dev/null
  for _ in $(seq 1 20); do
    u=$(grep -oE 'https://[a-z0-9-]+\.trycloudflare\.com' "$ROOT/.cf-tunnel.log" 2>/dev/null | tail -1)
    if [ -n "$u" ]; then echo "$u" >"$URLFILE"; log "NEW TUNNEL URL: $u  (share this with the boss)"; return; fi
    sleep 2
  done
  log "WARN: tunnel started but no URL captured yet"
}

log "supervisor started (pid $$), interval ${INTERVAL}s"
while true; do
  is_up "http://localhost:$API_PORT/api/v1/health" || start_api
  is_up "http://localhost:$WEB_PORT/login"         || start_web
  tunnel_running                                    || start_tunnel
  sleep "$INTERVAL"
done
