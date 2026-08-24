# Squark Dashboard — Phase 1 & Phase 2 at a glance

*Short version. `PHASES.md` is the long record and the authority on which phase work belongs to.*

**Last updated:** 23 August 2026

| | Phase 1 | Phase 2 |
|---|---|---|
| **Status** | ✅ Closed 12 Aug 2026 | 🚧 Open |
| **Theme** | Build and stabilise the internal platform | Clients & patents, then the parts of the firm that are not client delivery |
| **Live at** | https://217.76.59.244.sslip.io | same instance |

---

## Phase 1 — what it covered

Twenty-two modules, all live and in daily use.

| Area | Modules |
|---|---|
| **Access & identity** | Login (cookie/JWT) · 9 roles, 4-layer RBAC · org passcode step-up · audit log |
| **Delivery** | Projects (9 types + technology domains) · PID system `SQ_26_27_nnn` with rounds and a ledger · tasks & subtasks · timesheets with backdating rules · patents & clients |
| **People operations** | Attendance (punch, WFH, regularisation) · leave & comp-off · expenses · people directory with a PII boundary · appraisals · company feed · policies |
| **Insight** | Performance charts · team capacity board · reports with CSV/PDF export · 10pm daily digest · calendars |

---

## Phase 2 — what it covered

Phase 2 ran in three parts. All of it is built; the deployment state is noted at the end.

### Part 1 — Clients & patents (agreed 12 Aug)

Typed client codes · archive vs remove as different actions · tagging patents to a project after
creation · the client ledger with derived financials · Super-Admin overrides · `formerHandles` so
a retired patent ID still resolves · a direct client picker for projects with no patents.

### Part 2 — Team spaces & the BD pipeline (agreed 13 Aug)

Work that is not client delivery had nowhere to live. Team spaces became their own destination —
own boards, own members, off the delivery spine (no PID, no client, out of both ledgers). BD got a
full pipeline: deals, stages, activity history, forecast, win/loss reporting. Internal work now
counts in timesheets, capacity and performance, with `Timesheet.teamId` keeping *client work*,
*internal work* and *awaiting a PID* as three distinct states rather than one ambiguous null.

### Part 3 — Your 12-row timeline (Aug)

| # | Module | Item | Status |
|---|---|---|---|
| 1 | Attendance | Punch-in WFH pop-up | ✅ Done — already existed |
| 2 | Project | Client & Patent IDs | ✅ Done — and now joined up |
| 3 | Project | Other teams — HR, Sales, BD | ⚠️ **Part** — Sales never modelled separately |
| 4 | HR | Holidays | ✅ Done — 2026 calendar, optional holidays |
| 5 | HR | Policies | ✅ Done — 10 seeded, with versioning |
| 6 | HR | Payroll download | ❌ **Withdrawn** at your instruction |
| 7 | Training | Whole module | ⏸️ **Deferred** at your instruction — nothing built |
| 8 | Company | Feed, recognition, policies, directory | ✅ Done — org chart added |
| 9 | People | Departments | ✅ Done — the API existed but was unreachable |
| 10 | Appraisal | All six sub-items | ✅ Done — parameters now fully editable |
| 11 | Performance | 360° project feedback | ⚠️ **Part** — see below |
| 12 | Productivity | Input; billable hours | ⚠️ **Part** — billable hours done, "Input" undefined |

### Part 4 — Latest batch (23 Aug, PR #100)

- **Self as project manager.** "May run a project" and "may mint the PID" had been folded into one
  flag, so every Manager and Senior Consultant was told to hand their own matter to an Admin. Split.
- **Feedback module.** Anyone writes about anyone; the author, HR and the subject's reporting
  manager can read it — the subject cannot, as instructed.
- **Client ledger.** A client now carries contact, country, industry, account manager and **a rate**,
  so value is *derived* (hours × rate) instead of hand-typed. The `—` in the PID column now says
  whether a PID is pending or was never requested.
- **Patent ID ↔ number mapping.** Three tiers, with project membership as the grant. Members see the
  real numbers for their own matters, in both directions, without seeing the client. Every reveal
  audited by count, never by number.
- **Ajay Sharma** now carries Senior Consultant rights (title unchanged).

---

## What is LEFT in Phase 2

Four items. **Three of them are waiting on you, not on build time.**

| Item | Blocked on | What is needed |
|---|---|---|
| **Training module** (row 7) | Your decision | Deferred at your instruction. Say the word and it becomes a scoped build — nothing exists today. |
| **Sales as a separate function** (row 3) | Your decision | Is Sales distinct from BD, or the same desk? Today there is one BD role and no Sales role at all. If they are separate, Sales needs its own pipeline view and roster entries. |
| **360° project feedback** (row 11) | Mostly unblocked | General person-to-person feedback now exists. What is *not* built is a **project-scoped 360° round** — everyone on a matter rates each other when it closes. The question that blocked it ("can the person see their own rating?") you have since answered: no. So this is now a build, not a decision. |
| **Productivity "Input"** (row 12) | Definition | Billable hours are done. Nobody has said what "Input" measures — pages produced? searches run? claims charted? One sentence from you turns this into a day's work. |

---

## Phase 1 debt still carried

Verified 23 Aug — these are Phase 1 items, not Phase 2 features, and they are still open.

| Item | Why it matters | State |
|---|---|---|
| **No 2027 holidays** | From 1 Jan 2027 every holiday counts as a working day — people get marked absent and show as available | ❌ **0 rows.** Deadline: 31 Dec 2026 |
| **No email transport** | Every notification is in-app only; someone who does not log in never learns anything | ❌ Nothing installed |
| **No offboarding function** | Every departure is a manual edit; 25 foreign keys cascade off `user`, which once destroyed 83 timesheets | ❌ No route exists |
| **`hr@squarkip.com` shared account** | Approves leave and reads personal details with no attribution in the audit log | ❌ Still active |
| **`ESCALATION_EMAIL` hardcoded** | `attendance.module.ts:84` routes regularisations to one person; if they leave it fails silently | ❌ Still hardcoded |
| **Punch location kept forever** | Includes home coordinates on WFH punches; no retention policy (DPDP) | ❌ No policy |
| ~~No reporting lines~~ | Appraisals and the org chart depend on them | ✅ **Fixed** — 25 rows |

**The 2027 holidays are the one with a date on them.** Everything else degrades quietly; that one
breaks attendance for the whole firm on a specific morning.

---

## Deployment state

Everything above is built and tested. What reaches Contabo is a separate question.

- **`regrant-roles` IS required** — team spaces and the BD pipeline added `team.view`,
  `team.manage`, `deal.view`, `deal.manage`.
- **`roster-align` IS required** — Ajay Sharma's role changed.
- **Migrations run automatically on API boot.** All recent ones are additive and
  backward-compatible, so older pods keep working during a rolling deploy.
- **Deployment order:** code → `regrant-roles` → `roster-align`.
