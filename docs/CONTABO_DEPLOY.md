# Deploying pdash to a Contabo VPS (one command)

This is the fast path for a single Ubuntu/Debian VPS. It gives you Postgres + API + Web in
Docker, behind Caddy with **real HTTPS on the bare IP** (via `sslip.io`, no domain required),
plus nightly database backups. For the manual/annotated version see [DEPLOYMENT.md](./DEPLOYMENT.md).

## What you run on the VPS

SSH in as root, then bootstrap (installs git, clones, launches everything):

```bash
apt-get update -y && apt-get install -y git
cd /root

# Use a FRESH read-only GitHub token (revoke it afterwards). Not stored in shell history:
read -rs -p "GitHub token: " GHT; echo
git clone "https://x-access-token:${GHT}@github.com/AnantSQIP/pdash.git"
cd pdash
git remote set-url origin https://github.com/AnantSQIP/pdash.git   # scrub token from config
git checkout squarkip-dashboard-snapshot
unset GHT

# One command runs all 8 phases (system prep, Docker, secrets, build, seed, HTTPS, backups):
bash scripts/contabo-deploy.sh
```

The script prompts once for an **initial password** for the seeded users. When it finishes,
open **https://217.76.59.244.sslip.io** and log in.

> Got a real domain? Point its A record at the VPS and run
> `PUBLIC_HOST=pdash.yourco.com bash scripts/contabo-deploy.sh` instead — Caddy issues a cert for it.

## What the script does (idempotent — safe to re-run)

| Phase | Action |
|---|---|
| 1 | `apt upgrade`, 4 GB swap (build OOM safety), `ufw` allowing only 22/80/443 |
| 2 | Install Docker Engine + compose plugin, enable on boot |
| 3 | Generate `.env.production` (strong DB password + `JWT_ACCESS_SECRET`); preserved on re-run |
| 4 | `docker compose up -d --build` (auto-runs Prisma migrations) |
| 5 | Wait for `/api/v1/health` to report `db: up` |
| 6 | Seed org + users once (prompts for the initial password); marks `.seeded` |
| 7 | Install Caddy, write the Caddyfile, get a Let's Encrypt cert, reload |
| 8 | Install a nightly `pg_dump` cron (02:30, 14-day retention) |

## Verify it's live and locked down

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps   # all Up
curl -s http://127.0.0.1:3000/api/v1/health                              # {"status":"ok","db":"up"}
curl -sI https://217.76.59.244.sslip.io | head -1                        # HTTP/2 200
```
From your laptop, `curl http://217.76.59.244:3000` must **refuse** — the app is bound to
localhost and only Caddy (443) is public. Postgres and the API are never published.

## Go-live checklist

- [ ] `passwd` — rotate the root password.
- [ ] Revoke the GitHub token you used to clone.
- [ ] Force-reset the seeded users' shared initial password after first login.
- [ ] Confirm one backup: run `/root/pdash-backup.sh` and check `/root/backups`.

## Update later

```bash
cd /root/pdash && git pull
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

## Sizing for 30+ users

Light load for this stack. Use **≥ 4 vCPU / 8 GB RAM / NVMe** — the 8 GB is mainly headroom
for the `next build` step (the 4 GB swap the script adds covers smaller boxes). Postgres
default `max_connections=100` and the Prisma pool are ample; a single API instance is enough.
