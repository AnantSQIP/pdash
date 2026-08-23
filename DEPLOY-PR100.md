# Contabo deploy — PR #100

**What ships:** self-as-project-manager · the Feedback module · client-ledger details and a rate ·
patent ID ↔ number mapping for project members · Ajay Sharma on Senior Consultant rights.

**Two additive migrations**, both nullable-or-defaulted, so a rolling restart is safe:
`20260929090000_feedback`, `20260930090000_client_relationship_fields`.

---

## 0. Merge the PR first

https://github.com/AnantSQIP/pdash/pull/100 → **Squash and merge**.

Nothing below works until `main` carries it.

---

## 1. Connect and pull

```bash
ssh -p 2222 root@217.76.59.244
cd ~/pdash
git pull origin main
git log --oneline -1        # sanity: should be the PR #100 squash commit
```

## 2. Rebuild and restart

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

**Both flags matter, for different reasons:**

- **`-f docker-compose.prod.yml`** — without it, Docker reads the plain `docker-compose.yml`,
  which contains only postgres/redis/minio. The deploy appears to succeed and *changes nothing*.
  If you see `Found orphan containers`, you forgot this flag.
- **`--env-file .env.production`** — this is now belt-and-braces rather than load-bearing. The
  secrets arrive through `env_file:` **inside** the compose file (fixed in PR #99, after the
  missing flag blanked every secret and took the site down). Only `WEB_BIND`/`WEB_PORT` still
  interpolate, and both default safely to `127.0.0.1:3000`. Keep the flag anyway — the habit costs
  nothing and the failure it prevents cost an outage.

**`--build` is required, not optional.** The image compiles `packages/db` at build time, which is
where the roster script becomes the `.js` that step 4 runs. Skip it and Ajay's role change is not
in the container.

## 3. Migrations — automatic, but verify

The API container runs `prisma migrate deploy` on boot. Watch it happen:

```bash
docker compose -f docker-compose.prod.yml logs -f api | head -40
```

Wait for the app to report listening, then confirm both landed:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec api \
  npx prisma migrate status --schema=packages/db/prisma/schema.prisma | tail -5
```

Expect **no pending migrations**.

## 4. Roster — REQUIRED this time

Ajay Sharma moves from Consultant to Senior Consultant rights. Idempotent, safe to re-run.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec api \
  node packages/db/prisma/dist/roster-align-2026-08.js
```

Expect a line reading `SET  Ajay Sharma ... Consultant -> Senior Consultant`.

## 5. Regrant — not strictly needed, but run it

PR #100 adds **no new permission codes**, so this changes nothing on its own. Run it anyway: it is
idempotent, it touches only role→permission rows (per-user overrides are untouched), and it
removes any doubt about whether the earlier `team.*` / `deal.*` codes were ever applied here.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production exec api \
  node packages/db/prisma/dist/regrant-roles.js
```

---

## 6. Verify — from your own machine, not the server

```bash
curl -s -o /dev/null -w "site: %{http_code}\n" https://217.76.59.244.sslip.io/login
```

Then in a browser, signed in as a Super Admin:

| Check | Where | Expect |
|---|---|---|
| Feedback module | sidebar → **Feedback** | the page loads, "Give feedback" works |
| Client details | **Client Ledger** → any client | new editable details block, with a rate field |
| Derived value | same panel, after setting a rate | Value shows `hours × rate`, labelled *derived* |
| PID column | same panel | "PID pending" / "No PID" instead of `—` |
| Patent numbers | a project with patents | **Show numbers** appears next to the badges |
| Self as PM | Projects → New Project | **"Me — I'll manage it"** is the first option |
| Ajay's rights | sign in as Ajay | he can now be named Project Manager |

---

## If it goes wrong

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=80 api
```

**A 502 means the API is not up** — read the logs before touching anything else. The last time this
happened the cause was blanked secrets, and the on-screen error talked about the database, which
sent the diagnosis in the wrong direction for twenty minutes.

**To roll back**, both migrations are additive — the previous image runs fine against the new
schema, so reverting is just checking out the prior commit and rebuilding:

```bash
git log --oneline -5          # find the commit before the merge
git checkout <that-sha>
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

No migration needs undoing. The new columns simply sit unused.
