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
git checkout main
unset GHT

# One command runs all 8 phases (system prep, Docker, secrets, build, seed, HTTPS, backups):
bash scripts/contabo-deploy.sh
```

The script prompts once for an **initial password** for the seeded users. When it finishes,
open **https://217.76.59.244.sslip.io** and log in.

> Got a real domain? See [Moving to a real domain](#moving-to-a-real-domain) below.

## Moving to a real domain

The dashboard is served at **https://squarkip.io**. Moving it there was a DNS record plus a Caddy
vhost — no rebuild, no downtime, nobody logged out — because **nothing in the app knows its own
public URL**:

| | |
|---|---|
| Browser → API | the relative path `/api/v1` (`apps/web/lib/api.ts`), rewritten server-side by Next to `http://api:4000`. The public host is never baked into the web image. |
| Auth cookies | host-only — `auth.controller.ts` sets no `domain`, so they scope to whatever host was browsed. Sessions on the old URL are untouched. |
| `CORS_ORIGINS` | not on the critical path: there is no CSRF/Origin check and all traffic is same-origin through the Next proxy. Kept accurate anyway. |

### 1. DNS (at the registrar)

Delete **every** A record on the apex and replace with one pointing at the VPS:

| Type | Name | Value | TTL |
|---|---|---|---|
| A | `@` | `217.76.59.244` | 300 |
| CNAME | `www` | `squarkip.io` | 300 |

Propagation is 5–30 min at TTL 300. Check with `getent ahostsv4 squarkip.io`.

### 2. On the VPS

```bash
cd /root/pdash && git pull
bash scripts/set-public-domain.sh squarkip.io
```

It refuses to touch anything until DNS actually resolves to the box — Let's Encrypt allows only
**five failed validations per hostname per hour**, so a premature reload locks the name out rather
than failing cleanly. It backs up the old Caddyfile, validates before reloading, and reloads
gracefully (no dropped connections).

`www` **redirects** to the apex rather than serving it. With host-only cookies, serving both would
give one person two unrelated sessions and a logout from one would leave the other signed in.

### 3. Retiring the old URL

`217.76.59.244.sslip.io` keeps serving by default, so DNS propagation cannot strand anyone. Once
the new name is verified and the team has been told (anyone redirected is signed out, because the
cookie belongs to the old host):

```bash
LEGACY_MODE=redirect bash scripts/set-public-domain.sh squarkip.io   # old host → new host
LEGACY_MODE=drop     bash scripts/set-public-domain.sh squarkip.io   # old host stops answering
```

Roll back at any point by restoring the backup the script prints:
`cp -a /etc/caddy/Caddyfile.<timestamp>.bak /etc/caddy/Caddyfile && systemctl reload caddy`.

> `contabo-deploy.sh` will **not** overwrite a Caddyfile that names a different host, so re-running
> the installer cannot silently drag the site back to the IP-only name.

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

`git pull` alone will NOT work: the clone step deliberately scrubs the token out of `origin`,
and the repo is private. Fetch with a fresh token each time, and pin to `main` — a server left
on an old branch silently keeps serving the old build, which looks exactly like "my changes
didn't deploy".

```bash
cd /root/pdash

# 1. Fetch main with a FRESH token (never stored in git config or shell history)
read -rs -p "GitHub token: " GHT; echo
git fetch "https://x-access-token:${GHT}@github.com/AnantSQIP/pdash.git" main
unset GHT
git checkout -B main FETCH_HEAD
git log --oneline -3          # confirm you actually got the new commits

# 2. Rebuild. The api container runs `prisma migrate deploy` on start, so schema
#    migrations apply themselves.
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# 3. Wait for health
for i in $(seq 1 40); do
  curl -fsS http://127.0.0.1:3000/api/v1/health | grep -q '"db":"up"' && { echo HEALTHY; break; }
  sleep 3
done
```

### After a release that adds PERMISSIONS

New permission codes are **not** granted by a migration — roles must be re-synced from the
catalog. This is idempotent and does **not** wipe custom grants or log anyone out:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T api node packages/db/prisma/dist/regrant-roles.js
```

Verify what the release actually delivered, rather than trusting the build log:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  psql -U pdash -d pdash -c "
    select code from permission
     where code in ('capacity.view','deadline.view.client','document.view')
     order by code;
    select count(*) as tasks_with_client_deadline_column
      from information_schema.columns
     where table_name='task' and column_name='clientDueDate';"
```

## Sizing for 30+ users

Light load for this stack. Use **≥ 4 vCPU / 8 GB RAM / NVMe** — the 8 GB is mainly headroom
for the `next build` step (the 4 GB swap the script adds covers smaller boxes). Postgres
default `max_connections=100` and the Prisma pool are ample; a single API instance is enough.
