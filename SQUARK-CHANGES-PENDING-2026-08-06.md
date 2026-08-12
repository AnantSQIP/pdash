# Squark Dashboard — Pending Changes (2026-08-06)

Feedback batch captured 2026-08-06. 27 items. Not yet built — this is the scope list.
Detailed spec, open questions and suggested build order: `FEEDBACK_BATCH_2026-08-06.md`.

## Timesheets

1. Logged hours capped at 16 per entry — enforced server-side, not just in the form.

## Attendance

2. Work past 23:59 requires a regularization request declaring the late-night hours — a rare exception path, not part of the normal daily flow.

## Comp-off

3. Two comp-off types — Avail (spend a credit you have earned) and Credit (claim a weekend/holiday you worked).
4. Credit and Debit shown as the two movements in the dropdown menu.
5. Left-hand balance panel rewritten — the current statements are confusing and need plain, unambiguous wording.

## Leaves

6. Half-day / Full-day option on the leave request, carried through to balances, calendars and attendance.

## Projects

7. Project type visible on the project tiles.
8. Tile layout — title on top, PID and project type below it.
9. Idea tab removed.
10. PID never assigned automatically — even admins must click "Generate PID"; a project can exist without a PID until someone deliberately generates one.
11. Projects re-initialized directly from the PID Ledger, not only from the project itself.
12. "Mark as complete" available only when every task is closed, completed or deleted.
13. Client delivery date & time captured when a project is marked complete, then shown everywhere project data appears — project detail, PID record, PID Ledger and daily digest.

## Calendar

14. Calendar tiles consistent Monday → Sunday everywhere, matching the layout already used in Timesheets.
15. Company holidays shown in the Team Calendar.
16. Leaves shown across Calendar, Attendance and Timesheets — tentative, pending and approved, with pending visually distinct from approved.

## Daily digest

17. Daily digest promoted to a module in the Admin section — a proper screen, not only the scheduled send.
18. Everything in the digest is clickable — project, PID, person, task and deadline each link through to their record.
19. Project manager and full ownership details shown for every project in the digest.
20. Deadlines landing within the next 5 working days, each with the project details, progress and the rest of the project information in full.

## Reports

21. Expanded project is highlighted and spotlighted, so it is obvious which one is open.
22. Project type shown in Reports.
23. Report for one particular project.
24. Search by PID or project name.
25. Export data per project.
26. Activity digest removed from the Reports module.

## Colours

27. Calendar palette replaced — the current colours are not easily differentiable at a glance.

---

**Blocked before build:** item 9 — no tab named "Idea" exists anywhere in the product; needs a screen name or screenshot. Items 3–4 — "Avail / Credit" and "Credit / Debit" are two vocabularies for the same pair; final wording needs confirming.
