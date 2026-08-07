# Squark Dashboard — Change Request Batch (2026-08-06)

> ## ✅ DELIVERED — this file is a record, not a backlog
>
> All 27 items were built and shipped in the batches that followed. Verified in code on
> 2026-08-07: `MAX_HOURS_PER_DAY = 16` (D1), `PAST_MIDNIGHT` regularization (A1), IDEA phase
> removed (F3), `project.generate_pid` explicit (F4), re-initialize from the PID ledger (F5,
> tested), the complete-gate on open tasks (F6), `Project.clientDeliveryDate` (F7), Monday-start
> calendars (E1), holidays and leaves across calendar surfaces (E2/E3), project type on tiles
> (F1/F2), the Daily Digest module with everything clickable (G1–G4), and Reports with the
> spotlight, type column, PID search, per-project CSV and no activity digest (H1–H6).
>
> The last open item — **B2, the comp-off vocabulary** — was resolved on 2026-08-07: the two
> movements are **Credit** (a day earned by working a weekend/holiday) and **Debit** (a day
> availed out of that balance). "Avail" survives as the plain-English verb in the helper text.
>
> Leave this file for the audit trail. Do not treat its tables as outstanding work.

---

Captured from feedback given on 2026-08-06. 27 items across 8 areas.
Status column: **New** = build from scratch · **Extend** = partial support exists, needs change · **Fix** = existing behaviour is wrong/confusing.

---

## A. Attendance & Regularization

| #  | Change                                                                                                                                                                                                                                                                                                                                                | Status |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| A1 | **Late-night work needs a regularization request.** If a person is still working past 23:59, they must raise a regularization request declaring that they were working during that time. Treat this as a **rare, exception-path feature** — it should not be part of the normal daily flow, and the UI should not push people toward it. | New    |

---

## B. Comp-off

| #  | Change                                                                                                                                                                                                              | Status                                                                              |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| B1 | **Comp-off has two types: Avail and Credit.** Availing = spending an earned comp-off. Crediting = claiming a weekend/holiday you worked so it gets added to your balance.                                     | Extend —`CO_AVAIL` / `CO_CREDIT` modes already exist in the leave request form |
| B2 | **Credit and Debit in the dropdown menu.** The comp-off dropdown should expose Credit and Debit as the two movements.                                                                                         | Extend                                                                              |
| B3 | **Rewrite the left-hand panel copy.** The statements on the left card (Leave balance / comp-off block in Attendance → Leaves) are confusing and need to be rephrased properly — plain, unambiguous wording. | Fix                                                                                 |

> ⚠️ **Open question (B1 vs B2):** "Avail / Credit" and "Credit / Debit" are two different namings for what appear to be the same two movements. Need to confirm the final vocabulary — my read is that the ledger should show **Credit** (earned) and **Debit** (spent), while the *request* action is worded **Avail** vs **Claim**. Confirm before building.

---

## C. Leaves

| #  | Change                                                                                                                                                                                                          | Status |
| -- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| C1 | **Half-day and full-day option in leaves.** The leave request must let the requester choose half day or full day, and the half/full distinction must carry through to balances, calendars and attendance. | Extend |

---

## D. Timesheets

| #  | Change                                                                                                                                     | Status |
| -- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------ |
| D1 | **Upper cap of 16 hours on logged time.** No timesheet entry may log more than 16 hours. Enforce server-side (not just in the form). | New    |

---

## E. Calendars (cross-cutting)

| #  | Change                                                                                                                                                                                                                                                            | Status |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| E1 | **Consistent calendar tiles — Monday → Sunday everywhere**, matching the layout already used in Timesheets. Every calendar surface in the product should use the same week start and the same tile treatment.                                             | Extend |
| E2 | **Company holidays in the Team Calendar.** Holidays are currently missing from that view.                                                                                                                                                                   | New    |
| E3 | **Leaves visible in all calendars.** Tentative leaves, pending leaves and approved requests must appear across **Calendar, Attendance and Timesheets** — not just in the Leaves screen. Pending/tentative should be visually distinct from approved. | New    |
| E4 | **Colour palette is not easily differentiable.** The current calendar palette makes states hard to tell apart at a glance — replace it with clearly distinct colours.                                                                                      | Fix    |

---

## F. Projects

| #  | Change                                                                                                                                                                                                                                                                                                                                              | Status                                                                              |
| -- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| F1 | **Project type visible on the project tiles** in the Projects section.                                                                                                                                                                                                                                                                        | New                                                                                 |
| F2 | **Tile layout:** title on top, PID and project type below it — or whatever arrangement reads best while keeping all three visible.                                                                                                                                                                                                           | New                                                                                 |
| F3 | **Remove the Idea tab.**                                                                                                                                                                                                                                                                                                                      | ❓ Blocked — see open question below                                               |
| F4 | **PID must never be assigned automatically.** Even admins must explicitly click **Generate PID** for a PID to be allocated. Remove every auto-assign path so a project can exist without a PID until someone deliberately generates one.                                                                                                | Fix —`POST /projects/generate-pid` exists, but auto-attach on create also exists |
| F5 | **Re-initialize projects directly from the PID ledger** — the re-initialize action should be available from the ledger itself, not only from the project.                                                                                                                                                                                    | Extend                                                                              |
| F6 | **Mark as complete only when all tasks are closed, completed, or deleted.** A project cannot be marked complete while any task is still open/in-progress.                                                                                                                                                                                     | New                                                                                 |
| F7 | **Client delivery date at completion.** When a project is marked complete, ask for the client delivery date & time. Store it on the project and surface it everywhere project data appears: the **project detail**, the **PID record**, the **PID ledger**, the **daily digest**, and any other project-data surface. | New                                                                                 |

> ⚠️ **Open question (F3):** There is no tab named "Idea" or "Ideas" anywhere in the codebase — not in project detail (Overview, Task List, Timesheets, Board, Gantt, Capacity, Files, Issues, Activity, Discussions), Company (Feed, Recognition, Policies, Directory), Calendar, Admin, or Settings. Need the screen name or a screenshot to action this.

---

## G. Daily Digest (Admin module)

| #  | Change                                                                                                                                                                              | Status |
| -- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| G1 | **Daily digest becomes a module in the Admin section** — a proper screen, not only the scheduled 10pm summary.                                                               | Extend |
| G2 | **Everything is clickable.** Every entity in the digest (project, PID, person, task, deadline) links through to its record.                                                   | New    |
| G3 | **Project manager and full ownership details** shown in the digest.                                                                                                           | New    |
| G4 | **Upcoming deadlines within the next 5 working days** — which deadlines are landing, with the project details, progress, and the other project information in proper detail. | New    |

> ⚠️ **Open question (G4):** "5 working days" — I'll assume this excludes weekends and company holidays unless told otherwise.

---

## H. Reports

| #  | Change                                                                                                                                                                      | Status |
| -- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------ |
| H1 | **Highlight the expanded project.** When a project is expanded in Reports it should be visually highlighted/spotlighted, so it's obvious which one you're looking at. | New    |
| H2 | **Project type shown** in Reports.                                                                                                                                    | New    |
| H3 | **Per-project report** — the ability to pull the report for one particular project.                                                                                  | New    |
| H4 | **Search by PID or project name.**                                                                                                                                    | New    |
| H5 | **Export data per project.**                                                                                                                                          | Extend |
| H6 | **Remove the Activity digest from the Reports module.** (`apps/web/app/reports/page.tsx`, the range-selectable activity digest block.)                              | Fix    |

---

## Open questions — ALL RESOLVED

_Answered by building. Kept for the record._

1. **F3 — "Idea tab":** which screen is it on? No such tab exists in the code.
2. **B1/B2 — comp-off vocabulary:** Avail/Credit vs Credit/Debit — which words go on the dropdown, and which on the ledger?
3. **F7 — client delivery date:** date only, or date **and** time? (Feedback said "date and time", so assuming both.)
4. **A1 — "working after 11:59":** does this mean a punch-out after midnight (work crossing into the next day), or simply any work logged after 23:59? Affects whether the record splits across two dates.
5. **G4 — "5 working days":** confirm weekends + company holidays are excluded.

---

## Suggested build order

| Phase                      | Items              | Why                                                                                                                         |
| -------------------------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------- |
| 1 — Validation & rules    | D1, F4, F6, C1     | Small, server-side, low blast radius; F4/F6 change project lifecycle so they should land before the UI work builds on them. |
| 2 — Calendar consistency  | E1, E2, E3, E4     | One coherent pass over every calendar surface — cheaper together than piecemeal.                                           |
| 3 — Attendance & comp-off | A1, B1, B2, B3     | Shares the Attendance page; B3 copy rewrite lands with the B1/B2 model change.                                              |
| 4 — Projects & PID        | F1, F2, F5, F7, F3 | Tile redesign + PID ledger + client delivery date; F7 fans out to digest/ledger, so it precedes phase 5.                    |
| 5 — Digest & Reports      | G1–G4, H1–H6     | Consumes the project/PID data shaped in phase 4.                                                                            |

Likely additive migrations: `Project.clientDeliveryDate` (F7), comp-off movement type (B1/B2), late-work regularization flag (A1). No permission changes anticipated — so **no regrant** unless F5 needs a new ledger action.
