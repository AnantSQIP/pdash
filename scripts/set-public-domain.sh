#!/usr/bin/env bash
#
# Point the live deployment at a public domain (write the Caddyfile, get a certificate, reload).
#
# USAGE (as root, on the VPS, from the repo root):
#   bash scripts/set-public-domain.sh squarkip.io
#
# This is the ONLY thing that has to change to move the dashboard onto a real domain, because
# nothing in the application knows its own public URL:
#
#   * the browser calls the API at the relative path /api/v1 (apps/web/lib/api.ts), which Next
#     rewrites server-side to http://api:4000 on the compose network. The public hostname is
#     never baked into the build, so a domain change needs NO rebuild of the web image.
#   * auth cookies are host-only — auth.controller.ts sets no `domain`, so they scope themselves
#     to whatever host the browser used. Sessions on the old URL are not disturbed.
#   * there is no CSRF/Origin check, and normal traffic is same-origin through the Next proxy,
#     so CORS_ORIGINS is not on the critical path. It is updated anyway (see UPDATE_CORS) because
#     a stale allow-list is a trap for the next person who adds a direct cross-origin caller.
#
# The old host keeps working by default. That is deliberate: DNS takes up to 24h to propagate,
# and host-only cookies mean anyone redirected to the new name is silently logged out. Serve both
# until the new name is verified, then retire the old one on purpose:
#
#   LEGACY_MODE=redirect bash scripts/set-public-domain.sh squarkip.io   # old host -> new host
#   LEGACY_MODE=drop     bash scripts/set-public-domain.sh squarkip.io   # old host stops answering
#
# Other knobs:
#   LEGACY_HOSTS=a.example,b.example   hosts to keep answering (default: the sslip.io IP host)
#   WWW=redirect|serve|none            what to do with www.<domain> (default: redirect to apex)
#   UPDATE_CORS=false                  leave CORS_ORIGINS in .env.production alone
#   RESTART_API=true                   restart the api container so a CORS change takes effect now
#   SKIP_DNS_CHECK=true                skip the "does this domain point here yet" preflight
#
set -euo pipefail

PRIMARY="${1:-${PUBLIC_HOST:-}}"
LEGACY_HOSTS="${LEGACY_HOSTS:-217.76.59.244.sslip.io}"
LEGACY_MODE="${LEGACY_MODE:-serve}"
WWW="${WWW:-redirect}"
UPDATE_CORS="${UPDATE_CORS:-true}"
RESTART_API="${RESTART_API:-false}"
SKIP_DNS_CHECK="${SKIP_DNS_CHECK:-false}"

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
CADDYFILE=/etc/caddy/Caddyfile
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"

cd "$REPO_DIR"

# ── preflight ────────────────────────────────────────────────────────────────
[ -n "$PRIMARY" ] || { echo "FATAL: give the domain, e.g. bash scripts/set-public-domain.sh squarkip.io"; exit 1; }
[ "$(id -u)" -eq 0 ] || { echo "FATAL: run as root (it writes ${CADDYFILE} and reloads Caddy)."; exit 1; }
[ -f docker-compose.prod.yml ] || { echo "FATAL: run from the repo root."; exit 1; }
command -v caddy >/dev/null || { echo "FATAL: Caddy is not installed. Run scripts/contabo-deploy.sh first."; exit 1; }
case "$LEGACY_MODE" in serve|redirect|drop) ;; *) echo "FATAL: LEGACY_MODE must be serve, redirect or drop."; exit 1;; esac
case "$WWW" in redirect|serve|none) ;; *) echo "FATAL: WWW must be redirect, serve or none."; exit 1;; esac

# A bare "example.com" has one dot; "app.example.com" has two. Only an apex gets a www variant.
IS_APEX=false
[ "$(tr -cd '.' <<<"$PRIMARY" | wc -c)" -eq 1 ] && IS_APEX=true
[ "$IS_APEX" = true ] || WWW=none

echo "==> Public host: ${PRIMARY}   (www: ${WWW}, legacy: ${LEGACY_MODE})"

# ── DNS preflight ────────────────────────────────────────────────────────────
#
# Caddy asks Let's Encrypt for a certificate the moment it loads a new hostname, and LE proves
# ownership by fetching http://<host>/.well-known/... — which only reaches us if DNS already
# points here. A premature reload therefore does not fail gracefully: it burns one of the five
# failed validations per hostname per hour that LE allows, and repeated attempts lock the name
# out for the rest of the hour. So check first and refuse, rather than find out from a rate limit.
if [ "$SKIP_DNS_CHECK" != true ]; then
  echo "==> Checking that ${PRIMARY} resolves to this server"
  MY_IP="$(curl -fsS --max-time 10 https://api.ipify.org 2>/dev/null || curl -fsS --max-time 10 https://ifconfig.me 2>/dev/null || true)"
  [ -n "$MY_IP" ] || { echo "FATAL: could not determine this server's public IP. Re-run with SKIP_DNS_CHECK=true if you are sure."; exit 1; }

  resolve() { getent ahostsv4 "$1" 2>/dev/null | awk '{print $1}' | sort -u; }
  CHECK_HOSTS="$PRIMARY"
  [ "$WWW" = none ] || CHECK_HOSTS="$CHECK_HOSTS www.${PRIMARY}"

  BAD=0
  for h in $CHECK_HOSTS; do
    GOT="$(resolve "$h" | tr '\n' ' ' | sed 's/ $//')"
    if [ -z "$GOT" ]; then
      echo "    ${h}: does not resolve yet"; BAD=1
    elif grep -qx "$MY_IP" <<<"$(resolve "$h")"; then
      echo "    ${h}: ${GOT}  OK"
    else
      echo "    ${h}: ${GOT}  != this server (${MY_IP})"; BAD=1
    fi
  done

  if [ "$BAD" = 1 ]; then
    cat <<EOF

FATAL: DNS is not pointing here yet, so Let's Encrypt cannot verify the domain.

  At your DNS provider, set:   A    @      ${MY_IP}     (TTL 300)
  and keep:                    CNAME www   ${PRIMARY}
  removing every other A record for the apex.

Then wait for it to propagate (5-30 min at TTL 300) and run this again.
Nothing has been changed.
EOF
    exit 1
  fi
fi

# ── write the Caddyfile ──────────────────────────────────────────────────────
#
# Kept in one file with one owner: re-running this script is the only supported way to change
# the public hostname, so the whole file is regenerated rather than patched. The previous one is
# copied aside first — if the certificate does not come through, `cp` it back and reload.
BACKUP="${CADDYFILE}.$(date +%Y%m%d-%H%M%S).bak"
[ -f "$CADDYFILE" ] && cp -a "$CADDYFILE" "$BACKUP" && echo "==> Backed up existing Caddyfile to ${BACKUP}"

# Hosts that SERVE the app share one site block; every name in it gets its own certificate.
SERVE_HOSTS="$PRIMARY"
[ "$WWW" = serve ] && SERVE_HOSTS="${SERVE_HOSTS}, www.${PRIMARY}"
if [ "$LEGACY_MODE" = serve ]; then
  for h in ${LEGACY_HOSTS//,/ }; do SERVE_HOSTS="${SERVE_HOSTS}, ${h}"; done
fi

{
  echo "# Generated by scripts/set-public-domain.sh on $(date -Is) — do not hand-edit."
  echo "# Re-run that script to change the public hostname."
  echo
  echo "${SERVE_HOSTS} {"
  echo "    reverse_proxy 127.0.0.1:3000"
  echo "}"

  # www redirects rather than serving, because cookies are host-only: if both names served the
  # app, a person on www and the same person on the apex would hold two unrelated sessions and
  # logging out of one would leave the other signed in. One canonical host avoids that entirely.
  if [ "$WWW" = redirect ]; then
    echo
    echo "www.${PRIMARY} {"
    echo "    redir https://${PRIMARY}{uri} permanent"
    echo "}"
  fi

  if [ "$LEGACY_MODE" = redirect ]; then
    echo
    for h in ${LEGACY_HOSTS//,/ }; do
      echo "${h} {"
      echo "    redir https://${PRIMARY}{uri} permanent"
      echo "}"
      echo
    done
  fi
} > "$CADDYFILE"

# ── validate, then reload ────────────────────────────────────────────────────
#
# `caddy reload` on a broken config leaves the OLD config running, but validating first turns a
# silent "nothing changed" into a visible error, and keeps a typo from being blamed on DNS.
echo "==> Validating the config"
if ! caddy validate --config "$CADDYFILE" --adapter caddyfile >/dev/null 2>&1; then
  echo "FATAL: the generated Caddyfile is invalid:"
  caddy validate --config "$CADDYFILE" --adapter caddyfile 2>&1 | sed 's/^/    /'
  [ -f "$BACKUP" ] && cp -a "$BACKUP" "$CADDYFILE" && echo "    restored the previous Caddyfile."
  exit 1
fi

echo "==> Reloading Caddy (a reload is graceful — no connection is dropped)"
systemctl reload caddy 2>/dev/null || systemctl restart caddy

# ── CORS allow-list ──────────────────────────────────────────────────────────
if [ "$UPDATE_CORS" = true ] && [ -f .env.production ]; then
  WANT="https://${PRIMARY}"
  [ "$WWW" = serve ] && WANT="${WANT},https://www.${PRIMARY}"
  if [ "$LEGACY_MODE" = serve ]; then
    for h in ${LEGACY_HOSTS//,/ }; do WANT="${WANT},https://${h}"; done
  fi
  if grep -q '^CORS_ORIGINS=' .env.production; then
    sed -i "s|^CORS_ORIGINS=.*|CORS_ORIGINS=${WANT}|" .env.production
  else
    echo "CORS_ORIGINS=${WANT}" >> .env.production
  fi
  chmod 600 .env.production
  echo "==> CORS_ORIGINS=${WANT}"
  if [ "$RESTART_API" = true ]; then
    echo "    restarting the api container so it picks this up"
    $COMPOSE up -d api
  else
    echo "    NOT applied yet — the api container reads this at boot. It is not needed for the"
    echo "    dashboard to work (all traffic is same-origin), so apply it whenever convenient:"
    echo "      ${COMPOSE} up -d api"
  fi
fi

# ── verify ───────────────────────────────────────────────────────────────────
#
# The first request for a new hostname is what triggers certificate issuance, and that takes a
# few seconds. Poll rather than check once, so a slow ACME round-trip does not read as a failure.
echo "==> Waiting for the certificate (first request triggers issuance)"
OK=0
for _ in $(seq 1 30); do
  CODE="$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "https://${PRIMARY}/login" 2>/dev/null || true)"
  if [ "$CODE" = "200" ]; then OK=1; break; fi
  sleep 4
done

echo
echo "======================================================================"
if [ "$OK" = 1 ]; then
  echo " LIVE:  https://${PRIMARY}"
  [ "$WWW" = redirect ] && echo " www.${PRIMARY} redirects here (301)."
  case "$LEGACY_MODE" in
    serve)    echo " Still serving: ${LEGACY_HOSTS} — existing sessions there are untouched." ;;
    redirect) echo " ${LEGACY_HOSTS} now redirects here. Anyone signed in there must sign in again" ;;
    drop)     echo " ${LEGACY_HOSTS} no longer answers." ;;
  esac
else
  echo " NOT SERVING YET on https://${PRIMARY} (last status: ${CODE:-none})."
  echo " Check:  journalctl -u caddy -n 50 --no-pager"
  echo " Roll back with:  cp -a ${BACKUP:-<no backup>} ${CADDYFILE} && systemctl reload caddy"
fi
echo "======================================================================"
