# System audit — September 2026

A deep pass over the whole dashboard looking for defects: dates, times, alignment,
responsiveness, visibility, logic, and anything that would fail later even if it looks fine now.

Every finding below was **reproduced** before it was fixed and **verified** after — in a browser,
against a seeded database, or with an assertion — not judged by reading the code. Where something
was checked and found sound, it is recorded as such, because "we looked and it was fine" is worth
as much to the next person as a fix.

Environment: an isolated stack (web :3011, API :4011, database `pdash_audit`) built from this
branch. The live demo on :3001/:4000 was never touched.

---

## Summary

| | Count |
|---|---|
| Defects found and fixed | 15 |
| Areas checked and found sound | 9 |
| New regression tests | 31 assertions |

Nothing found is left unfixed.

---

## 1. Dates and times

The largest cluster, and all one root cause: **a calendar day derived by slicing an ISO string**.
India is UTC+5:30, so that slice is the *previous* day for the first five and a half hours of
every day, and it is the wrong day outright when applied to a `Date` built from local parts.

### 1.1 The team calendar was shifted a whole column — HIGH

`dayKey` was `d.toISOString().slice(0, 10)`, applied to columns built from **local** midnight. The
column showing "7" was keyed `2026-09-06`, while leave and meetings keyed `2026-09-07`. Every
chip, and the "today" ring, rendered one column to the right of where it belonged.

```
column key for the 7 Sep column : 2026-09-06   ← built from local midnight
leave stored for 7 Sep          : 2026-09-07
```

Columns now key off the local getters. Busy blocks are read by what they *are*: leave, WFH and
comp-off are date-only values at UTC midnight (UTC day); meetings and blocked time are real
instants (IST day). Reading either through the other's rule moves it a day.

### 1.2 The daily digest's date arrows did not work — HIGH

`shift()` parsed `YYYY-MM-DD` as local midnight, added days in milliseconds, then sliced as UTC.

```
shift('2026-09-07', +1) = 2026-09-07   ← did not move
shift('2026-09-07', -1) = 2026-09-05   ← skipped a day
```

Yesterday's digest was unreachable by clicking, in both directions. Day arithmetic now happens on
the date itself via `setUTCDate`.

### 1.3 "Today" was yesterday before 5:30am, in fourteen places — MEDIUM

Timesheet and expense forms defaulted to the wrong day; `max` on date inputs refused the current
day; an approved WFH request covering today went unrecognised, so an early punch was recorded as
office attendance. All now use `todayIST()`.

### 1.4 Sixteen timestamps rendered in the viewer's timezone — MEDIUM

`lib/date.ts` opens by stating that real instants are pinned to Asia/Kolkata so the server (a UTC
container) and the browser render the same string. Sixteen call sites passed no `timeZone` at all.

Found by looking at the screen: a block created for 9–10am appeared as **"3:30 AM–4:30 AM"**. On a
correctly-set Indian machine the output is identical, which is exactly why it survived. Two
consequences — a wrong or travelling device clock moves punch times, meeting times and audit
stamps; and anything server-rendered then hydrated in an IST browser is a React hydration
mismatch, the very case the file's own header says the explicit timezone exists to prevent.

Fixed across attendance, calendar, team calendar, project activity and discussions, appraisals,
the org performance stamp, the audit log, the admin user timeline, the passcode lockout, and the
PDF footer. All-day events read as UTC, since they are date-only values.

### 1.5 `toUtcDay` threw on a malformed value — LOW

`toISOString()` raises a `RangeError` on an Invalid Date, and it was called unguarded. One bad row
would have blanked an entire screen. It now returns `''`.

**Fixed by** four helpers in `lib/date.ts` that carry the distinction which was previously made ad
hoc at every call site: `istDay` (instant → IST day), `localDay` (local Date → its own day),
`shiftDay` (day arithmetic), `toUtcDay` (date-only value). `todayUtc` keeps its name but now says
in its doc comment why it is almost never what you want.

**Pinned by** `tools/date-helpers.spec.ts` — 31 assertions, passing identically under IST, UTC and
a US zone.

---

## 2. Data integrity — the task-timing feature

Three defects in work shipped last week, found by reading it back and then reproducing each
against a real database.

### 2.1 Re-staffing destroyed the record of who did what — HIGH

`setAssignees` and `setStaffing` did `deleteMany` + `createMany`. A `TaskAssignee` row is not just
a link — it carries the hours that person confirmed and which learned standard those hours fed.
Deleting every row to add one reviewer did two silent kinds of damage:

- **The contribution was stranded.** The sample stayed in `task_standard` with nothing left in the
  database able to withdraw it, and closing the task again posted a *second* completion. One task
  counted twice; the learned average was permanently wrong, and it compounded with every
  re-staffed task.
- **Everyone's confirmed hours were erased.** A task's `actualHours` is the sum across its
  assignees, so the next person to record their part reset the total to their own figure alone.

Neither shows an error. You would notice months later, as an expectation that had drifted for no
visible reason.

Seats are now **reconciled**, not replaced: matched first on exact (person, role), then adopted
for the same person reclassified — because that is the same human doing the same work, and the
hours belong to them, not to the label on the seat. A seat that genuinely goes away has its
contribution withdrawn first.

### 2.2 A legacy assignee lost their hours when given a job title — HIGH

Found only by running 2.1's fix against real data. `role` is nullable — every assignee predating
role-based staffing has `NULL`, which the timing code reads as ANALYST. So giving a legacy
assignee an explicit title read as "seat removed, different seat added", and their hours were
withdrawn and dropped. Hence the two-pass match above.

### 2.3 Deleting a completed task left its hours in the average forever — MEDIUM

`withdraw()` was written for exactly this and never called. `softDelete` now calls it.

Also: the organisation was resolved through `task.createdBy`, and offboarding purges the account —
so every later withdrawal threw "User not found", surfacing as a failure to delete an ordinary
task. It now resolves through the signed-in actor.

**Verified end to end against a seeded database:**

| Scenario | Result |
|---|---|
| legacy no-role seat → ANALYST | hours kept, standard unchanged at 480min / 1 completion |
| re-record 6h after re-staffing | **one** completion at 360min → 6h *(was 2 completions → 7h)* |
| ANALYST → REVIEWER | ANALYST withdrawn to 0/0, confirmed hours retained |
| record 4h under the new role | REVIEWER learns 240min / 1 completion |
| person removed from the task | both standards back to 0/0 |
| task deleted | 300min / 1 completion → 0/0 |

That second row is the number the review was explicit about: a task reopened and re-closed counts
**once at what it finally took**, never twice at the mean of both attempts.

### 2.4 A second, dead source of truth for the arithmetic — MEDIUM

`task-standards.ts` carried a documented TypeScript implementation of the running-average
maths — `expectedHoursFrom`, `postCompletion`, `withdrawCompletion`, `addCompletion` — that
nothing called. The real arithmetic is a single SQL statement in `applyDelta`, which it has to be:
two tasks of the same kind closing in the same instant would otherwise each read the same totals
and each overwrite the other.

Two documented authorities for the numbers that decide how everybody is measured, one of which
does nothing, is worse than one — the next person to correct the rounding would have corrected the
copy that never runs. The dead code is gone; the rules it encoded now sit beside the SQL that
enforces them.

---

## 3. People who were supposed to be gone

### 3.1 The seed still created two of them — HIGH

Arjun Ghosh and Nitin Goel were purged from the Contabo database in July to erase them from the
system. They were never removed from the seed, which still created both accounts and wove them
through twenty-five places: departments, project tasks, two discussion channels, calendar events,
the leadership punch records and the ninety-day history backfill.

Nothing was wrong on Contabo, because that database is not reseeded. But **the AWS migration
starts from a seeded database**, and so does any demo reset or new developer's machine. Deleting a
person from one running database is not erasing them from the system while the code that builds
the system still creates them.

Their work was reassigned rather than dropped, so the seeded firm still hangs together:

| Removed | Work went to |
|---|---|
| Arjun Ghosh — Research Associate, "lead search analyst" | Basant Goyal, Senior Research Associate, already in Search |
| Nitin Goel — Manager, docketing and deadlines | Ankit Verma, the other Manager |

Two places needed more than a rename: Arjun both created the search-team channel and sat in it
alongside Basant, so renaming would have inserted Basant twice and tripped the (channel, user)
unique key — his seat went to Amritpal Kaur. And neither replacement joins a second department;
Search and Operations simply keep their remaining people.

Verified by dropping a database and seeding from empty: **26 users, no trace of either name**, all
65 tasks still assigned, 20 channel memberships, 13 department rows, 15 events, nothing orphaned.

Riya Bhola was already absent from the seed.

---

## 4. Reasoning shown on screen

### 4.1 The Performance page contradicted itself about its own period — MEDIUM

The tab said "5 working days", the caption said "5 working days", and the panel underneath said
"last 7 days". `periodLabel()` exists for exactly this and the page header used it, but
`UserPerfPanel` and `OrgView` formatted `Last ${days} days` from the raw calendar count. Five
working days spans seven calendar days, so both statements came from the same number and only one
described what was being measured. Quarter and Half-year read "Last 90 days" and "Last 182 days"
for the same reason.

The trend charts still say "Last 7 days" and that is **correct** — they label the points actually
plotted, and the trend is capped at 30 days however long the period is.

### 4.2 "0% on-time" when nothing had a deadline — MEDIUM

`pct(0, 0)` returns 0, so a window in which no deadline-bearing task closed scored zero —
indistinguishable from having missed every deadline, sitting in the KPI strip as a bare 0%. Nobody
had failed anything.

`onTimeCompletionRate` is now `null` in that case, which is the distinction `billablePct` in the
same object already draws between a bad score and no score, for the same stated reason. The tile
and gauge read **"n/a — nothing with a deadline closed"**, matching the wording already used for
billable.

### 4.3 My Tasks opened on the wrong thing — MEDIUM

The home card was taught to order work by what to do next. My Tasks never was, and it is the page
people are told to work from. It rendered whatever order the API returned — by due date — so a
task closed in June sat above six overdue ones, and a LOW task sat above a CRITICAL one because it
happened to be older. Same comparator now applies to both.

---

## 5. Failing later

### 5.1 One stray promise rejection took the whole API down — MEDIUM

There was no handler for unhandled rejections or uncaught exceptions, and no `.catch()` on
`bootstrap()`. Node terminates on an unhandled rejection, so a single fire-and-forget failure
anywhere took the dashboard down for all 28 people at once; the container restarts, but every
request in flight fails and a repeating rejection becomes a crash loop. A failure to *start*
surfaced as a bare stack trace with no indication it had happened at startup.

The two cases are now treated differently, which is the point of handling them at all:

- **unhandled rejection** → log loudly and keep serving. One operation failed; the process is fine.
- **uncaught exception** → log, exit non-zero, let the container restart. Unknown state is worse
  than a restart.

### 5.2 A migration timestamp collision, avoided — LOW

The in-flight calendar migration was stamped `20260907090000`, already taken by
`pid_multi_round`. Renamed to `20260907140000` before it could land. (An existing pair at
`20260906090000` was left alone: Prisma sorts lexicographically, so their order is deterministic,
and the full chain applies cleanly from empty — verified twice during this audit.)

---

## 6. Visibility

### 6.1 The browser tab had no icon — LOW

`public/fav.png` has been in the repo unreferenced. With no icon declared, every page load
requested `/favicon.ico`, got a 404, and the tab showed a blank sheet where the Squark mark should
be. Declared in the layout metadata, so there is still one file to replace when the logo changes.

---

## 7. Alignment

### 7.1 The contribution heatmap's day labels named the wrong rows — MEDIUM

Mon/Wed/Fri were three spans spread with `justify-around` over a seven-row column, landing 10–18px
off — more than a full row, so **every label pointed at the wrong day**. They now sit on the same
11px/3px rhythm as the cells.

The month row and legend took their indent from a guessed `pl-8` rather than the gutter's real
width; all three rows now share one spacer element, so they cannot drift apart. And the week count
over-counted by one whenever the span was a whole number of weeks, leaving a blank column hanging
off the right edge.

---

## Checked and found sound

Recorded so the next audit does not repeat the work.

| Area | Finding |
|---|---|
| **Responsiveness** | No horizontal page overflow on any of 25 routes at 390px or 768px. Every wide table already sits in its own scroll container. |
| **Every module renders** | All 25 routes load with a proper heading, no console error, no failed request, no error boundary, at 390 / 768 / 1600px. |
| **Nest route ordering** | No shadowed routes. Static paths are declared above their `:id` siblings, and the apparent exceptions differ in segment count so they cannot collide. |
| **Prisma optional-relation `NOT`** | Every "not closed" filter is written as the explicit `OR: [{ rel: null }, …]` form. The trap is documented in `performance.service.ts` and consistently avoided. |
| **Division by zero** | Every ratio is guarded. `weightedMean` checks its denominator; percentage helpers return 0 rather than `NaN`. |
| **Scheduled sweeps** | Retention, overdue and digest all catch internally, guard re-entrancy, delay past boot, `unref()` their timers and clear them on shutdown. |
| **Capacity arithmetic** | The per-day spread, the beyond-window denominator and the free-run calculation are all correct. The window is half-open, so the extension loop does not double-count its boundary. "9d window" is the free *run* from the first free day, not the window length. |
| **Authorization on undecorated endpoints** | Channels, documents and timesheet deletes carry no `@RequirePermission` by design; each enforces ownership or membership in the service, with the reason written down. |
| **Error pages** | `error.tsx`, `global-error.tsx` and `not-found.tsx` all present and rendering properly. |

---

## Still open — not defects, but worth knowing

- **No user has a `joiningDate`.** People Ops, probation tracking and pro-rated leave all depend
  on it and cannot compute anything until it is entered. This is missing *data*, not broken code.
- **The shared access token** used for these pushes is still live and should be revoked once you
  are done with it.
- **`AnantSQIP/pdash-v2`** is a redundant duplicate of this repository and can be deleted.
