# ACID review — the time ledger, tasks and the capacity board

*8 September 2026. Scope: every path that writes hours (My Tasks, the Timesheets module, the
per-project Timesheets tab, issues), everything that reads them back (My Tasks, Timesheets, the
Team Capacity board and the project Capacity tab, Home, Performance), and the database beneath.*

The question asked was whether the system is atomic, consistent, isolated and durable across
these modules — whether a number entered in one place is the same number everywhere else, at
every moment, including under concurrent use and mid-request failure. The short answer is that
it now is. It was not, in six specific places, which are listed below with what changed.

## The invariant

**`Task.actualHours` is the sum of the task's non-deleted timesheet rows, and nothing else may
write it.** Every screen that shows a task's hours (My Tasks, the project task list, the task
panel, Performance, the Home cards) reads that column or the ledger it summarises. The capacity
board now reads the ledger too: a person's remaining effort on a task is
`min(estimate × (1 − completion%), estimate − hours they logged)`, so time filed anywhere moves
their plotted load at the next poll.

## What was wrong, and what changed

| # | Finding | Property | Fix |
|---|---|---|---|
| 1 | The row write and the `actualHours` recompute ran as **two statements**, the second outside the lock. A crash between them left the task's total wrong for ever — nothing else recomputes it. Affected `create`, `update`, `softDelete`, `assign`. | Atomicity | The recompute takes the transaction client and runs **inside** the same locked transaction as the row. |
| 2 | `assign` (buffer entry → task) and `softDelete` took **no lock** at all; `assign` ran its duplicate check unlocked, so two simultaneous assigns of two buffer entries onto one task both passed. | Isolation | Both now run under `serialize(dayKeyFor(user, day))`, the same per-person-per-day advisory lock every other ledger write takes. |
| 3 | Raising an **issue with hours** checked the day cap **before** and **outside** its transaction, with no lock — exactly the race the lock exists to prevent — and against a cap of **24h** while every other path caps at **16h**. It also computed "today" in UTC (yesterday until 05:30 IST). | Consistency | One locked transaction: cap check, issue, time entry. The cap constant is imported from the timesheets service. Today is the IST day. |
| 4 | The capacity board **never read the ledger**. Forty hours logged against a task left its remaining effort untouched; only a status change or a percentage edit moved the board. | Consistency | The board reads `SUM(hoursLogged)` per person per open task and takes the smaller of the two remaining-effort signals. Verified: logging 2h lowers that person's remaining by 2h. |
| 5 | Task edits and status changes wrote the task, then recomputed project progress in a **separate** transaction; staffing wrote the assignee rows in one transaction and the summed estimate in another. | Atomicity | Progress recompute and the estimate write happen inside the task's transaction (`update`, `setStatus`, `softDelete`, `setAssignees`, `setStaffing`). The recompute is sequential inside the transaction (one connection). |
| 6 | The database held **no rule** about a timesheet row: hours could be 0 or 40, and a row could point at a task **and** an issue (counted twice). | Integrity | Two CHECK constraints (`0 < hours ≤ 16`; task XOR issue). Added `NOT VALID`, so the deploy cannot fail on a historical row; validate at leisure with the statements in the migration's header. |
| 7 | Logging from the Timesheets page or the project tab refreshed only the caches those screens read; My Tasks kept the old hours, the board its old load, the Home cards their old counts until a stale-time expired. The retrospective board (`capacity-history`) was never invalidated by anything. | Consistency (client) | One helper, `invalidateTimesheetCaches`, lists every cache that renders the ledger; every mutation site calls it. `invalidateTaskCaches` gained `coverage-risks` and `perf-me`. The user-profile page's orphan capacity key now shares the board's prefix. |

### Kept as designed

**Closing a task tops up the ledger in a second transaction.** The close commits first; the ledger
write follows, and if the ledger refuses (day cap, closed matter, backdating window) the close
stands and the refusal comes back as a warning. This is deliberate: a cap on a person's day must
not stop a task from being marked done. The window is documented in `task-time.service.ts`; the
warning is shown in the UI; and `actualHours` is recomputed from whatever the ledger holds, so the
two never silently disagree.

**Soft-deleting a task withdraws its learned standard in its own transaction** before the
soft-delete. A failure between the two leaves the standard withdrawn for a task still present,
which only affects a learned average, never a ledger figure.

## Verification

Run on a fresh database (every migration, the seed) against the built API.

| Check | Result |
|---|---|
| 8 concurrent submissions of 3–4.75h onto one person's day | Cap held at ≤16h; every refused amount would have exceeded it; refusals were cap refusals, not duplicates |
| `Task.actualHours == SUM(ledger)` after the burst, after an edit, after a delete | Equal each time |
| A refused entry (over the cap) | Ledger and task unchanged |
| `INSERT` with 0h, with 17h, with a task and an issue | Refused by the database (`timesheet_hours_in_range`, `timesheet_task_xor_issue`) |
| Issue raised with hours over the cap | Refused (400) |
| Logging 2h against a task | The board's remaining for that person and task fell by 2h; logged rose by 2h |
| A second session logs 1h while the board is open in the first | The board's next poll (26s later) showed remaining 6h → 5h, logged 2h → 3h, and the hover card read "3h logged of 8h estimated" |
| Time logged from My Tasks, then the Timesheets page opened by in-app navigation within its 30s stale window | The new entry was there without a reload (the mutation invalidated the ledger caches) |
| Postgres | `fsync=on`, `synchronous_commit=on`, `full_page_writes=on`, `wal_level=replica` — a committed transaction is on disk before the API answers |

Durability beyond the database: `scripts/backup.sh` takes a nightly `pg_dump --clean` plus the
documents volume, verifies the dump is complete, and keeps thirty days. A restore drill is in
`scripts/restore-drill.sh`.

The harness is `acid_test.py` in the session's scratch directory; it is not part of the repo
because it mutates the database it points at.

## Remaining limits, stated plainly

- **The daily cap is a rule of the API, not of the database.** A sum across rows cannot be a
  CHECK constraint; it is enforced by the advisory lock, which every write path now takes. A
  future write path that forgets the lock reopens the race. The lock helper's header says so.
- **`task_assignee` allows two role-less rows for one person on one task** (the unique key includes
  the nullable `role`). The reconciliation code never creates a second one; a partial unique index
  would close it at the database but cannot be expressed in the Prisma schema, so it was left out
  rather than introduce a permanent migration-drift warning.
- **Polling, not push.** The board re-reads every 30 seconds while visible, and on focus and
  reconnect; every mutation in the app invalidates it immediately in the same session. A change
  made by someone else is visible within the interval. For a firm of thirty this is the
  right trade; websockets buy sub-second latency nobody has asked for.
