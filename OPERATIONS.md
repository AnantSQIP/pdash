# Running Squark Dashboard in production

What to set up before going live, and what to do when something breaks.

---

## 1. Backups

There were none. The database and the uploaded documents existed in exactly one place — and a
destructive migration has already destroyed 83 timesheet rows on this system once.

### Install (once, on the server)

```bash
cd ~/pdash
mkdir -p /var/backups/pdash

# run it by hand first, so a failure surfaces now rather than at 2am
./scripts/backup.sh
```

Do not `chmod +x` these scripts — the executable bit is committed. Setting it locally registers as
an uncommitted change to a tracked file, and the next `git pull` that touches the script aborts
rather than merging, leaving the old version running while the pull output scrolls past.

Then schedule it:

```bash
crontab -e
```

```
15 2 * * *  cd /root/pdash && ./scripts/backup.sh >> /var/log/pdash-backup.log 2>&1
```

**The redirect matters.** A cron job whose output goes nowhere is a job you will not know has been
failing. Check that log occasionally, or point it at a mailbox.

### What is kept

| | |
|---|---|
| Database | `pdash-db-<date>.sql.gz` — everything the application stores |
| Documents | `pdash-docs-<date>.tar.gz` — patent PDFs and attachments, which live on disk, **not** in Postgres |
| Retention | 30 days, both (`KEEP_DAYS` to change) |
| Location | `/var/backups/pdash` (`BACKUP_DIR` to change) |

Both are needed. A database dump alone restores a system where every document link is broken.

Every run verifies the dump before keeping it: valid gzip, at least one table declared, and
pg_dump's own end-of-dump marker present. The last of those is what catches a dump cut short
partway — a truncated file still contains plenty of `CREATE TABLE` lines, so counting tables alone
would pass it.

### The drill — run it monthly

```bash
./scripts/restore-drill.sh
```

Restores the newest backup into a **scratch** database beside the live one, compares row counts,
then drops the scratch copy. **The live database is never written to**, so this is safe to run on
the production server during working hours.

Verified on a real dump: 111 tables, every row count matching, zero errors.

A backup nobody has restored is a file, not a backup. The failure mode is always the same — the
nightly job runs green for months, and the first restore anyone attempts is during the incident.

### Restoring for real

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production stop api web

zcat /var/backups/pdash/pdash-db-<date>.sql.gz | \
  docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres psql -U <POSTGRES_USER> -d <POSTGRES_DB>

cat /var/backups/pdash/pdash-docs-<date>.tar.gz | \
  docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T api tar -xzf - -C /app/.data

docker compose -f docker-compose.prod.yml --env-file .env.production start api web
```

Stop `api` and `web` first. Restoring underneath a running application gives you a database that
changed halfway through, which is its own kind of broken.

---

## 2. Resource limits

All three services share one box with Postgres. Without ceilings, a leak or a runaway query in the
API starves the database — a recoverable fault in one process becomes a total outage.

Defaults (postgres 1g / api 768m / web 512m) suit a 4 GB box. **Check yours first:**

```bash
free -h
```

Override in `.env.production` if it differs. On the current 8 GB Contabo box the defaults are
about half of what is available, so there is headroom to raise them:

```
POSTGRES_MEM_LIMIT=2g
API_MEM_LIMIT=1g
WEB_MEM_LIMIT=768m
```

Raising them is optional — nothing is being throttled today. It buys room before Postgres starts
spilling sorts to disk as the tables grow.

These are ceilings, not reservations — setting them consumes nothing. Postgres gets the largest
share because it is the one process whose failure loses data rather than merely serving an error.

---

## 3. Log rotation

Docker's default `json-file` driver grows without limit. On a VPS that ends one way: the disk
fills, Postgres cannot write, everything stops.

Each service is now capped at 3 files × 10 MB — 90 MB total across the stack, worst case.

Check what the logs are using:

```bash
du -sh /var/lib/docker/containers/*/*-json.log | sort -h | tail -5
```

---

## 4. Healthchecks

`restart: unless-stopped` restarts a **crashed** container. It does nothing for a **hung** one —
process alive, service dead. That exact failure has already happened twice with the tunnel.

Both `api` and `web` now have healthchecks, using `node` rather than curl or wget because
`node:20-slim` ships neither.

```bash
docker compose -f docker-compose.prod.yml ps
```

`healthy` means it is answering. `running` alone does not.

The API's check allows a 90-second `start_period`: it runs `prisma migrate deploy` before it
listens, and a slow migration must not be read as a failed service.

---

## When something goes wrong

**A 502 from the site** — the API is not up.

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production ps
docker compose -f docker-compose.prod.yml --env-file .env.production logs --tail=100 api
```

Read the logs before changing anything. The last time this happened the cause was blanked secrets
while the on-screen error talked about the database, which sent the diagnosis the wrong way for
twenty minutes.

**A container keeps restarting** — it is probably being OOM-killed. Raise its limit in
`.env.production` and check `free -h`:

```bash
docker inspect <container> --format '{{.State.OOMKilled}}'
```

**Deploying** — always both flags:

```bash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d --build
```

`-f` because the plain compose file holds only postgres/redis/minio and a deploy without it
silently changes nothing. `--build` because `packages/db` is compiled at image build time.

---

## 5. Data retention

Three tables grew with use and were never pruned. Measured on the development database:
**1,164 refresh tokens, of which exactly one was live.**

A daily in-process sweep (`RetentionModule`) now removes what nothing reads:

| Table | Kept for | Why that long |
|---|---|---|
| `refresh_token` | 30 days **after expiry** | Tokens live 14 days. A revoked-but-unexpired row is what detects a stolen token being replayed, so those are never touched. |
| `analytics_event` | 365 days | The Performance page looks back at most 90 days, or 180 with the previous-period comparison. A year is double the longest question anyone can ask. |
| `activity` | 365 days | The task/project activity feed. |

`audit_log` is deliberately **not** swept. It is the compliance record, and the one table here
whose value grows with age.

Override per deployment in `.env.production`; `0` disables a purge entirely:

```
RETENTION_REFRESH_TOKEN_DAYS=30
RETENTION_ANALYTICS_DAYS=365
RETENTION_ACTIVITY_DAYS=365
```

Deletion runs in batches of 5,000 rather than one statement across a year of rows, which would
hold locks on the same box that serves the app. To run it now instead of waiting for the daily
pass, `POST /retention/sweep` (needs `settings.update`); it returns what it removed.

---

## Still outstanding

Nothing from the earlier list. For the record, all three are now done:

- Performance counted tasks by loading every assigned row — now counted in SQL.
- Comment threads loaded in full — now the newest 100, widened on request.
- The three tables above had no retention policy — now swept daily.
