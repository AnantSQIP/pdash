# pdash

A Zoho-Projects-style project management system (branded **SquarkIP**). See
`docs/ARCHITECTURE.md` for the full plan and `docs/zoho-projects-complete-spec.md`
for the researched feature dossier. **Running it fast: `docs/PERFORMANCE_SETUP.md`.**

## Stack
TypeScript monorepo (npm workspaces): NestJS API · Prisma · PostgreSQL · Next.js 14.

```
apps/api        NestJS REST API
apps/web        Next.js 14 web app
packages/db     Prisma schema + client (@pdash/db)
scripts/        serve.mjs launcher + api start helpers
tools/          dev helpers (PGlite fallback DB, smoke test)
docs/           architecture, auth, deployment, performance + reference PDFs
```

## What works today (M1)
- Hierarchy: Portal → Project Group → Project → Milestone → Task List → Task → Sub-task (depth ≤ 6)
- **D1** — milestones auto-complete when all child tasks reach 100% (and revert otherwise)
- **D2** — project creation requires admin approval (PENDING → APPROVED/REJECTED, admin-only)
- **D3** — status-only colors (custom statuses with Open/Closed type + colour)
- Invariants: every project gets a non-deletable "General" task list; percent-complete must be a
  multiple of 10; closing a task cascades to its subtree; can't reopen a subtask under a closed parent.

## Run it

### 1. Install
```bash
npm install
npm run db:generate
```

### 2a. With Docker (preferred)
```bash
cp .env.example .env
npm run infra:up          # Postgres + Redis + MinIO
npm run db:migrate        # or: npm run -w @pdash/db exec prisma db push
npm run db:seed
npm run api:dev           # http://localhost:4000/api/v1
```

### 2b. Without Docker — PGlite fallback (in-process Postgres, no install)
Used when Docker/registry is unavailable. Two terminals:
```bash
# terminal 1 — start the in-process Postgres on :5432
node tools/pglite-server.mjs

# terminal 2 — push schema, seed, run
export DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres"
npx -w @pdash/db prisma db push --skip-generate
npm run -w @pdash/db seed
# the API/clients need ?pgbouncer=true with PGlite (avoids prepared-stmt reuse):
DATABASE_URL="$DATABASE_URL?pgbouncer=true&connection_limit=1" npm run -w @pdash/api start:prod
```

### Smoke test (verifies all M1 logic against a real DB)
With the PGlite server running and schema pushed:
```bash
DATABASE_URL="postgresql://postgres:postgres@127.0.0.1:5432/postgres?pgbouncer=true" node tools/smoke.mjs
```

## Key endpoints
```
GET  /api/v1/health
GET  /api/v1/portals/:portalId/statuses
POST /api/v1/portals/:portalId/projects                 create (PENDING)
POST /api/v1/portals/:portalId/projects/:id/approve     admin approval
GET  /api/v1/projects/:projectId/tasklists | milestones
POST /api/v1/portals/:portalId/projects/:projectId/tasks
PUT  /api/v1/portals/:portalId/projects/:projectId/tasks/:id/status
```
