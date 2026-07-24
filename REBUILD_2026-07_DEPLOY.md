# Rebuild 2026-07 — deploy runbook

Branch: `feat-rebuild-pid-offices-timesheets`. Seven phases: schema foundation, data wipe +
office scripts, profile-gate hardening, PID generate/request flow, capacity (tentative leaves +
office groups + per-project day-click), timesheets (PID + type + task + 1-week buffer).

The **code** is safe/additive. The **data wipe** is destructive and separate — run it deliberately.

## What ships in the code (safe, additive)
- Migration `20260815090000_rebuild_pid_offices_timesheets` — `User.office`,
  `Timesheet.projectId/projectType/createdAt`, `PidRequest` table. All nullable / new.
- New permission `project.generate_pid` (Super Admin, Admin, Manager, Senior Consultant,
  Senior Research Associate) — needs `regrant-roles`.
- All app logic (PID flow, profile validation, capacity, timesheets).

## What is DATA (deliberate, environment-specific)
- **Wipe**: `reset-operational-data.ts` — keeps org + users + logins + RBAC + departments/teams +
  config; deletes every project / task / patent / client / timesheet / attendance / leave /
  expense / notification / discussion / appraisal / etc.; clears profiles (re-arms the first-login
  gate); resets PID/patent counters. Irreversible.
- **Offices**: `assign-offices.ts` — Gurgaon = Anant Gupta, Ankit Verma, Rajesh Joshi, Meetu
  Singh, Nitin Goel, Arjun Ghosh, Vijay Mishra, Ketan Dagar; everyone else = Jaipur.

---

## Local (already done)
Migration applied, `regrant-roles` run, `reset-operational-data.ts --yes` + `assign-offices.ts`
executed and verified (30 users kept, activity wiped, gate re-armed, GURGAON=8 / JAIPUR=19).
Remaining: rebuild + restart the native prod copy so the tunnel serves the new build.

## Contabo (production) — run when ready
SSH in (`ssh -p 2222 root@217.76.59.244`), then from `~/pdash`:

```bash
# 1. Pull + rebuild (migrate deploy runs on API boot; picks up 20260815…).
cd ~/pdash && git pull origin main
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build

# 2. Grant the new permission to the roles.
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T api \
  node packages/db/prisma/dist/regrant-roles.js

# 3. Assign offices (idempotent, keyed by email — safe anytime).
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T api \
  node packages/db/prisma/dist/assign-offices.js

# 4. THE WIPE — DESTRUCTIVE, IRREVERSIBLE. Only when you have decided to reset the live team.
#    Take a DB backup first (scripts install a nightly one at /root/backups; or run pg_dump now).
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T \
  -e NODE_ENV=production -e ALLOW_PROD_RESET=true api \
  node packages/db/prisma/dist/reset-operational-data.js --yes
```

Backup before step 4:
```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec -T postgres \
  pg_dump -U pdash pdash | gzip > /root/backups/pre-rebuild-$(date +%F).sql.gz
```

Steps 1–3 are safe and non-destructive. Step 4 wipes the team's real activity data — do it only
when you intend to start the workspace fresh.
