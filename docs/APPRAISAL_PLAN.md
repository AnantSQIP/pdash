# Appraisals — plan before building

**Status: PLAN ONLY. Nothing has been built. Agreed 16 August 2026 that a plan comes first.**

Your asks, verbatim: *rating of last 4 quarters · rating of this FY · manager name ·
add — performance sheet · parameter of rating · right to HR and Manager only.*

---

## 1. What already exists (checked, not assumed)

An appraisal module shipped in Phase 1. It is smaller than it looks.

| Table | What it holds |
|---|---|
| `AppraisalCycle` | name, periodStart/End, dueDate, status `DRAFT / ACTIVE / CLOSED` |
| `Appraisal` | one row per employee per cycle: `selfRating` (a single Int), `selfComments`, `managerRating` (Int), `managerComments`, `overallRating` (Int), and the three timestamps for self → manager → acknowledge |

The flow works: an employee rates themselves, their reviewer rates them, the employee
acknowledges. `appraisal.manage` (HR, Admin, Super Admin) runs cycles and sees everything.
There is one UI page.

### The blocker, and it is a real one

`AppraisalService` sets each appraisal's `reviewerId` from the `user_manager` table when a cycle
launches. **`user_manager` has zero rows.** Every appraisal therefore launches with
`reviewerId: null`, which means:

- the **manager-review step cannot run at all** — nobody is the reviewer
- there is no "manager name" to show, because the system does not know anyone's manager
- "manager sees only their own reports" has nothing to filter on

This is already recorded as Phase 1 debt. It has to be fixed first or the rest cannot work.

---

## 2. What your asks need that does not exist

| Your ask | Gap |
|---|---|
| **Parameter of rating** | A rating today is **one integer**. Scoring against named criteria needs parameters and per-parameter scores — new tables. |
| **Rating of last 4 quarters** | Cycles have dates but no notion of a quarter, so "the last four" is not queryable. |
| **Rating of this FY** | Nothing aggregates cycles into a financial year. (The FY helper exists for PIDs and can be reused.) |
| **Manager name** | Needs reporting lines — see the blocker. |
| **Performance sheet** | Nothing attaches a document to an appraisal. The Document/blob machinery exists and can be reused. |
| **HR + Manager only** | `appraisal.manage` exists; there is no "my reports" scope, because there are no reports. |

---

## 3. Proposed build, in order

### Slice 0 — reporting lines *(blocker, must be first)*

Build the mechanism; **you supply the data.** I cannot invent who reports to whom.

- Admin screen under People: set each person's manager. One manager per person.
- Guards: no self-management, no cycles (A→B→A), manager must be in the same org.
- Backfill script in the repo, same shape as `roster-align-2026-08.ts`, so the org chart is
  reproducible rather than hand-typed into a database.
- This also lights up the **org chart**, which has been drawing nothing for the same reason.

> **What I need from you:** the reporting lines for all 26 people — who each person's manager is.
> A list is fine. Nothing below this line can be tested without it.

### Slice 1 — rating parameters

Two new tables:

- `AppraisalParameter` — org-level, ordered, e.g. *Quality of work · Timeliness · Ownership ·
  Communication*. Editable by HR. Weight per parameter, optional.
- `AppraisalScore` — per appraisal, per parameter: `selfScore`, `managerScore`, `comment`.

The existing `selfRating` / `managerRating` / `overallRating` stay, and become **derived** from the
parameter scores (weighted average) rather than typed. Old appraisals keep the numbers they have.

**Scale needs your decision** — 1–5 is the common choice; 1–10 gives false precision. See §5.

### Slice 2 — quarters and the financial year

- Add `quarter` (`Q1`–`Q4`) and `fyLabel` (e.g. `26-27`) to `AppraisalCycle`, derived from the
  period dates in the org's timezone, reusing the existing FY helper.
- "Last 4 quarters" becomes a query, not a calculation done by eye.
- **FY rating**: derived as the average of that year's quarterly ratings, with an HR-stated
  override beside it — the same pattern as the client ledger, and for the same reason: the derived
  figure is right about the data and cannot know about a mid-year promotion or a long leave.

### Slice 3 — the performance sheet

Attach a document to an appraisal (reuse `Document` + on-disk blob storage). Visible to the
employee, their manager, and HR. Nothing new to build in storage.

### Slice 4 — access

| Role | Sees |
|---|---|
| **Super Admin / Admin** | everything |
| **HR** (`appraisal.manage`) | everything; runs cycles; edits parameters |
| **Manager** | **only their own reports** — enforced server-side through the reporting lines, not hidden in the UI |
| **Everyone** | their own appraisal only |

New permission code: `appraisal.view.reports` for the manager scope. **Needs a regrant.**

### Slice 5 — the screen

Extend the existing `/appraisals` page rather than replacing it: the person's own appraisal, the
last four quarters as a row of ratings, the FY figure, their manager's name, the parameter
breakdown, and the sheet. HR gets the cycle-running view it already has, plus parameters.

---

## 4. What I will NOT do unless you say so

- **Compute ratings from the Performance module.** You chose manager-entered, and mixing a
  computed score into a human judgement without saying which is which is how a rating stops being
  trusted.
- **Touch pay.** No salary, band or increment fields. Say if you want them; it changes who may
  read a row.
- **Notify anyone automatically** beyond what the module already does. There is still no email
  transport in this system — everything is in-app only.

---

## 5. Decisions I need before writing code

1. **Reporting lines** — the actual list. Blocking.
2. **Rating scale** — 1–5, or something else?
3. **The parameters themselves** — what is Squark actually rating people on? I can seed a sensible
   default set, but yours will be better.
4. **Does an appraisal cycle run quarterly, annually, or both?** "Last 4 quarters" implies
   quarterly; "rating of this FY" could be an annual cycle or a roll-up of the four.
5. **Who acknowledges?** The current flow ends with the employee acknowledging. Keep it?

---

*Written 16 August 2026. No code has been written against this plan.*
