# pdash / SquarkIP — Knowledge Transfer

> **Read this first.** It is the single entry point for anyone taking over this system:
> what it is, how to run it, how to deploy it, how the security model works, and — most
> valuable — the traps that will otherwise cost you a day each.
>
> Last updated: 2026-07-14 · Production `main` = `d7b0d3e`

---

## 1. What this is

An internal project-management platform for **Squark IP** (a patent/IP firm), in the shape of
Zoho Projects: projects → task lists → tasks → subtasks, plus attendance, leave, timesheets,
performance, discussion, files and a full RBAC admin console.

**28 real users.** It is in daily use by the team. Treat every deploy as production.

| | |
|---|---|
| **Repo** | `https://github.com/AnantSQIP/pdash` — ⚠️ **PUBLIC** (see §7) |
| **Production** | `https://217.76.59.244.sslip.io` (Contabo VPS, Docker + Caddy, SSH on port **2222**) |
| **Stack** | TypeScript · NestJS (API) · Next.js 14 App Router (web) · Prisma · PostgreSQL 16 |
| **Layout** | npm workspaces monorepo: `apps/api`, `apps/web`, `packages/db` (`@pdash/db`) |
| **Scale** | 71 tables · 7 roles · 85 permission codes |

---

## 2. ⚠️ THE TWO ENVIRONMENTS — read this before debugging anything

**This is the single biggest source of confusion.** There are two completely separate
deployments with **separate databases and different passwords**. "I can't log in" is almost
always someone using the right password on the wrong system.

| | **Contabo** (real) | **Local demo** (the tunnel) |
|---|---|---|
| URL | `https://217.76.59.244.sslip.io` | a Cloudflare quick tunnel — read it from `~/pdash/.tunnel-url` |
| Database | its own Postgres (in Docker) | local Postgres on `:5432`, db `pdash` / user `pdash` |
| Passwords | the **real** ones in `SquarkIP-credentials.xlsx` | **`sqip@1234`** for every user (seed default) |
| Org passcode | the rotated one (NOT in the repo) | `sqip@infinity` (the old published default) |
| Purpose | the team's live system | demo/dev; a public tunnel is shared with leadership |

**Always ask which URL someone is on before you debug a login.**

### The local demo's tunnel URL changes

It is a *free Cloudflare quick tunnel*, so **the URL is reassigned every time `cloudflared`
restarts — including on every WSL reboot.** It has churned three times. A stable URL needs a
named Cloudflare tunnel (needs a domain), an ngrok static domain, or Tailscale Funnel. Until
then: **never hardcode it — read `~/pdash/.tunnel-url`** or run `npm run link`.

The demo is kept alive by a **systemd *user* service**, `pdash.service`, running
`~/pdash/scripts/keep-alive.sh` (API `:4000`, web `:3001`, cloudflared). Note *user* service:

```bash
systemctl --user status pdash.service     # `systemctl status` (system scope) says "not found"
tail ~/pdash/.keep-alive.log ~/pdash/.api.log ~/pdash/.web.log
```

---

## 3. Running it locally

### The performance rule (do not skip)

The git checkout lives on the Windows drive (`/mnt/c/...`), which WSL reaches over 9p — it is
roughly **3000× slower** for the many-small-file access a dev server does.

> **Edit in `/mnt/c/Users/anant/Videos/pdash` (the git source).
> RUN from the native copy `~/pdash`.**
> Never run `next dev` off `/mnt/c` — it is unusably slow.

```bash
# 1. sync source -> native copy  (ALWAYS exclude tsbuildinfo — see §8 trap #2)
rsync -a --exclude 'node_modules' --exclude '.next' --exclude '*.tsbuildinfo' \
      /mnt/c/Users/anant/Videos/pdash/ ~/pdash/

# 2. build + run from ~/pdash
cd ~/pdash
npm run build:all       # prisma generate + db + api + web
npm run serve           # api :4000, web :3001
```

Postgres runs natively on `:5432` (**not** PGlite). Seed data: `npm run db:seed`.

### Useful scripts

| Command | Does |
|---|---|
| `npm run build:all` | prisma generate → packages/db → api → web |
| `npm run serve` | run both (api `:4000`, web `:3001`) |
| `npm run db:seed` | seed the demo org (28 users, projects, ~90d of history) |
| `npm run link` | print the current public tunnel URL |
| `npm run keepalive` | start the always-on supervisor |
| `npm run prod:up` | docker-compose production stack |

---

## 4. Architecture

```
Next.js (apps/web)  ──/api/v1/*──▶  NestJS (apps/api)  ──Prisma──▶  PostgreSQL
     App Router                       Guards + Modules              71 tables
     TanStack Query                   AsyncLocalStorage actor
```

**Request pipeline** (order matters):

1. `CurrentActorMiddleware` — verifies the access-token cookie (JWT), puts the actor in
   AsyncLocalStorage. **Re-checks `deletedAt`, `status` and `securityVersion` on EVERY
   request**, so revocation is immediate.
2. `AuthGuard` (global, deny-by-default) — every route needs an actor unless `@Public()`.
3. `PermissionGuard` (opt-in) — enforces `@RequirePermission('code')`.
4. `PasscodeGuard` (opt-in) — "big change" routes marked `@RequirePasscode()` also demand
   the org step-up passcode (a second factor **on top of** RBAC).

**Key services**
- `ActorContextService` (`common/context/`) — **the org for a request comes from the SESSION,
  never a query param.** Use `requireOrgId()`. See §7.
- `PermissionService` — resolves 4-layer RBAC. **No cache** — a permission change takes effect
  on the next request.
- `DeadlineVisibilityService` — server-side redaction of the client deadline.
- `ProfileService` — server-side redaction of personal/PII fields.

---

## 5. Data model — the decisions that will surprise you

Full schema: `packages/db/prisma/schema.prisma`. Domain map: `ARCHITECTURE.md` §4.

| Thing | Reality |
|---|---|
| **Task ↔ Project** | **M2M via `ProjectTask`.** A task has **no `projectId`**. Reach a project through `task.projectTasks[].project`. |
| **Subtasks** | Flat `Subtask` table, **one level only** (not recursive). |
| **Status** | Config-driven `Workflow` → `WorkflowStatus` → `WorkflowTransition`. **A task is complete iff `currentStatus.type === 'CLOSED'`** — *never* infer it from `completionPercentage === 100`. |
| **Progress** | `completionPercentage` on Project/Milestone is **derived** from children and recomputed on every mutation. The server **ignores** a client-supplied value. |
| **Approvals** | Generic polymorphic `Approval(entityType, entityId)`. Project has **no** `status` column — its pending-ness lives in an `Approval` row. |
| **Comments** | Generic polymorphic `Comment(entityType, entityId)`. |
| **Dates** | Date-only values are stored at **UTC midnight**. Always compare with `startOfUtcDay()` and format with `timeZone: 'UTC'`, or the calendar day shifts in negative-offset zones. Helpers: `apps/api/src/common/dates.ts`, `apps/web/lib/date.ts`. |
| **Soft deletes** | `deletedAt` on every mutable entity. **Every query must filter `deletedAt: null`.** |
| **AuditLog** | `onDelete: Restrict` — deliberately **immutable, never deleted**. |
| **Emails** | `email` is **not** unique alone — the unique key is `organizationId_email`. `prisma.user.update({where:{email}})` will fail. |

---

## 6. Security model — the part you must not get wrong

### Auth
- httpOnly cookies: **15-minute access JWT** + **14-day rotating refresh token** with reuse
  detection (a replayed refresh token revokes the whole family).
- `securityVersion` on User — bump it to invalidate all issued access tokens instantly
  (logout-all, password change, admin reset).
- **Lockout: 8 failed attempts → 15 minutes.** Serving out a lock resets the counter.

### RBAC — 4 layers, first match wins
```
DENY override → ALLOW override → direct user permission → group → role → DEFAULT DENY
```
Codes are `resource.action.scope` (e.g. `project.approve`, `deadline.view.client`).
**Super Admin resolves to `*`; Admin = every code except `role.delete`.** So a new permission
is automatically theirs — never special-case them in code.

| Role | Perms |
|---|---|
| Super Admin | 85 (all) |
| Admin | 84 |
| Manager | 53 |
| Senior Consultant | 48 |
| Consultant | 35 |
| HR | 32 |
| Employee | 27 |

**Roles are defined in `packages/db/prisma/permissions-catalog.ts`** — that file is the source
of truth. After editing it you **must** run `regrant-roles` (§8) or the DB won't have the codes.

### The org step-up passcode
A second factor **on top of RBAC** for "big changes" (adding/removing people, RBAC edits, org
mutations). Purpose: *even a compromised admin account cannot restructure the organisation.*
Stored as an argon2id hash on `Organization.securityPasscodeHash`. Routes opt in with
`@RequirePasscode()`. The client prompts for it and retries with an `x-org-passcode` header.

> ⚠️ It **must not** be a value that appears in this repo. It shipped as a hardcoded default
> (`sqip@infinity`) in a **public** repo, which made it worthless; `set-passcode.ts` now
> requires an explicit value and **refuses published ones**. The live passcode has been
> rotated and is not in the codebase.

### Two redaction boundaries — both enforced by DELETING KEYS, never by hiding in the UI

This is the house style. An unauthorised caller's JSON does **not contain the key at all**, so
there is nothing to leak through a render bug, a console log or a cached response.

**1. Client deadlines** (`DeadlineVisibilityService`)
`dueDate` = the INTERNAL deadline (everyone; drives "overdue").
`clientDueDate` = the date promised to the client — sent **only** to holders of
`deadline.view.client` **or** a MANAGER member of that specific project.

**2. Personal details / PII** (`ProfileService`)
Lives in its own `UserProfile` table — deliberately **not** on `User`, because `GET /users` is
open to every authenticated member, so anything on `User` is one careless `select` from the
whole company.

| Permission | Grants | Held by |
|---|---|---|
| `profile.view` | directory card | Manager, Sr Consultant, Admin, Super Admin, HR |
| **`profile.view.personal`** | **address, DOB, next-of-kin** | **Admin, Super Admin, HR only** |
| `profile.update.any` | correct someone's data | Admin, Super Admin, HR |

You always see and edit **your own** profile — no permission needed. `PERSONAL_FIELDS` in
`profile.module.ts` is an explicit allow-list, so adding a `UserProfile` column can never
silently widen what a manager receives.

**Deliberately not collected:** PAN/Aadhaar/bank details — India's DPDP Act would require
encryption at rest, a retention policy and a lawful basis.

---

## 7. ⚠️ The repo is PUBLIC

`github.com/AnantSQIP/pdash` is world-readable. No real secrets are committed (`.env`,
`.env.production` and `SquarkIP-credentials.*` are gitignored, verified). But:

- **Anything you commit is public forever**, including in history. Never commit a passcode,
  token or password — a rotation does not remove it from history.
- The deploy doc publishes the server IP and admin login. Assume attackers know them.
- If this should be private, flip it in GitHub Settings — **but the passcode still had to be
  rotated**, because git history is permanent.

---

## 8. Operations runbook

### Deploy to Contabo

`git pull` **will not work** — the clone step deliberately scrubs the token from `origin` and
the repo needs auth to fetch. And **pin `main`**: a server left on an old branch keeps serving
the old build, which looks exactly like "my deploy didn't work" (this has happened).

```bash
cd /root/pdash
read -rs -p "GitHub token: " GHT; echo
git fetch "https://x-access-token:${GHT}@github.com/AnantSQIP/pdash.git" main
unset GHT
git checkout -B main FETCH_HEAD
git log --oneline -3            # CONFIRM you actually got the new commits

docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

for i in $(seq 1 40); do
  curl -fsS http://127.0.0.1:3000/api/v1/health | grep -q '"db":"up"' && { echo HEALTHY; break; }
  sleep 3
done
```

Prisma migrations run **automatically** on API container start (`Dockerfile` CMD →
`prisma migrate deploy`).

### After a release that adds PERMISSIONS — REQUIRED

Migrations do **not** grant permissions. Roles must be re-synced from the catalog. Idempotent,
atomic (no 403 window), does not wipe custom grants, logs nobody out:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T api node packages/db/prisma/dist/regrant-roles.js
```

### Other production scripts

Compiled to plain JS by `packages/db/tsconfig.seed.json` so the container can run them with
`node` (no ts-node). **If you add a script, add it to that `include` list** or it won't exist
in the container.

| Script | Purpose |
|---|---|
| `regrant-roles.js` | re-sync role→permission from the catalog (after any catalog change) |
| `set-passcode.js` | rotate the org step-up passcode (`PDASH_PASSCODE` env is **required**) |
| `reset-passwords.js` | ⚠️ resets **ALL** users, logs everyone out, regenerates the credentials sheet |
| `seed.js` | seed a fresh org |

**To reset ONE person's password, do NOT use `reset-passwords`** — use the app:
People → the user → Reset password (needs `user.manage_access` + the org passcode). It
generates a temp password, forces a change on next sign-in, **clears their lockout**, and logs
out only them.

### Credentials

`SquarkIP-credentials.xlsx` (gitignored, kept outside version control) is the distributed
record of everyone's temp password. **Back it up before touching it** — a corrupted row locks
someone out. Generated by `reset-passwords.ts`; the password shape is
`<CapitalisedFirstName><digits>`, padded to ≥9 chars.

---

## 9. 🪤 Traps — every one of these has cost real hours

1. **Deploying to a stale branch.** The server sat on `squarkip-dashboard-snapshot` while
   `main` had the changes. Everything "succeeded" and nothing changed. **Always
   `git log --oneline -3` after the fetch.**

2. **Stale `.tsbuildinfo` ⇒ tsc silently emits nothing.** `incremental: true` + an rsync'd
   `.tsbuildinfo` makes TypeScript think the (old) `dist` is current, so your new module never
   appears and the route 404s. **Always `--exclude '*.tsbuildinfo'` when syncing**, and
   `rm -rf dist *.tsbuildinfo` before a clean native rebuild.

3. **Next.js `output: 'standalone'` bakes the `/api/*` rewrite target at BUILD time.**
   Changing `API_ORIGIN` at runtime does nothing. You must rebuild.

4. **systemd *user* units have a minimal PATH.** Node lives in `~/.local/bin`, which is not on
   it — so the supervisor silently failed to start anything after every reboot. Fixed, but if
   a service mysteriously does nothing, check `PATH` first.

5. **A `flock` leaks into child processes.** The supervisor's lock (fd 9) was inherited by the
   cloudflared it spawned, so when the supervisor died the lock was held **forever** and every
   replacement exited with "already running". Close fds in children (`9>&-`). If a service
   restart-loops, check `fuser -v <lockfile>`.

6. **Prisma schema does not support `/** */` block comments** — only `//`. A block comment is a
   hard schema-validation error.

7. **`prisma.user.update({ where: { email } })` fails** — email is not unique on its own (the
   key is `organizationId_email`). Use the id.

8. **`@IsOptional()` lets `null` through, but an emptied `<input type="date">` sends `""`**,
   which `@IsDateString()` rejects with a 400. Date DTOs use a `@Transform` mapping `''` → null.

9. **`undefined` vs `null` in a Prisma update.** `undefined` = "leave alone", `null` = "clear".
   Collapsing them (`dto.x ? new Date(dto.x) : undefined`) means a field can **never be
   cleared** and the API returns 200 while doing nothing. Use `resolveDate()`.

10. **The `_prisma_migrations` baseline differs by environment.** The local dev DB was built
    with `db push` and has **no** baseline, so `prisma migrate deploy` fails there with P3005 —
    run migration SQL directly against local. Contabo **does** track migrations.

11. **The local demo DB has role drift** — `hr@squarkip.com` there also holds Manager and
    Senior Consultant. Contabo is correct. Don't infer the permission model from the demo DB.

---

## 10. Known gaps / tech debt (ranked)

1. **No offboarding feature.** `user.delete` exists in the permissions catalog but **no route
   uses it.** Removing someone who leaves requires raw `psql` on the server, and a hard delete
   silently **cascades their timesheets** (Riya Bhola's removal destroyed 83 billing records —
   backed up first, but the point stands). Build a proper endpoint: soft-delete + bump
   `securityVersion` + revoke refresh tokens + unassign open tasks + remove from channels.

2. **~10 endpoints still take `organizationId` from the client** (`projects.list`, roles,
   permission-groups, departments, channels, audit, attendance, analytics). This is a
   **cross-tenant IDOR by design**. It is **not exploitable today** because production is
   single-org, but it **must** be migrated to `ActorContextService.requireOrgId()` **before
   onboarding a second organisation**. Capacity and the project-request endpoints are already
   done — copy that pattern.

3. **No mail transport.** No password-reset email is possible; recovery is admin-mediated via
   an in-app request (login page → notifies `user.manage_access` holders → they reset). If SMTP
   is ever added, revisit.

4. **The local demo runs in `development` mode with a weak JWT secret** (no
   `~/pdash/.env.production`). Fine for a demo, but that tunnel is *public*. Create
   `.env.production` with a strong `JWT_ACCESS_SECRET` if it stays exposed.

5. **The public tunnel URL churns on every reboot.** Move to a stable tunnel.

6. **`audit_log.oldValue` is not populated** — the audit trail records that a change happened
   but not what it was. Limits forensic value.

---

## 11. Feature map — where things live

| Feature | API module | Web route |
|---|---|---|
| Projects / tasks / milestones | `projects`, `tasks`, `milestones`, `tasklists` | `/projects`, `/projects/[id]`, `/tasks` |
| **Team Capacity** (who is free, when) | `capacity` | `/capacity` + a **Capacity tab** on each project |
| **Dual deadlines** (internal vs client) | `deadlines` (redaction) | task/project detail |
| **Overdue watchdog** (hourly sweep + digests) | `overdue` | notifications |
| **Project requests** (intern → nominated approver) | `projects` | `/projects` (New) + home approvals card |
| **User profiles / PII** | `profile` | first-login gate; `/admin/users/[id]`; `/settings` |
| RBAC admin console | `permissions`, `users` | `/admin` |
| Attendance / leave / timesheets | `attendance`, `timesheets` | `/attendance` |
| Performance (derived, never stored) | `performance` | `/performance` |
| Files & attachments | `documents` | project Files tab, Discuss |
| Discussion | `channels`, `comments` | `/discuss` |

**Performance is DERIVED** from real tasks and timesheets — there is **no rating table**. It
cannot be "set" without fabricating work records. Don't.

---

## 12. Document index

| Doc | For |
|---|---|
| `ARCHITECTURE.md` | data model, permission model, §11 capacity engine, §12 org-identity rule, §13 PII boundary |
| `AUTH_ARCHITECTURE.md` | cookies, JWT, refresh rotation, lockout |
| `CONTABO_DEPLOY.md` | the production deploy runbook |
| `DEPLOYMENT.md` | annotated/manual deployment |
| `CAPACITY_HARDENING_2026-07.md` | the capacity security audit + fixes |
| `AUDIT_FINDINGS.md` | historical security audit |
| `PERFORMANCE_SETUP.md` | the `/mnt/c` vs `~/pdash` performance rule |

---

## 13. First week checklist for whoever takes this over

- [ ] Read §2 (two environments) and §9 (traps). They are the two sections that save time.
- [ ] Get the repo; run it locally per §3. Confirm you can log in at `:3001` with `sqip@1234`.
- [ ] Get SSH to Contabo (port **2222**) and confirm you can reach the health endpoint.
- [ ] Get `SquarkIP-credentials.xlsx` and the **current** org passcode from the owner —
      neither is in the repo, and the passcode is not recoverable from it.
- [ ] Do one no-op deploy end to end so the runbook is muscle memory before you need it.
- [ ] Pick up gap #1 (offboarding) — it is the one that will bite next.
