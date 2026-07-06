# Deploying SquarkIP (pdash)

The app has three parts: **Postgres** (data), the **NestJS API** (`apps/api`), and the
**Next.js web** app (`apps/web`). The browser only ever talks to the web origin — the web
server proxies `/api/*` to the API server-side, which keeps the auth cookies first-party.

There are two supported ways to deploy.

---

## Option A — Docker Compose (recommended, one command)

Builds and runs Postgres + API + Web together. Good for a single VPS / VM.

```bash
# 1. Configure
cp .env.production.example .env.production
#    Edit .env.production and set: POSTGRES_PASSWORD, DATABASE_URL, JWT_ACCESS_SECRET, CORS_ORIGINS
#    Generate the secret:  openssl rand -base64 48

# 2. Build & start the stack
npm run prod:up
#    (= docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build)

# 3. (first deploy only) load the real org + users
docker compose -f docker-compose.prod.yml exec api node -e "require('child_process').execSync('npx ts-node packages/db/prisma/seed.ts',{stdio:'inherit'})"
#    …or run `npm run db:seed` against the prod DATABASE_URL from a machine that can reach it.
```

- The API container runs `prisma migrate deploy` on start, so the schema is created/updated automatically.
- Only the **web** port (`WEB_PORT`, default 3000) is published. Postgres and the API stay private on the compose network.
- Put a TLS-terminating reverse proxy (Caddy / Nginx / a cloud load balancer) in front of the web port so users browse `https://…`. Auth cookies are `Secure` in production and require HTTPS.

Update later: `git pull && npm run prod:up` (rebuilds changed images).
Stop: `npm run prod:down`.

---

## Option B — Manual (managed Postgres + Node processes)

For platforms with a managed database (RDS, Cloud SQL, Neon, Railway Postgres…) and a Node runtime.

```bash
# 0. Node 20+. Set env vars (see below) — NODE_ENV=production.
npm ci
npm run db:generate
npm run db:migrate:deploy        # create/update the schema
npm run db:seed                  # first deploy only

# 1. Build
npm run build                    # builds packages/db, apps/api, apps/web

# 2. Run (use pm2 / systemd / your platform's process manager)
#    API:
NODE_ENV=production node apps/api/dist/main.js          # listens on API_PORT (4000)
#    Web (Next standalone):
NODE_ENV=production API_ORIGIN=http://localhost:4000 node apps/web/.next/standalone/apps/web/server.js
```

Point `API_ORIGIN` (web) at the API process. Front the web port with HTTPS.

---

## Required environment variables

| Var | Where | Notes |
|---|---|---|
| `DATABASE_URL` | API | Postgres connection string. |
| `JWT_ACCESS_SECRET` | API | **Required in prod**; ≥32 random chars (`openssl rand -base64 48`). The API refuses to boot otherwise. |
| `CORS_ORIGINS` | API | **Required in prod**; the public web origin(s), comma-separated. |
| `NODE_ENV=production` | API & Web | Enables `Secure` cookies, disables dev header trust, etc. |
| `API_ORIGIN` | Web | Server-side proxy target for `/api/*` (the API URL). |
| `API_PORT` / `WEB_PORT` | API / Web | Ports (default 4000 / 3000). |

`AUTH_DEV_TRUST_HEADER` must be unset/false in production (the boot check enforces this).

---

## Database migrations

Production uses versioned migrations, **not** `db push`.

- A baseline migration is committed at `packages/db/prisma/migrations/0_init`.
- Fresh database → `npm run db:migrate:deploy` applies it (the API container does this automatically).
- **Existing database already created via `db push`** (e.g. your current dev DB): baseline it once so Prisma
  doesn't try to recreate tables:
  ```bash
  npx prisma migrate resolve --applied 0_init --schema=packages/db/prisma/schema.prisma
  ```
- Future schema changes: `npm run db:migrate:dev --name <change>` locally (creates a new migration),
  commit it, then `db:migrate:deploy` runs it everywhere.

---

## Production hardening already in place

- **Env validation** at boot — the API exits fast on missing/weak `JWT_ACCESS_SECRET`, `DATABASE_URL`, or `CORS_ORIGINS`.
- **helmet** security headers, **CORS allow-list**, **rate limiting** on `/auth/login` & `/auth/refresh` (+ per-account lockout).
- **2 MB JSON body limit** (profile-photo data URLs), `trust proxy` for correct client IPs, graceful shutdown hooks.
- Cookie/JWT auth: httpOnly + `Secure` (prod) + SameSite=Lax, 15-min access tokens, rotating refresh with reuse-detection.
- Deny-by-default authorization (RBAC) enforced on every mutating endpoint.

## Pre-launch checklist

- [ ] Strong `JWT_ACCESS_SECRET` and DB password set (not the placeholders).
- [ ] `CORS_ORIGINS` = your real HTTPS origin.
- [ ] HTTPS terminating in front of the web port.
- [ ] First-login passwords rotated (seeded users share a dev password — change it or re-seed without `SEED_DEFAULT_PASSWORD`).
- [ ] Database backups configured on Postgres.
- [ ] Remove/ignore the local `.env` and screenshots from any committed artifacts.
