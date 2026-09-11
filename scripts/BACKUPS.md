# Backups

Everything the dashboard holds, kept in two places: on the Contabo server and on your own
machine. This file is the whole of it — what is taken, where it lands, how long it stays, how to
check it, and exactly what to type when you need it back.

Written for the day you need it, which will not be the day you read it first.

---

## The short version

| | Contabo (`217.76.59.244`, ssh port 2222) | Your machine (WSL) |
|---|---|---|
| Script | `scripts/backup.sh` | `scripts/backup-pull.sh` |
| Runs | nightly 02:15, from root's crontab | daily 08:30, Windows Task Scheduler |
| Lands in | `/var/backups/pdash/sets/` | `/mnt/c/Users/anant/pdash-backups/sets/` |
| Keeps | daily 30d · Sundays 90d · 1st-of-month 365d | daily 90d · Sundays 365d · 1st-of-month **forever** |
| Verified | every run, before the set is published | every run, on arrival, against the server's checksums |
| Proven restorable | `scripts/restore-drill.sh`, monthly from cron | run the drill by hand on a pulled set |

The two sides use the **same names and the same layout**, so a set on the laptop and the same set
on the server are matched at a glance.

---

## What a backup actually is

One run produces one **set**: a directory that is restored as a unit.

```
/var/backups/pdash/
├── sets/
│   ├── pdash-2026-09-11_0215/
│   │   ├── db.sql.gz        the database — pg_dump --clean --if-exists, gzipped
│   │   ├── docs.tar.gz      the documents volume (/app/.data) — patent PDFs and attachments
│   │   ├── config.tar.gz    .env.production, compose file, Caddyfile, crontab, git commit
│   │   ├── manifest.json    what this set IS: migration, commit, row counts, checksums
│   │   └── SHA256SUMS       so the copy on the laptop can be proved identical
│   ├── pdash-2026-09-10_0215/
│   └── …
├── LATEST                   name of the newest set that passed verification
├── LAST_RUN_FAILED          present ONLY when the last run failed; holds the reason
└── backup.log
```

Your machine holds the identical structure under `/mnt/c/Users/anant/pdash-backups/`, plus
`INVENTORY.md` — a readable list of every set held, rewritten on every pull.

### Why all four files

- **`db.sql.gz`** — everything the application stores. A dump rather than a volume snapshot:
  a dump is consistent, portable across Postgres versions, and can be replayed into a scratch
  database to prove it works. Copying `/var/lib/postgresql/data` out from under a running server
  produces a file that usually restores and occasionally does not, and you learn which on the day
  it matters.
- **`docs.tar.gz`** — uploaded bytes live on **disk**, in the `docdata` volume
  (`DOCUMENT_STORAGE_DIR=/app/.data/documents`), not in Postgres. A database dump on its own
  restores a system where every single document link is broken. (The one exception:
  `DocumentBlob` rows, the fallback the API writes when a disk write fails, ride along inside the
  database dump. Both halves are covered; neither alone is enough.)
- **`config.tar.gz`** — what it takes to stand the stack up again on a *different* machine.
  **⚠ This file contains live secrets** — the database password and the JWT signing key. It is
  written mode `0600`. Never put it on a shared drive, never commit it. `BACKUP_CONFIG=false`
  leaves it out entirely if you would rather keep secrets only in your password manager.
- **`manifest.json`** — the migration the schema was at, the git commit that was deployed, the
  Postgres version, and the row counts at the moment of the dump. **This is the file that makes a
  restore safe.** A dump replayed into a checkout three migrations ahead boots fine and is quietly
  wrong. The manifest says which code this data belongs to.

### What is NOT covered

- The Docker images. Rebuilt from the repo at the recorded commit.
- The Postgres data directory itself (`pgdata`). The dump replaces it.
- Let's Encrypt certificates. Caddy re-issues them; **mind the rate limit** — see
  `scripts/set-public-domain.sh` before touching the hostname.
- The local demo running in WSL (`:3001` / `:4000`). That is a **different database with a
  different password** and is not production. It is not backed up and does not need to be.
- Anything a person has only in a browser tab and has not saved.

---

## Installing it

### On Contabo (once)

```bash
ssh -p 2222 root@217.76.59.244
cd /root/pdash
chmod +x scripts/backup.sh scripts/restore-drill.sh scripts/backup-purge.sh
crontab -e
```

Add:

```
15 2 * * *  cd /root/pdash && ./scripts/backup.sh        >> /var/log/pdash-backup.log 2>&1
0  3 1 * *  cd /root/pdash && ./scripts/restore-drill.sh >> /var/log/pdash-backup.log 2>&1
```

(`scripts/contabo-deploy.sh` now installs both of those itself, and removes the old ad-hoc
`/root/pdash-backup.sh` entry it used to add.)

The redirect matters: **a cron job whose output goes nowhere is a job you will not know has been
failing.** A failure is also written to syslog, and leaves `LAST_RUN_FAILED` in the backup root,
which the next run and the daily pull both read out loud. Set `BACKUP_ALERT_CMD` to send it
somewhere you actually look:

```bash
# in root's crontab, before the lines above
BACKUP_ALERT_CMD=curl -fsS -X POST -d @- https://your-webhook
```

### On your machine (once)

```bash
# key-based ssh, because a scheduled job cannot type a passphrase
ssh-keygen -t ed25519 -C "pdash-backup"          # only if you have no key yet
ssh-copy-id -p 2222 root@217.76.59.244           # asks for the root password once

cd /mnt/c/Users/anant/Videos/pdash
bash scripts/backup-pull.sh                      # first pull, by hand
bash scripts/backup-pull.sh --install-schedule   # daily at 08:30
```

WSL has no dependable cron — the distro is not running when Windows is idle, so a crontab entry
inside WSL does not fire on the days it matters most. `--install-schedule` registers a **Windows**
scheduled task that starts WSL to do the pull. If `schtasks.exe` is not reachable from WSL it
prints the exact command to paste into an admin PowerShell instead.

---

## The daily pull is also the watchdog

The server cannot tell you it has stopped backing up. A dead cron job makes no noise whatsoever,
and that silence is how a company discovers in month seven that month two was the last backup.

So every pull checks, before anything else:

- is there a `LAST_RUN_FAILED` marker on the server?
- is the newest set on the server fresher than `STALE_HOURS` (default 36)?

If either is wrong the pull **exits non-zero and says so in plain words**. That is the check that
catches the silence.

---

## Checking what you have

```bash
bash scripts/backup-pull.sh --report        # the inventory, on screen
cat /mnt/c/Users/anant/pdash-backups/INVENTORY.md

bash scripts/backup-pull.sh --verify-only   # re-verify every set held locally; transfer nothing
```

`--verify-only` re-computes every checksum against `SHA256SUMS`, re-reads each dump to its end
marker, and lists each tarball. It is the answer to "are the backups on this laptop still good",
and it is worth running after moving them to a new drive.

On the server:

```bash
./scripts/restore-drill.sh                  # newest set
./scripts/restore-drill.sh /var/backups/pdash/sets/pdash-2026-09-11_0215
```

The drill restores into a **scratch** database beside the live one, compares the restored row
counts against the counts the manifest recorded when the dump was taken, checks the documents
archive unpacks and that `_prisma_migrations` came back, then drops the scratch copy. **The live
database is never written to.** It is safe during working hours.

Comparing against the manifest rather than against live is the point: live counts have moved since
the dump, so a restore that silently lost last week's timesheets still looks plausible next to
them. The manifest is a statement of fact about *that dump*, and any difference is a real loss.

---

## Restoring

### First, decide what you are restoring

Read the manifest before anything else:

```bash
cat /var/backups/pdash/sets/pdash-2026-09-11_0215/manifest.json
```

`schemaMigration` and `gitCommit` tell you which code this data belongs to. **Put the code back
first.** Restoring last month's database under this month's code gives you an application that
starts cleanly and is wrong in ways nobody notices for a week.

### Restoring onto the existing server

```bash
ssh -p 2222 root@217.76.59.244
cd /root/pdash
SET=/var/backups/pdash/sets/pdash-2026-09-11_0215

# 0. prove the set is good, and take a dump of the CURRENT state first — you may want it back
./scripts/restore-drill.sh "$SET"
./scripts/backup.sh

# 1. put the code where the backup expects it
git fetch --all
git checkout "$(sed -n 's/.*"gitCommit": *"\([^"]*\)".*/\1/p' "$SET/manifest.json")"

# 2. stop the app (NOT postgres — it is what you are restoring into)
COMPOSE="docker compose -f docker-compose.prod.yml --env-file .env.production"
$COMPOSE stop web api

# 3. replay the database
zcat "$SET/db.sql.gz" | $COMPOSE exec -T postgres psql -U pdash -d pdash

# 4. put the documents back
$COMPOSE start api
zcat "$SET/docs.tar.gz" | $COMPOSE exec -T api tar -xzf - -C /app/.data

# 5. bring it up and look at it
$COMPOSE up -d
curl -fsS http://127.0.0.1:3000/api/v1/health
```

Step 0 is not optional. The state you are about to overwrite may be the only copy of whatever
happened since the dump.

### Restoring onto a brand-new machine

From a set on **your** laptop, because the scenario here is that the server is gone.

```bash
SET=/mnt/c/Users/anant/pdash-backups/sets/pdash-2026-09-11_0215

# 1. the configuration — this is what config.tar.gz is for
tar -xzf "$SET/config.tar.gz"          # → ./config/.env.production, docker-compose.prod.yml,
                                       #   Caddyfile, root.crontab, git-commit.txt

# 2. on the new box: clone, check out the recorded commit, drop .env.production in place
git clone https://github.com/AnantSQIP/pdash.git /root/pdash
cd /root/pdash && git checkout "$(cat /path/to/config/git-commit.txt)"
cp /path/to/config/.env.production .

# 3. bring up postgres alone, then replay, then everything
docker compose -f docker-compose.prod.yml --env-file .env.production up -d postgres
zcat "$SET/db.sql.gz" | docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T postgres psql -U pdash -d pdash
docker compose -f docker-compose.prod.yml --env-file .env.production up -d
zcat "$SET/docs.tar.gz" | docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T api tar -xzf - -C /app/.data

# 4. DNS, and only then certificates — Let's Encrypt rate-limits repeated failures
bash scripts/set-public-domain.sh squarkip.io
```

---

## Clearing the old backups (the cutover)

`scripts/backup-purge.sh` deletes the backups from **before** the system was cleared. It is the
only script here that destroys anything.

What makes it safe:

- it does nothing without `--yes`, and then still asks you to type `PURGE`;
- it prints every path it intends to delete, with size and date, **before** it asks;
- it never touches anything created at or after the cutover moment (default: the moment you run
  it), so the new regime's own backups cannot be caught by a purge of the old one;
- it keeps the newest backup in each directory **that still verifies**, unless you pass
  `--no-keep-last` (which then demands you type `PURGE EVERYTHING`);
- it refuses any directory that is not recognisably a backup directory, and any inside the repo;
- it is safe to run twice — the second run finds nothing to do.

### The exact sequence to run on Contabo

Run these in order. Read the list the purge prints before answering it.

```bash
ssh -p 2222 root@217.76.59.244
cd /root/pdash
git pull

# 1. TAKE A GOOD BACKUP FIRST, and prove it restores. Do not skip this: it is the copy that
#    makes the purge below reversible in the only way that matters.
chmod +x scripts/backup.sh scripts/restore-drill.sh scripts/backup-purge.sh
./scripts/backup.sh
./scripts/restore-drill.sh

# 2. PULL IT DOWN to your machine as well, so a good copy exists off the server before anything
#    is deleted on it. (Run this ON YOUR MACHINE, in a second terminal.)
#      cd /mnt/c/Users/anant/Videos/pdash && bash scripts/backup-pull.sh

# 3. clear the workspace: no demo projects, no demo tasks, nothing. People, roles and logins stay.
docker compose -f docker-compose.prod.yml --env-file .env.production \
  exec -T -e ALLOW_PROD_RESET=true api node packages/db/prisma/dist/reset-operational-data.js --yes

# 4. take the FIRST set of the new era, on a clean system, and verify it
./scripts/backup.sh
./scripts/restore-drill.sh

# 5. NOW delete the old backups. This prints the full list and asks before touching anything.
#    It covers /var/backups/pdash and the legacy /root/backups the old deploy script wrote.
./scripts/backup-purge.sh                 # dry look first — refuses to delete without --yes
./scripts/backup-purge.sh --yes           # prints the list, asks for PURGE, then deletes

# 6. make sure the schedule is the new one
crontab -l | grep -E 'backup|restore-drill'
```

And on your machine, once the server side is done:

```bash
cd /mnt/c/Users/anant/Videos/pdash
bash scripts/backup-pull.sh               # pulls the first clean set
bash scripts/backup-purge.sh --yes        # clears the old local copies the same way
bash scripts/backup-pull.sh --install-schedule
bash scripts/backup-pull.sh --report
```

> **The one thing that can go badly wrong here** is running step 5 before step 4 has produced a
> verified set. Then `--keep-last` has only pre-cutover backups to choose from, and if you have
> also passed `--no-keep-last` there is nothing left at all. Do the steps in order, and read the
> list before you type `PURGE`.

---

## What the reset does and does not clear

`packages/db/prisma/reset-operational-data.ts` empties the workspace **without losing the
people**. It keeps the organization, every user and their login, every session (nobody is signed
out), all four layers of RBAC, departments, teams, reporting lines, the holiday calendar, leave
types and opening balances, workflows, project templates, technology domains, tags, custom-field
definitions, appraisal parameters, dashboards and integrations.

It deletes everything that records something that *happened*: projects, tasks and subtasks, work
sessions and coverage, patents and clients, PID requests and reservations, timesheets and
attendance, leave / comp-off / expense / WFH requests, deadline changes, discussions, calendar
entries, approvals, comments, issues, announcements, policies, appraisals, rewards, feedback, BD
deals, documents, and the whole audit/analytics trail. It also clears the PII inside user
profiles, and resets the PID and patent serial counters.

Every model in the schema is classified one way or the other, and
`tools/reset-coverage.spec.ts` fails if a new table is neither:

```bash
npx ts-node --compiler-options '{"module":"commonjs"}' tools/reset-coverage.spec.ts
```

That test is the reason the script will not go stale again. It was written because the schema had
grown to 117 models while the script still named 66 — and the other fifty-one were not decisions,
they were tables nobody was asked about.

---

## When something is wrong

| Symptom | What it means | What to do |
|---|---|---|
| `LAST_RUN_FAILED` in `/var/backups/pdash` | last night's run failed; the reason is in the file | read it, fix it, run `./scripts/backup.sh` by hand |
| the pull says **STALE** | the server has not produced a set in over 36h | check `crontab -l` and `/var/log/pdash-backup.log` on the server |
| the pull says **CORRUPT** | a set arrived damaged; it was deleted so the next run refetches it | run the pull again; if it repeats, the set on the server is bad — verify it there |
| the drill says **DRILL FAILED** | that set does not restore | do **not** rely on it; drill the one before it and find out how far back the good ones start |
| `could not read POSTGRES_USER` | the stack is down, so there is nothing to dump | `docker compose … ps`, bring it up, re-run |
| backup disk filling up | retention is not pruning, or the sets have grown | `du -sh /var/backups/pdash/sets/*`, then lower `KEEP_DAILY` |

---

## Files

| Path | What it is |
|---|---|
| `scripts/backup.sh` | the server-side nightly set |
| `scripts/backup-pull.sh` | the off-site copy, the retention, the inventory, the watchdog |
| `scripts/backup-lib.sh` | the naming, verification and retention shared by all of them |
| `scripts/restore-drill.sh` | proof that a set actually restores |
| `scripts/backup-purge.sh` | deletes the pre-cutover backups, carefully |
| `packages/db/prisma/reset-operational-data.ts` | clears the workspace, keeps the people |
| `tools/reset-coverage.spec.ts` | fails if a new table is not classified |
