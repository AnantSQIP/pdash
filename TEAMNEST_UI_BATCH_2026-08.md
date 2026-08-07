# TeamNest-parity batch — Leaves, Attendance, Expenses (2026-08)

Replicates the TeamNest layouts the team already uses (`/leaves/home/`, `/attendance/`, `/expense/`),
folds comp-off into the same form, redesigns the Daily Digest look-ahead, and fixes the defects
found while doing it.

**Verification: 219/219 across 12 real-service suites; both apps typecheck; web build clean.**

---

## A. Leaves — rebuilt to the TeamNest shape

`apps/web/components/attendance/LeavesHome.tsx` (new) replaces the old `LeavesTab`.

- Two status cards: **Leaves Balance Status for \<year\>** (Leave Type · Eligible · Availed · Pending ·
  Balance) and **Leaves Request Status for \<year\>** (Pending / Approved / Rejected / Cancelled).
- Three tabs: **My Leaves Calendar · Leaves Application Status · Leave Planner**.
- Application table: `Leave applied for | Start Date | End Date | Reason | Supporting Docs | Status`,
  expandable to the full request detail. **Cancel Leave** is a confirm dialog, not a bare button.
- Planner table: `Leave Planned for | Start Date | End Date | Leave Type`, with **Apply now**.

### Apply for Leave — every field, none skipped

All six fields that had no data model now have one (migration `20260911090000_leave_request_details`):

| Field | Behaviour |
|---|---|
| **Leave Choice** | Full Day · Half Day · Hourly |
| **Which Half?** | First / Second — half a day of balance |
| **Start / End Time** | Hourly only; charged pro-rata against an 8h day (4h = 0.5) |
| **Leave Encashment Days** | Half-day steps; counted against the *same* quota as days taken |
| **Alternate Employee** | Active colleagues only, never yourself; the stand-in is notified |
| **Alternate Contact Number** | Normalised (`+91 98765-43210` → `+919876543210`), 7–15 digits |
| **Alternate Address** | Length-bounded free text |
| **Supporting Document** | Reuses the shared Document store; a document you did not upload is refused |

An **hourly** leave deliberately writes no attendance row — the person still works that day, so their
punches remain the truth for it.

### Leave Planner

A plan is a `DRAFT` leave request: it spends no balance, notifies nobody, and does not block a real
request on the same day. **Apply now** (`POST /leave/requests/:id/submit`) re-runs the *whole* of
`create()` with today's numbers, so a plan made in January cannot smuggle a request past a quota
that has since been used up. The plan is deleted only after the application exists.

## B. Attendance — rebuilt to the TeamNest shape

`apps/web/components/attendance/AttendanceHome.tsx` (new).

- Three tabs sharing one month control: **Attendance Calendar · Attendance Log · Attendance Status**.
- **Log**: `Date | In Time | Out Time | Hours Worked | Overtime Hours | Deficit Hours | Status`, with a
  month total row. Overtime and deficit are derived from the day's *expected* hours — 8h normally,
  4h on a half day, 0 on leave/holiday/weekend — matching the timesheet target rule already in
  `timesheets.service.ts`, so the two screens never disagree.
- **Status**: what was **Recorded** beside what was **Requested**, for In Time, Out Time and
  Attendance, with the regularisation's own status. Differences are highlighted.

## C. Comp-off — inside the same form

TeamNest asks for comp-off within Apply for Leave, so we do too. Selecting **Comp Off** reveals
**Comp Off Request Type** (Avail / Credit); Credit additionally asks **Comp Off Request Date**, the
PID and what was worked, and posts to the comp-off claim endpoint. A credit cannot be *planned* —
it is a claim on a day already worked.

## D. Expenses — rebuilt to the TeamNest shape

- Cards: **Expenses Request Status for \<year\>** and **Approved Expenses for \<year\>** (approved
  total, reimbursed to date, approved-not-yet-paid).
- Table: `Expense Details | Additional Details | Category | Amount | Request on | Status`.
- **Receipts now work end to end.** The upload existed server-side but no UI ever sent one, and the
  claim never returned it. `Expense.receipt` is a real relation (migration
  `20260912090000_expense_receipt_relation`), so submitter *and* approver see a working link.

## E. Daily Digest — "Coming up" redesigned

Each of the five working days is its own card with a date rail (weekday, day number, Today/Tomorrow
badge) and compact one-line entries carrying the full story: title, PID, project type, priority,
phase, client, hours, progress and every person — all linked. The stat tile no longer toggles a
second flat copy of the same rows.

---

## Defects found and fixed

1. **`/users/[id]` did not exist.** Every member-name link in the digest, reports and project pages
   was a 404. The page is now built (profile, 14-day load, open work), gated on `capacity.view` so a
   user without it is told so rather than shown an empty "no work". A repo-wide sweep now reports
   **0 dead link targets across 25 routes**.
2. **Cancelling an approved half-day leave stranded its attendance row.** The cleanup deleted only
   `ON_LEAVE`, but a half day writes `HALF_DAY` — the day stayed marked as leave that no longer existed.
3. **The leave balance card contradicted the server.** It counted approved days only, while `create()`
   refuses anything over approved **+ pending** — so it could read "12 of 12 remaining" and still
   reject the request. `balances()` now returns `pending` and deducts it, and the card shows it.
4. **Comp-off credits could be double-spent** — `compOffBalance().available` ignored pending avails.

## Deploy

Two additive migrations, applied on API boot. **No regrant.**

```
20260911090000_leave_request_details      # hourly bounds, alternate contact, encashment, supporting doc
20260912090000_expense_receipt_relation   # FK for the expense receipt (clears orphaned ids first)
```
