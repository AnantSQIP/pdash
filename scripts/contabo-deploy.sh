#!/usr/bin/env bash
#
# One-shot Contabo (Ubuntu/Debian) deploy for pdash. Runs Phases 1-8 of the runbook:
# system prep + swap + firewall, Docker, secrets, build & launch, seed, HTTPS (Caddy),
# and nightly DB backups. Safe to re-run (idempotent).
#
# USAGE (as root, from the repo root, after `git clone` + `git checkout`):
#   bash scripts/contabo-deploy.sh
#
# Override the public hostname (default = sslip.io on the VPS IP, i.e. real HTTPS with
# no domain needed) by exporting PUBLIC_HOST before running, e.g.:
#   PUBLIC_HOST=pdash.mycompany.com bash scripts/contabo-deploy.sh
#
set -euo pipefail

PUBLIC_HOST="${PUBLIC_HOST:-217.76.59.244.sslip.io}"
REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
export DEBIAN_FRONTEND=noninteractive NEEDRESTART_MODE=a

cd "$REPO_DIR"

# ── preflight ────────────────────────────────────────────────────────────────
[ "$(id -u)" -eq 0 ] || { echo "FATAL: run as root."; exit 1; }
command -v apt-get >/dev/null || { echo "FATAL: this script targets Ubuntu/Debian (apt)."; exit 1; }
[ -f docker-compose.prod.yml ] || { echo "FATAL: run from the repo root (docker-compose.prod.yml not found)."; exit 1; }
echo "==> Deploying pdash to https://${PUBLIC_HOST}  (repo: ${REPO_DIR})"

# ── [1/8] system update + swap + firewall ────────────────────────────────────
echo "==> [1/8] System update, swap, firewall"
apt-get update -y && apt-get upgrade -y
if ! swapon --show 2>/dev/null | grep -q '/swapfile'; then
  fallocate -l 4G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi
apt-get install -y ufw curl git openssl
ufw allow 22/tcp; ufw allow 80/tcp; ufw allow 443/tcp
ufw --force enable

# ── [2/8] Docker ─────────────────────────────────────────────────────────────
echo "==> [2/8] Docker"
if ! command -v docker >/dev/null; then curl -fsSL https://get.docker.com | sh; fi
systemctl enable --now docker

# ── [3/8] secrets (.env.production) — generated once, preserved on re-run ─────
echo "==> [3/8] Secrets"
if [ ! -f .env.production ]; then
  DB_PW="$(openssl rand -base64 32 | tr -dc 'A-Za-z0-9' | cut -c1-24)"
  JWT="$(openssl rand -base64 48)"
  cat > .env.production <<EOF
POSTGRES_USER=pdash
POSTGRES_PASSWORD=${DB_PW}
POSTGRES_DB=pdash
DATABASE_URL=postgresql://pdash:${DB_PW}@postgres:5432/pdash?schema=public
JWT_ACCESS_SECRET=${JWT}
CORS_ORIGINS=https://${PUBLIC_HOST}
WEB_PORT=3000
EOF
  chmod 600 .env.production
  echo "    generated .env.production (DB password stored there)"
else
  echo "    .env.production exists — keeping existing secrets"
fi

# ── [4/8] build & launch ─────────────────────────────────────────────────────
echo "==> [4/8] Build & launch (first run takes a few minutes)"
$COMPOSE up -d --build

# ── [5/8] wait for health ────────────────────────────────────────────────────
echo "==> [5/8] Waiting for the API to become healthy"
HEALTHY=0
for _ in $(seq 1 60); do
  if curl -fsS "http://127.0.0.1:3000/api/v1/health" 2>/dev/null | grep -q '"db":"up"'; then
    HEALTHY=1; break
  fi
  sleep 3
done
if [ "$HEALTHY" = 1 ]; then echo "    API healthy (db up, migrations applied)"; else
  echo "    WARN: not healthy after 180s — check: $COMPOSE logs api"; fi

# ── [6/8] seed once ──────────────────────────────────────────────────────────
echo "==> [6/8] Seed org + users (first run only)"
if [ -f .seeded ]; then
  echo "    already seeded (.seeded present) — skipping"
elif [ "$HEALTHY" != 1 ]; then
  echo "    SKIP: API not healthy; seed later with:"
  echo "      $COMPOSE exec -e SEED_DEFAULT_PASSWORD='...' api npx ts-node packages/db/prisma/seed.ts"
else
  read -rs -p "    Set an initial password for ALL seeded users: " SEED_PW; echo
  $COMPOSE exec -T -e SEED_DEFAULT_PASSWORD="$SEED_PW" api npx ts-node packages/db/prisma/seed.ts
  touch .seeded
  echo "    seeded (users' initial password = the one you just typed)"
fi

# ── [7/8] Caddy = automatic HTTPS ────────────────────────────────────────────
echo "==> [7/8] HTTPS via Caddy"
if ! command -v caddy >/dev/null; then
  apt-get install -y debian-keyring debian-archive-keyring apt-transport-https
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/gpg.key' \
    | gpg --dearmor -o /usr/share/keyrings/caddy-stable-archive-keyring.gpg
  curl -1sLf 'https://dl.cloudsmith.io/public/caddy/stable/debian.deb.txt' \
    | tee /etc/apt/sources.list.d/caddy-stable.list >/dev/null
  apt-get update -y && apt-get install -y caddy
fi
cat > /etc/caddy/Caddyfile <<EOF
${PUBLIC_HOST} {
    reverse_proxy 127.0.0.1:3000
}
EOF
systemctl reload caddy 2>/dev/null || systemctl restart caddy

# ── [8/8] nightly backup ─────────────────────────────────────────────────────
echo "==> [8/8] Nightly Postgres backup (02:30, keep 14 days)"
mkdir -p /root/backups
cat > /root/pdash-backup.sh <<EOF
#!/usr/bin/env bash
cd ${REPO_DIR}
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  pg_dump -U pdash pdash | gzip > /root/backups/pdash-\$(date +%F).sql.gz
find /root/backups -name 'pdash-*.sql.gz' -mtime +14 -delete
EOF
chmod +x /root/pdash-backup.sh
CRON_TMP="$(mktemp)"
crontab -l 2>/dev/null | grep -v '/root/pdash-backup.sh' > "$CRON_TMP" || true
echo "30 2 * * * /root/pdash-backup.sh" >> "$CRON_TMP"
crontab "$CRON_TMP"; rm -f "$CRON_TMP"

echo
echo "======================================================================"
echo " DONE.  Open:  https://${PUBLIC_HOST}"
echo " Containers:   $COMPOSE ps"
echo " Reminders:    run 'passwd' to rotate root; revoke the GitHub token."
echo "======================================================================"
