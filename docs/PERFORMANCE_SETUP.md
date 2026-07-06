# pdash / SquarkIP — Performance Setup & Runbook

This document explains why the app was slow, the permanent fix, and how to run it
fast on **both Linux/WSL and Windows**.

---

## 1. Root cause (measured, not guessed)

The app was slow because it ran **`next dev` (development mode) off `/mnt/c`** — the
Windows drive mounted into WSL2 over the **9p protocol**. Every click/route/hot-reload
makes Next.js read thousands of module files, and each read on that mount is ~3,000×
slower than a native disk.

| Test | `/mnt/c` (9p mount) | Native disk (ext4 `~/`) |
|---|---|---|
| Read 2000 module files | **104 seconds** | 0.03 seconds |
| API endpoint latency | 4–76 ms (already fine) | — |
| Page/route serve (after fix) | — | **2–5 ms** |

The API and PostgreSQL were never the bottleneck. **The fix is environmental: run a
production build from a native filesystem.** That alone made routes ~10,000× faster.

---

## 2. The golden rule

> **Never run the app across the OS filesystem boundary.**
> Run it natively on whichever OS, as a **production build** (not `next dev`).

- **On Linux / WSL:** run from `~/pdash` (native ext4) — *this is the tested, running setup.*
- **On Windows:** run from `C:\Users\anant\Videos\pdash` using **Windows-native Node** (native NTFS).

Editing is fine from anywhere; just don't *run* the dev server off `/mnt/c`.

---

## 3. Run it — Linux / WSL (recommended, already set up)

```bash
cd ~/pdash
npm install          # first time only
npm run build:all    # prisma generate + build db + api + web  (re-run after code changes)
npm run serve        # starts API (:4000) + web (:3001); Ctrl+C stops both
```

Open http://localhost:3001. That's it.

## 4. Run it — Windows (native, no WSL)

Requirements: **Node 20+ for Windows** and the app's Postgres reachable at
`localhost:5432` (see note below).

```powershell
cd C:\Users\anant\Videos\pdash
npm install
npm run build:all
npm run serve        # same cross-platform launcher (scripts/serve.mjs)
```

**Database note:** the API needs PostgreSQL at the `DATABASE_URL` in `.env`
(`localhost:5432`). If Postgres runs inside WSL, WSL2 forwards its port to Windows
`localhost`, so Windows-native Node can usually reach it. If not, either run Postgres
on Windows (Docker Desktop or the native installer) or simply keep using the WSL setup
(§3) — both run on the same physical PC.

---

## 5. After you change code

Rebuild the affected part, then restart `npm run serve`:

```bash
npm run build:all     # or: npm run build --workspace=apps/web   (web-only change)
```

There is **no watch/dev mode in production** — that's intentional; it's what keeps it fast.
(For active development with hot-reload, `npm run web:dev` still exists, but only run it
from a **native** filesystem, never `/mnt/c`.)

---

## 6. What was hardened in the code (applied)

- **DB indexes** (`packages/db/prisma/schema.prisma`, pushed via `prisma db push`):
  `TaskAssignee(userId)`, `Issue(assigneeId)`, `Issue(reportedBy)`,
  `ProjectMember(userId)`, `Project(deletedAt)`, `Task(deletedAt)`. These remove the
  unindexed scans the performance/analytics queries were doing per-user.
- **React re-render fix** — memoized the three global context providers
  (`auth-context`, `org-context`, `permissions-context`) with `useMemo`/`useCallback`.
  Previously every provider render created new objects/closures, cascading a re-render
  through the Sidebar, every `<Can>`, and every page.
- **Sidebar poll** relaxed 15s → 30s (pauses when the tab is hidden).
- **Build tooling fixed**: `apps/api` now builds with `tsc` (the previous `nest build`
  emitted nothing here); web `start` standardized to port 3001; added
  `build:all` / `serve` / `start:api` / `start:web` cross-platform npm scripts and
  `scripts/serve.mjs` (the launcher).

## 7. Recommended next (optional, not yet applied — deferred to avoid demo risk)

These are latent/scale issues, not current slowdowns (verified against live data):

- **Profile photos as base64** — `users.list` selects `profilePhoto` (a data URL up to
  ~900 KB). 0 users have photos today (list is 9 KB), but once photos are uploaded this
  becomes a multi-MB payload fetched app-wide. Fix: drop `profilePhoto` from the list
  projection; add a cacheable `GET /users/:id/photo` and have `Avatar` use `<img src>`.
- **Org leaderboard N+1** — `PerformanceService.getOrgPerformance` fans out ~14 queries
  per user (`Promise.all`). The new indexes make each query fast, but at real scale
  convert to set-based `groupBy`. (Also make `rebuildSnapshots` async/batched.)
- **Effective-permissions caching** — cache per `userId + securityVersion` (short TTL).
- **Pagination** on unbounded list endpoints + stream the audit CSV export.

---

## 8. Public demo link (Cloudflare tunnel)

The tunnel points at `localhost:3001`, so it automatically serves whatever is running
there. Start the app (§3), then:

```bash
cloudflared tunnel --url http://localhost:3001
```

The link is live only while the PC + servers + tunnel are running. A free quick-tunnel
URL changes each time it restarts.
