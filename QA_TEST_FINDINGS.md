# pdash — QA Test Findings (multi-agent sweep, 2026-07-20)

**Method:** 5 role-persona tester agents per module (Super Admin · Manager · HR · Employee · Adversary), testing every feature via the live API, from the perspective of educated Indian professional users at an IP firm (SquarkIP: patent novelty search, FTO, infringement analysis, prosecution). Each agent covers happy paths, RBAC boundaries, input validation, business-logic edge cases, A/B on similar flows, and domain realism.

**Legend — severity:** 🔴 critical · 🟠 high · 🟡 medium · 🔵 low · ⚪ info
**Confidence:** `reproduced` (seen via API) · `code-evident` (clear in source) · `suspected`

**Accounts used (local demo, pw `sqip@1234`):** Super Admin `mohit@` · Manager `anant.gupta@` · HR `hr@` · Employee `ajay.sharma@` · Senior Consultant `amritpal.kaur@` · Consultant `meetu.singh@`.

**Batch plan (module by module):**
- **Batch 1 — Time & Attendance:** attendance/regularization · leaves · comp-off · WFH · timesheets · expenses
- **Batch 2 — Delivery:** projects · tasks · capacity · performance · issues · calendar/meetings
- **Batch 3 — People & Access:** auth · users/people · admin/RBAC · profile/PII · search · notifications
- **Batch 4 — Collaboration & Company:** discuss · company (directory/rewards/announcements/policies/appraisals) · reports/analytics

> Findings are appended per batch as each completes, so an interrupted run never loses data.

---

<!-- FINDINGS-START -->

## Batch 1 — Time & Attendance  ✅ complete (30/30 agents · attendance · leaves · comp-off · WFH · timesheets · expenses)

**189 unique findings** (from 191 raw across 30 role-persona runs) — 🟠 9 high · 🟡 62 medium · 🔵 102 low · ⚪ 18 info


### attendance  (37 unique — 🟠2 🟡9 🔵21 ⚪5)

1. 🟠 **Regularization approval accepts check-in/check-out on unrelated dates, writing corrupt totalHours (441h) onto a single day**  
   `data-integrity` · POST /attendance/me/regularize + /regularizations/:id/approve · _reproduced_ · found by: hr  
   **Expected:** check-in/check-out must fall on the regularized date (or a bounded overnight window), and totalHours should be a sane single-day value; a ~441h day should be rejected.  
   **Actual:** requestRegularization validates only checkOut>checkIn; on approval totalHours = (checkOut-checkIn)/3.6e6 = 441h is written to one day, inflating month-summary and org-summary hoursLogged.  
   **Repro:** As any user: `POST /attendance/me/regularize -d '{"date":"2026-07-05","reason":"x","status":"PRESENT","checkIn":"2026-07-01T09:00","checkOut":"2026-07-19T18:00"}'` -> created (only checkOut>checkIn is validated). Approve it (approver != requester). Attendance row for 2026-07-05 becomes checkIn=2026-07-01 09:00, checkOut=2026-07-19 18:00, totalHours=441, status PRESENT.

2. 🟠 **Designated hr@squarkip.com account is role-stacked (HR+Manager+Senior Consultant) and can reach delivery surfaces HR must not**  
   `rbac` · roles / POST /projects, POST /tasks · _reproduced_ · found by: hr  
   **Expected:** The HR persona (people-ops) should be denied delivery-surface writes; per permissions-catalog HR 'deliberately does NOT include the delivery surfaces (projects/tasks/milestones/issues)'.  
   **Actual:** hr@squarkip.com passes the permission check and can create/update projects, create/delete/assign tasks, manage tasklists, create/update issues and timesheets — full delivery control the HR role is designed to exclude. The role guard itself works (pure HR is correctly 403'd); the account is over-granted.  
   **Repro:** DB: hr@squarkip.com has 3 roles (HR,Manager,Senior Consultant) and holds project.create/approve/update, task.create/delete/assign, tasklist.*, issue.*, timesheet.*. Live: `curl -b hr.txt -X POST localhost:4000/api/v1/projects -d '{}'` -> 400 (validation, permission PASSED); same for POST /tasks -> 400. Compare pure HR shavetasharma@squarkip.com: POST /projects -> 403 'Missing permission: project.create', POST /tasks -> 403 'Missing permission: task.create'.

3. 🟡 **Privileged row-level regularize does not validate reason or newStatus (inconsistent with the employee request path)**  
   `ab-inconsistency` · POST /attendance/:id/regularize · _reproduced_ · found by: superadmin  
   **Expected:** Same guards as the employee-facing POST /attendance/me/regularize, which enforces a non-empty reason and a PRESENT/HALF_DAY allow-list. The admin override should also require a reason and a valid status.  
   **Actual:** AttendanceService.regularize (attendance.module.ts:142-149) writes reason and newStatus with no checks, while requestRegularization (attendance.module.ts:162-165) rejects empty reason and non-allowed status. An admin can stamp any arbitrary status onto any attendance row and flag it 'regularized' with a blank reason, defeating the audit trail.  
   **Repro:** curl -b cookie -H 'Content-Type: application/json' -X POST http://localhost:4000/api/v1/attendance/<attId>/regularize -d '{"reason":"","newStatus":"ALSO_BOGUS_STATUS"}'  -> 200; row set to status "ALSO_BOGUS_STATUS", isRegularized:true, regularizeReason:"". Also {"newStatus":"PRESENT"} with no reason at all -> 200.

4. 🟡 **Admin manual mark accepts arbitrary/empty attendance status with no validation, silently corrupting reports**  
   `data-integrity` · POST /attendance/mark · _reproduced_ · found by: superadmin  
   **Expected:** Reject status values outside the recognised set (PRESENT/ABSENT/HALF_DAY/ON_LEAVE/HOLIDAY) with a 400; an empty status must never be stored.  
   **Actual:** AttendanceService.mark (attendance.module.ts:132-140) upserts data.status verbatim with zero validation. Invalid/empty statuses are not counted by getMonth/orgSummary (attendance.module.ts:468-476, 515-534), so an admin can silently create days that vanish from present/absent/leave tallies and attendance-rate math.  
   **Repro:** curl -b cookie -H 'Content-Type: application/json' -X POST http://localhost:4000/api/v1/attendance/mark -d '{"userId":"<self>","date":"2023-03-15","status":"QATEST_BOGUS_STATUS","note":"x"}'  -> 200, row persisted with status "QATEST_BOGUS_STATUS"; also status:"" (empty string) persisted with 200.

5. 🟡 **POST /attendance/mark accepts arbitrary/invalid status strings (no enum validation)**  
   `validation` · POST /attendance/mark · _reproduced_ · found by: hr  
   **Expected:** status should be validated against the allowed set (PRESENT/ABSENT/HALF_DAY/ON_LEAVE/HOLIDAY); an unknown status should be rejected 400.  
   **Actual:** Any string is stored as-is. Downstream logic (WORKING array, statusForHours, summary counts, attendanceRate) keys off specific status values, so junk statuses silently fall through as neither present nor absent, corrupting attendance rate/hours.  
   **Repro:** `curl -b hr.txt -X POST localhost:4000/api/v1/attendance/mark -d '{"userId":"<id>","date":"2026-07-13","status":"QATEST-BOGUS","note":"x"}'` -> 201, row saved with status 'QATEST-BOGUS'.

6. 🟡 **POST /attendance/mark has no self-action guard and accepts future dates — attendance-manager can fabricate attendance**  
   `rbac` · POST /attendance/mark · _reproduced_ · found by: hr  
   **Expected:** Every other flow blocks self-action (regularize/leave/WFH/comp-off approve all throw 'You cannot review your own...'); mark should likewise bar self-marking or at least block future dates and refuse to silently overwrite ON_LEAVE/HOLIDAY (punch() has the M1 guard, mark() does not).  
   **Actual:** mark() has no self-check, no future-date check, and no ON_LEAVE/HOLIDAY overwrite guard. An HR/attendance-manager can fabricate present days for themselves or anyone, on any date, bypassing the punch + reviewed-regularization controls (segregation-of-duties gap). It also preserves checkIn/checkOut while flipping status, producing inconsistent rows (e.g. ABSENT with a real checkIn).  
   **Repro:** `POST /attendance/mark -d '{"userId":"<HR-own-id>","date":"2026-12-25","status":"PRESENT"}'` -> 201 (marked self PRESENT on a future date). Also marking over an approved-leave/holiday day writes a status row with no guard.

7. 🟡 **Regularization request check-in/out times are not constrained to the day being regularized**  
   `validation` · POST /attendance/me/regularize · _reproduced_ · found by: superadmin  
   **Expected:** Reject check-in/out that do not fall on the regularized date (and are not in the future); only checkOut>checkIn is currently checked.  
   **Actual:** requestRegularization (attendance.module.ts:168-170) validates only ordering; approveRegularization (attendance.module.ts:226-246) writes requestedCheckIn/Out and derived totalHours straight onto the day's row, so an approved request can put a July day's punch times on Jan 1 or in 2099. A second reviewer is required to approve, which limits impact.  
   **Repro:** curl -b cookie -H 'Content-Type: application/json' -X POST http://localhost:4000/api/v1/attendance/me/regularize -d '{"date":"2026-07-09","reason":"x","checkIn":"2026-01-01T09:00","checkOut":"2026-01-01T18:00"}'  -> 200 (times 6 months off the date). Also date 2026-07-08 with checkIn/out in year 2099 -> 200.

8. 🟡 **Regularization accepts check-in/check-out on arbitrary dates with no hours cap; on approval a single day gets absurd totalHours**  
   `data-integrity` · POST /attendance/me/regularize · _reproduced_ · found by: adversary  
   **Expected:** checkIn/checkOut must lie within the claimed date (or a sane single-shift window); totalHours capped (e.g. <=24h). Reject a ~1000h span.  
   **Actual:** Nonsensical multi-week spans accepted and persisted; approval would write ~1065h to one day, inflating hoursLogged in getMonth/orgSummary summaries.  
   **Repro:** Logged in as khushi.gupta. curl -b cookie -X POST .../attendance/me/regularize -d '{"date":"2026-07-15","reason":"x","checkIn":"2026-06-01T09:00","checkOut":"2026-07-15T18:00"}' -> 201, stored verbatim (requestedCheckIn 2026-06-01, requestedCheckOut 2026-07-15, ~44 days apart). requestRegularization only validates checkOut>checkIn (attendance.module.ts:170); it does NOT require checkIn/checkOut to fall on the claimed `date` and sets no max duration. On approval totalHours=(checkOut-checkIn)/3600000 (attendance.module.ts:228) => ~1065h written to one day.

9. 🟡 **Missing required date field crashes with HTTP 500 instead of a clean 400 (systemic across attendance/leave write endpoints)**  
   `validation` · POST /attendance/me/regularize (also POST /attendance/wfh, POST /leave/compoff, POST /leave/requests) · _reproduced_ · found by: employee  
   **Expected:** 400 Bad Request naming the missing field (as done for missing reason / malformed date)  
   **Actual:** 500 Internal server error — parseDay(data.<field>.slice(0,10)) throws TypeError on undefined before any validation (attendance.module.ts:166, 300, 793, and 588). No DTO/field validation guards these required date fields.  
   **Repro:** Authenticated as employee. curl -b cookie -X POST http://localhost:4000/api/v1/attendance/me/regularize -H 'Content-Type: application/json' -d '{"reason":"x"}' (no date) -> HTTP 500 {"statusCode":500,"message":"Internal server error."}. Same: /attendance/wfh with {reason,endDate} (no startDate) or {reason,startDate} (no endDate) -> 500; /leave/compoff with {reason,projectRef} (no workDate) -> 500; /leave/requests with {leaveType,endDate,reason} (no startDate) -> 500. Note malformed date strings (e.g. "not-a-date") DO return 400, only a MISSING field 500s.

10. 🟡 **Leave-request creation notifies no approver, while WFH / comp-off / regularization all push a notification to their reviewers**  
   `ab-inconsistency` · POST /leave/requests · _reproduced_ · found by: manager  
   **Expected:** A new leave request should notify its approvers (leave.approve holders / the manager or HR), consistent with the other request types, so an approver is alerted rather than having to poll /leave/requests/org?status=PENDING.  
   **Actual:** Leave requests are created silently; no approver receives any notification. A delivery-lead manager who relies on notifications (and does get pinged for comp-off, which shares the exact same leave.approve gate) will simply miss pending leave.  
   **Repro:** As manager, POST /leave/requests {"leaveType":"CL","startDate":"2026-08-25","endDate":"2026-08-25","reason":"x"} creates a PENDING row (200). Query the notification table immediately after: no 'leave.*' notification of any kind is written to any leave.approve holder. Contrast: POST /attendance/wfh writes 'wfh.requested' to attendance.manage holders, POST /leave/compoff writes 'compoff.requested' to HR+Managers+Yash, POST /attendance/me/regularize writes 'attendance.regularization_requested' to HR+Yash — all verified in the same session. Code: LeaveService.create (attendance.module.ts:587-615) has NO this.notifications.notify() call, unlike requestWfh (line 326), requestCompOff (line 808), requestRegularization (line 193).

11. 🟡 **POST /leave/requests accepts an arbitrary leaveType not in the org's leave types (quota bypass)**  
   `data-integrity` · POST /leave/requests · _reproduced_ · found by: hr  
   **Expected:** leaveType must be one of the org's configured LeaveType codes (CL/EL/SL/CO); unknown types rejected 400.  
   **Actual:** LeaveService.create only special-cases 'CO' and otherwise stores any string. On approval it writes ON_LEAVE attendance + a calendar event, yet balances() only knows configured types, so an invented leaveType consumes attendance while never debiting any quota — a way to take leave that no balance tracks.  
   **Repro:** `curl -b hr.txt -X POST localhost:4000/api/v1/leave/requests -d '{"leaveType":"QATEST-XYZ","startDate":"2026-08-20","endDate":"2026-08-20","reason":"x"}'` -> 201 with leaveType 'QATEST-XYZ', numDays 1, status PENDING. (A stale 'QATEST-FAKE' leave from a prior run is already visible in GET /leave/requests/org, corroborating.)

12. 🔵 **GET /attendance/me/month (and users/:userId/month) crashes with 500 for out-of-range year values**  
   `validation` · GET /attendance/me/month · _reproduced_ · found by: manager  
   **Expected:** Out-of-range/implausible year should return 400; year should be bounded like month.  
   **Actual:** Negative years and years >=10000 raise an unhandled 500; small years get a surprising 1900-based remap.  
   **Repro:** GET /attendance/me/month?year=-1&month=7 -> 500; ?year=-5&month=7 -> 500; ?year=10000&month=7 -> 500; ?year=275760 -> 500 (?year=999999 -> 400 caught by global int guard). The controller validates month is an integer 1-12 but never bounds year (attendance.module.ts:929-933), and getMonth builds Date.UTC(year,...) which produces dates Prisma/toISOString reject. Note also years 0-99 are silently remapped to 1900-1999 (year=0 returns days dated 1900-07-01).

13. 🔵 **HALF_DAY is counted as a full present day in attendance rate and hours summary**  
   `logic` · GET /attendance/me/month and GET /attendance/org/summary · _code-evident_ · found by: manager  
   **Expected:** A half day should count as ~0.5 of a working day (or be surfaced distinctly) so the rate a manager reviews reflects actual presence.  
   **Actual:** HALF_DAY is treated identically to a full PRESENT day, inflating the attendance rate a delivery lead uses for oversight.  
   **Repro:** In getMonth the numerator is present = count('PRESENT') + count('HALF_DAY') and the denominator excludes only leave, so a HALF_DAY contributes 1 to both (attendance.module.ts:469,476). orgSummary does the same (line 516: PRESENT and HALF_DAY both do present++). Verified HALF_DAY is real: an immediate punch-in/out set the day to status HALF_DAY (totalHours 0). A person working only half-days therefore shows attendanceRate 100%.

14. 🔵 **Half-day is counted as a full present day in attendanceRate**  
   `domain` · GET /attendance/me/month, GET /attendance/org/summary · _code-evident_ · found by: hr  
   **Expected:** A HALF_DAY should count as ~0.5 of a working day so someone working only half-days does not show 100% attendance.  
   **Actual:** HALF_DAY is weighted identically to a full PRESENT day, overstating attendance rate for partial-day workers.  
   **Repro:** getMonth: present = count('PRESENT') + count('HALF_DAY'); expectedDays = present + absent; attendanceRate = present/expectedDays. A HALF_DAY day contributes 1 to both numerator and denominator -> 100% for that day. orgSummary mirrors this.

15. 🔵 **Org summary with from > to returns all-zero rows instead of a validation error**  
   `validation` · GET /attendance/org/summary · _reproduced_ · found by: superadmin  
   **Expected:** Reject a reversed range (or normalise it) rather than silently emitting a zero-filled summary that reads as 'nobody attended'.  
   **Actual:** orgSummary (attendance.module.ts:506-507) builds the day list with a for-loop from fromD to toD; when fromD>toD the loop body never runs, so all counts are 0 and no error is raised.  
   **Repro:** curl -b cookie 'http://localhost:4000/api/v1/attendance/org/summary?organizationId=<org>&from=2026-07-20&to=2026-07-01'  -> 200 with every user present/absent/onLeave/holiday = 0.

16. 🔵 **A user on approved leave for an entire window shows attendanceRate 0% instead of N/A**  
   `ux` · GET /attendance/org/summary · _code-evident_ · found by: manager  
   **Expected:** With no expected working days (all approved leave/holiday/weekend), the rate should read N/A or 100%, not 0%.  
   **Actual:** The row shows 0% attendance, which a manager can easily misread as the person never showing up, when they were legitimately on approved leave.  
   **Repro:** orgSummary computes expectedDays = present + absent; approved-leave days increment onLeave (not absent), so a person on leave for the whole range has present=0, absent=0, expectedDays=0, and attendanceRate falls back to 0 (attendance.module.ts:530-534). getMonth has the same 0-denominator -> 0% fallback (line 476).

17. 🔵 **GET /attendance/org/summary with from > to silently returns all-zero rows instead of a validation error**  
   `validation` · GET /attendance/org/summary · _reproduced_ · found by: manager  
   **Expected:** A reversed range should return 400, or be normalized, rather than emitting a plausible-looking but empty zero report.  
   **Actual:** The endpoint returns a 200 zero-attendance summary that looks like real data (everyone at 0%).  
   **Repro:** GET /attendance/org/summary?organizationId=<org>&from=2026-07-10&to=2026-07-01 -> 200 with every user present=0/absent=0/rate=0 (the day loop `for (d=from; d<=to; ...)` never iterates, attendance.module.ts:507). No 'from must be before to' check exists (contrast leave/WFH create which reject end<start).

18. 🔵 **org-scoped attendance/leave endpoints trust a client-supplied organizationId/userId with no check it matches the caller's org**  
   `rbac` · GET /attendance/org/summary · _code-evident_ · found by: manager  
   **Expected:** The org should be derived from the authenticated actor (as pendingRegularizations/pendingWfhRequests already do via orgOf(reviewerId)), or validated to equal the caller's org, so attendance.view.organization can't be pointed at another tenant.  
   **Actual:** Horizontal scoping relies entirely on the single-org assumption; a manager can name any organizationId/userId and the handler will query it. Defense-in-depth gap, latent until a second org exists.  
   **Repro:** GET /attendance/org/summary?organizationId=NOPE&... returns 200 {rows:[]} — the id is taken straight from the query and never checked against the actor's own organization (attendance.module.ts:1048-1053). Same pattern in GET /attendance/users/:userId/month (getMonth(userId) with no org-membership check, line 1040-1046) and GET /leave/requests/org (line 1072-1077). Only NOT exploitable today because the deployment is single-org (verified: 1 row in organization).

19. 🔵 **Org-scoped read endpoints trust a client-supplied organizationId / path userId instead of the session org (latent horizontal-auth gap)**  
   `rbac` · GET /attendance/org/summary, GET /attendance/users/:userId/month · _code-evident_ · found by: hr, superadmin  
   **Expected:** Resolve the organization from the authenticated actor (or verify the requested org/user belongs to the actor's org) so an attendance.view.organization holder cannot target another org's data.  
   **Actual:** orgSummary/userMonth take organizationId/userId from the query/path (attendance.module.ts:1040-1053) with only the attendance.view.organization permission gate; org membership is never enforced. Not reproducible as a data leak in this single-org deployment (a foreign org id just returns empty), but it is a latent IDOR if multi-org is ever enabled.  
   **Repro:** curl -b cookie 'http://localhost:4000/api/v1/attendance/org/summary?organizationId=FAKE_ORG_ID&from=2026-07-01&to=2026-07-20'  -> 200 {rows:[]} (no error, org id never checked against the actor). users/:userId/month resolves the org from the path user with no same-org assertion.

20. 🔵 **GET /projects and /projects/:id are ungated — pure HR (no project.view) can read the full delivery project list/details**  
   `rbac` · GET /projects · _reproduced_ · found by: hr  
   **Expected:** If HR is meant to be walled off from delivery surfaces, the project list/detail reads should require project.view (which HR lacks).  
   **Actual:** The list/detail GETs have no permission gate, so any authenticated user (including people-ops HR) can browse all projects — a delivery-surface read the HR boundary intends to exclude. Affects all roles, observed via the HR boundary.  
   **Repro:** As pure HR shavetasharma (holds no project.view — DB count 0): `curl -b shaveta.txt localhost:4000/api/v1/projects` -> 200 with the full project list. projects.controller.ts @Get() and @Get(':id') have no @RequirePermission.

21. 🔵 **Regularization request accepts check-in/out unbound to the request date and not reconciled with requested status (bogus multi-day totalHours on approval)**  
   `data-integrity` · POST /attendance/me/regularize · _reproduced_ · found by: employee  
   **Expected:** Reject/normalize timestamps that don't fall on `date`; reconcile requestedStatus with worked hours (>=4h PRESENT else HALF_DAY, mirroring punch()/statusForHours)  
   **Actual:** On approval, approveRegularization computes totalHours = (checkOut-checkIn)/3.6e6 verbatim (attendance.module.ts:228) — here ~96h written to a single day (2026-07-09) — and stores requestedStatus (PRESENT) regardless of hours (line 233,237-239). Inflates the month summary hoursLogged. Submission reproduced (201); the approval-time write is code-evident.  
   **Repro:** curl -b cookie -X POST .../attendance/me/regularize -d '{"date":"2026-07-09","reason":"x","status":"PRESENT","checkIn":"2026-07-01T09:00","checkOut":"2026-07-05T09:00"}' -> HTTP 201 PENDING (accepted). The only cross-check is checkOut<=checkIn; there is no check that checkIn/checkOut fall on `date`, are not in the future, or that the hours match requestedStatus.

22. 🔵 **Regularization can mark weekends/holidays as PRESENT and has no lower bound on how old a date can be**  
   `logic` · POST /attendance/me/regularize · _reproduced_ · found by: adversary  
   **Expected:** Reject regularizing a weekend/holiday to a working status (or require a comp-off flow), and bound how far back a regularization may target.  
   **Actual:** Employee can raise (and HR could approve) PRESENT attendance on weekends/holidays or on dates years in the past, inflating working-day and attendance-rate counts.  
   **Repro:** curl -X POST .../attendance/me/regularize -d '{"date":"2026-07-19","reason":"x","status":"PRESENT"}' (Sunday) -> 201 PENDING. curl ... -d '{"date":"2020-01-06","reason":"x"}' -> 201 PENDING. requestRegularization checks only future-date (attendance.module.ts:167) — no weekend/holiday check and no minimum date.

23. 🔵 **Regularization requestType is a free-form string (no enum); requestType=WFH records workMode WFH on approval, bypassing the dedicated WFH approval routing**  
   `ab-inconsistency` · POST /attendance/me/regularize · _code-evident_ · found by: adversary  
   **Expected:** Validate requestType against a known set; a WFH-recorded day should go through the WFH flow, not an arbitrary regularization field.  
   **Actual:** Any string is accepted as requestType; 'WFH' silently flips workMode on a different approval path, an inconsistent A/B route to the same effect.  
   **Repro:** curl -X POST .../attendance/me/regularize -d '{"date":"2026-07-17","reason":"x","requestType":"WFH"}' -> 201, requestType 'WFH' stored. On approval workMode is set to WFH (attendance.module.ts:236). requestType is never validated against an enum (:183). WFH normally requires its own request approved by attendance.manage holders; here a WFH-recorded day is produced via the attendance.regularize approver set (HR + Yash).

24. 🔵 **Missing required date field returns HTTP 500 instead of a clean 400 across every attendance/leave create endpoint**  
   `validation` · POST /attendance/me/regularize (and /attendance/wfh, /leave/requests, /leave/compoff, /leave/holidays) · _reproduced_ · found by: manager  
   **Expected:** A missing required date should be rejected with 400 Bad Request and a field-specific message.  
   **Actual:** Unhandled TypeError surfaces as a generic 500. No DTO-level validation guards the date fields.  
   **Repro:** POST /attendance/me/regularize {"reason":"x"} (no date) -> 500 Internal server error. Same for POST /attendance/wfh {"endDate":"2026-07-25","reason":"x"} -> 500; POST /leave/compoff {"reason":"x","projectRef":"P"} -> 500; POST /leave/requests {"leaveType":"CL","endDate":"2026-07-25"} -> 500; POST /leave/holidays {"organizationId":"...","name":"x"} -> 500. Root cause: handlers call parseDay(data.date.slice(0,10)) / dto.date.slice(...) with no presence check, so slice() on undefined throws (e.g. attendance.module.ts:166, 300-301, 793, 588-589, 909).

25. 🔵 **Regularization request/approve lacks the ON_LEAVE/HOLIDAY guard that punch() enforces — can silently overwrite an approved-leave/holiday day**  
   `ab-inconsistency` · POST /attendance/me/regularize + POST /attendance/regularizations/:id/approve · _code-evident_ · found by: employee  
   **Expected:** Consistent with punch(): block (or explicitly handle) regularizing a day that is an approved-leave or holiday; if a leave day is converted to PRESENT, reverse the corresponding leave_request/balance  
   **Actual:** requestRegularization (line 158-200) has no leave/holiday guard; approveRegularization upserts status=PRESENT over the day (line 241-246) with no guard and no leave-reversal — the ON_LEAVE/HOLIDAY day is silently overwritten while the leave request stays APPROVED and balance stays debited. Submission reproduced; overwrite/no-reversal is code-evident (employee cannot run the approve step).  
   **Repro:** curl -b cookie -X POST .../attendance/me/regularize -d '{"date":"2026-07-01","reason":"x","status":"PRESENT","checkIn":"2026-07-01T09:00","checkOut":"2026-07-01T18:00"}' where 2026-07-01 is the org holiday 'Firm Foundation Day' -> HTTP 201 accepted. By contrast punch() rejects touching a holiday/leave day with 'Today is marked a holiday...' (attendance.module.ts:93-96).

26. 🔵 **Missing required 'date' field returns unhandled HTTP 500 on several attendance/leave write endpoints**  
   `validation` · POST /attendance/me/regularize, POST /attendance/mark, POST /leave/holidays · _reproduced_ · found by: superadmin  
   **Expected:** 400 Bad Request identifying the missing 'date' field.  
   **Actual:** Handlers call data.date.slice(0,10) / dto.date.slice(0,10) (attendance.module.ts:133, 166, 909) before any null check, so an undefined date throws a TypeError surfaced as a raw 500. (A malformed-but-present date like 'banana' is handled as 400, so only the missing case leaks a 500.)  
   **Repro:** curl -b cookie -H 'Content-Type: application/json' -X POST http://localhost:4000/api/v1/attendance/me/regularize -d '{"reason":"x"}'  -> 500 Internal server error. Same for POST /attendance/mark with no date, and POST /leave/holidays with no date.

27. 🔵 **Missing/negative required date fields return 500 Internal Server Error instead of 400 across attendance & leave endpoints**  
   `validation` · POST /attendance/me/regularize, POST /attendance/wfh, POST /leave/requests, GET /attendance/me/month · _reproduced_ · found by: adversary  
   **Expected:** 400 Bad Request with a field-level message.  
   **Actual:** Unhandled exception -> 500 {"message":"Internal server error."}.  
   **Repro:** POST /attendance/me/regularize -d '{"reason":"x"}' (no date) -> 500. POST /attendance/wfh -d '{"reason":"x"}' (no dates) -> 500. POST /leave/requests -d '{"leaveType":"CL","reason":"x"}' (no dates) -> 500. GET /attendance/me/month?year=-5&month=7 -> 500. Root cause: unguarded data.date.slice()/startDate.slice() on undefined (attendance.module.ts:166,300,588) and unvalidated Date math for negative year (getMonth, ~:428).

28. 🔵 **WFH↔Leave overlap guard is one-directional (leave create does not check WFH; WFH ignores pending leave)**  
   `ab-inconsistency` · POST /attendance/wfh vs POST /leave/requests · _reproduced_ · found by: adversary  
   **Expected:** Symmetric reconciliation — a day cannot be both leave and WFH; guard both create paths (and consider pending, not just approved).  
   **Actual:** An employee can hold simultaneous leave and WFH requests for the same day; only WFH-vs-approved-leave is guarded, leave-vs-WFH is not.  
   **Repro:** Created pending leave for 2026-07-28, then curl -X POST .../attendance/wfh -d '{"startDate":"2026-07-28","endDate":"2026-07-28","reason":"x"}' -> 201 (both coexist). Separately, created pending WFH for 2026-07-27, then leave for 2026-07-27 -> 201. WFH create only blocks APPROVED leave (attendance.module.ts:313); leave create performs no WFH check at all (attendance.module.ts:596-599).

29. 🔵 **Comp-off claim accepts negative hoursWorked and an unbounded past workDate, with no server-side proof of work**  
   `validation` · POST /leave/compoff · _reproduced_ · found by: adversary  
   **Expected:** Reject negative/absurd hoursWorked; bound workDate to a recent window; ideally require a timesheet/punch on that day.  
   **Actual:** Employee can claim comp-off credit for any weekend/holiday in the distant past that they never worked, with negative hours; each approved claim becomes a spendable CO leave day.  
   **Repro:** curl -X POST .../leave/compoff -d '{"workDate":"2026-07-18","reason":"x","projectRef":"P","hoursWorked":-99}' -> 201 (hoursWorked -99 stored). curl ... -d '{"workDate":"2020-01-04","reason":"x","projectRef":"P"}' (Sat 6y ago) -> 201. requestCompOff only checks non-working-day + not-future + duplicate (attendance.module.ts:790-800); hoursWorked unvalidated (:802), no minimum workDate.

30. 🔵 **POST /leave/holidays returns 500 (not 400) when 'date' is missing**  
   `validation` · POST /leave/holidays · _reproduced_ · found by: hr  
   **Expected:** Missing required field should be a clean 400 with a helpful message.  
   **Actual:** createHoliday does `dto.date.slice(0,10)` on undefined -> TypeError -> 500. Asymmetric handling vs missing name (400).  
   **Repro:** `curl -b hr.txt -X POST localhost:4000/api/v1/leave/holidays -d '{"organizationId":"<org>","name":"QATEST"}'` -> 500 Internal server error. By contrast missing 'name' (date present) -> 400 'Invalid request data.'

31. 🔵 **Leave quota is enforced for comp-off (CO) at request time but NOT for normal leave types (CL/SL/EL)**  
   `ab-inconsistency` · POST /leave/requests · _reproduced_ · found by: adversary  
   **Expected:** Consistent handling — either enforce all quotas at request time, or defer all to the approver. Not one hard-blocked and the rest silently over-drawable.  
   **Actual:** CO is hard-blocked while CL/SL/EL requests far beyond remaining balance are accepted with no warning.  
   **Repro:** khushi CL quota=12. curl -X POST .../leave/requests -d '{"leaveType":"CL","startDate":"2026-08-03","endDate":"2026-08-28","reason":"x"}' -> 201 numDays=20, status PENDING (accepted 20 days on a 12-day quota). By contrast curl ... -d '{"leaveType":"CO",...1 day...}' -> 400 'Not enough comp-off credits'. create() only balance-checks CO (attendance.module.ts:604-610).

32. 🔵 **Leave request accepts an arbitrary/unknown leaveType string (no validation against configured leave types)**  
   `data-integrity` · POST /leave/requests · _reproduced_ · found by: adversary  
   **Expected:** Reject a leaveType that is not one of the org's configured LeaveType codes (400).  
   **Actual:** Junk leave types are persisted; they bypass balance accounting and pollute leave data/reports.  
   **Repro:** curl -X POST .../leave/requests -d '{"leaveType":"QATEST_HACK","startDate":"2026-09-07","endDate":"2026-09-07","reason":"x"}' -> 201 created with leaveType 'QATEST_HACK'. create() stores dto.leaveType directly (attendance.module.ts:611) without checking it exists in leave_type.

33. ⚪ **HALF_DAY counts as a full present day in attendance-rate and 'present' tally**  
   `domain` · GET /attendance/me/month (summary) and GET /attendance/org/summary · _code-evident_ · found by: employee  
   **Expected:** A half day should contribute 0.5 (or be surfaced distinctly) so attendance rate reflects actual presence for an IP firm's records  
   **Actual:** HALF_DAY is counted identically to a full PRESENT day, overstating the attendance rate. Borderline design choice rather than a hard bug.  
   **Repro:** getMonth summary: present = count('PRESENT') + count('HALF_DAY'); attendanceRate = round(present/expectedDays*100) (attendance.module.ts:469,476). A HALF_DAY (e.g. a <4h punch, or an approved half-day regularization) contributes a full 1.0 to 'present' and to the rate. orgSummary mirrors this (line 516).

34. ⚪ **GET /attendance/org/summary does not validate from<=to (returns zero-filled rows for a reversed range)**  
   `validation` · GET /attendance/org/summary · _reproduced_ · found by: hr  
   **Expected:** A reversed range should 400, consistent with GET /attendance/me/month which validates its month input.  
   **Actual:** No from<=to check; a reversed range silently returns an all-zero summary that could be misread as everyone absent.  
   **Repro:** `curl -b hr.txt 'localhost:4000/api/v1/attendance/org/summary?organizationId=<org>&from=2026-07-20&to=2026-07-01'` -> 200 with every user present=0/absent=0/rate=0 (the day loop produces nothing).

35. ⚪ **Regularization approval reach is wider than the stated 'HR + Yash only' routing**  
   `ab-inconsistency` · GET /attendance/regularizations/pending, POST /attendance/regularizations/:id/approve · _code-evident_ · found by: superadmin  
   **Expected:** If the intent is that only HR + Yash action regularizations, the authorization gate should match the notification routing; otherwise the 'ONLY' wording is misleading.  
   **Actual:** A non-Yash Admin/Super Admin who is never notified can still read the entire org regularization queue and approve/reject any request. For the Super Admin owner persona this is expected authority (self-review is still correctly blocked), so noted as an intent-vs-enforcement observation rather than a defect.  
   **Repro:** Notifications for a new regularization go only to HR + yash@squarkip.com (regularizationApproverIds, attendance.module.ts:56-69), but the pending queue and approve/reject routes are gated solely by attendance.regularize, held by every HR, Admin and Super Admin (permissions-catalog.ts:218,236,244).

36. ⚪ **Read/summary endpoints trust client-supplied organizationId/userId with no org-membership check (mitigated: single-org deployment)**  
   `rbac` · GET /leave/types, GET /leave/holidays, GET /attendance/org/summary, GET /attendance/users/:id/month · _code-evident_ · found by: adversary  
   **Expected:** Derive organizationId from the authenticated actor (or verify membership); gate holiday reads on holiday.view for consistency with holiday.manage.  
   **Actual:** Client-controlled org/user scoping on these reads; harmless today (single org) but a cross-tenant IDOR pattern if the platform ever hosts multiple orgs.  
   **Repro:** GET /leave/types?organizationId=... and GET /leave/holidays?organizationId=... have NO @RequirePermission (attendance.module.ts:1147,1153) and echo whatever organizationId is passed (fake org -> [] 200). org/summary (:1050) and users/:id/month (:1042) gate on permission but read organizationId/userId from the client with no check that the actor belongs to that org — a holder of attendance.view.organization could read another org's data. Only 1 organization exists in this DB, so cross-tenant read is not currently demonstrable; khushi is correctly 403'd on the gated ones.

37. ⚪ **POST /attendance/mark accepts an arbitrary, unvalidated status string**  
   `validation` · POST /attendance/mark · _code-evident_ · found by: manager  
   **Expected:** status should be validated against the known enum (PRESENT/ABSENT/HALF_DAY/ON_LEAVE/HOLIDAY/...).  
   **Actual:** Any string is stored as the day's status, which would then flow into month/summary counters.  
   **Repro:** Manager is correctly denied (403 Missing permission: attendance.manage). For holders (HR/Admin), mark() (attendance.module.ts:132-140, 1055-1059) upserts data.status verbatim with no whitelist, so an attendance row can be set to any string (e.g. 'FOO'); it also shares the missing-date -> 500 crash. Reported as info because it is out of the manager's reach but is a real gap in the same module.


### leaves  (44 unique — 🟠4 🟡16 🔵20 ⚪4)

1. 🟠 **Non-comp-off leave has no quota enforcement: an employee can request far more days than the annual quota, and the balance display silently hides the overage**  
   `logic` · POST /leave/requests · _reproduced_ · found by: employee  
   **Expected:** Requesting more days than the remaining annual quota for a type should be rejected (400), mirroring the CO 'Not enough credits' rule; balance should be able to reflect an over-availed state rather than flooring at 0.  
   **Actual:** 33-day EL request (quota 15) accepted with HTTP 201; no enforcement at create or approve; balance endpoint floors remaining at 0, hiding the overage.  
   **Repro:** As employee (leave.approve not held), EL quota is 15/yr (GET /leave/balance/me shows remaining:15). curl -b cookie -X POST http://localhost:4000/api/v1/leave/requests -H 'Content-Type: application/json' -d '{"leaveType":"EL","startDate":"2026-09-01","endDate":"2026-10-16","reason":"x"}' -> HTTP 201, numDays:33. LeaveService.create() (attendance.module.ts:587-615) only checks a balance for leaveType==='CO'; every other type is written with no quota check, and approve() (line 617) never checks balance either. balances() (line 727) returns remaining:Math.max(0, quota-used) so once used exceeds quota it just shows 0, masking the over-avail.

2. 🟠 **TOCTOU race lets an employee create multiple overlapping leaves on the same day, defeating the one-leave-per-day rule**  
   `data-integrity` · POST /leave/requests · _reproduced_ · found by: adversary  
   **Expected:** At most one pending/approved leave can exist for a given day (the create() overlap check enforces this serially). Concurrent duplicates should be rejected or blocked by a DB constraint.  
   **Actual:** The overlap guard is a non-atomic findFirst-then-create (attendance.module.ts:596-611) with no unique constraint, so all 6 concurrent requests passed the check and were inserted. Because the same non-atomic pattern guards the comp-off balance check for CO leave (line 605-610), racing CO submissions could also spend more comp-off credits than earned, and each duplicate double-debits the balance on approval.  
   **Repro:** Logged in as khushi.gupta, fired 6 identical POSTs in parallel: for i in 1..6; do curl -s -b cookie -X POST http://localhost:4000/api/v1/leave/requests -H 'Content-Type: application/json' -d '{"leaveType":"CL","startDate":"2026-08-20","endDate":"2026-08-20","reason":"QATEST-race"}' & done; wait. DB then showed 6 PENDING leave_request rows for 2026-08-20. (All 6 test rows deleted afterward.)

3. 🟠 **Employee can cancel an already-approved, entirely-past leave — deletes the ON_LEAVE attendance and refunds the balance**  
   `logic` · POST /leave/requests/:id/cancel · _code-evident_ · found by: adversary  
   **Expected:** Cancelling should be restricted to future/not-yet-started leave (mirroring create()'s own M4 rule that rejects past-dated leave), and refunding balance for days already consumed should not be possible.  
   **Actual:** cancel() has no 'is it in the past / already taken' guard; an approved past leave is fully cancellable, its ON_LEAVE attendance deleted and balance refunded. (The range-based deleteMany at line 696 also filters only on status=ON_LEAVE + date range, so it can delete ON_LEAVE rows that belong to a different record.)  
   **Repro:** Code path in LeaveService.cancel (attendance.module.ts:689-699): it allows status in [PENDING, APPROVED] with NO date check; for an APPROVED request it deleteMany's the generated ON_LEAVE attendance rows across the whole range and sets status=CANCELLED. balances() counts only status=APPROVED, so cancelling drops 'used' back down. A user could take approved leave, let the dates pass, then cancel to erase the ON_LEAVE marks and reclaim the balance. Not executed against live data because it would destroy a real approved-leave record and self-approval is not possible from this persona.

4. 🟠 **Cancelling an approved leave leaves an orphaned LEAVE calendar event (person still shows as on-leave on the shared calendar)**  
   `data-integrity` · POST /leave/requests/:id/cancel · _reproduced_ · found by: manager  
   **Expected:** Cancelling an approved leave should remove BOTH the ON_LEAVE attendance rows and the calendar_event created at approval, so the shared calendar no longer shows the person absent.  
   **Actual:** cancel() (attendance.module.ts L689-699) deletes only the ON_LEAVE attendance rows (L696); it never deletes the calendar_event that approve() created (L639-650). The calendar keeps showing the (cancelled) leave, so a delivery lead reading team availability / capacity coverage sees a phantom absence.  
   **Repro:** 1) login user A, POST /leave/requests {leaveType:CL,startDate:2099-06-15,endDate:2099-06-15}. 2) login manager, POST /leave/requests/<id>/approve. DB now has attendance ON_LEAVE (1 row) AND calendar_event type=LEAVE 'Nitin Goel — CL leave' 2099-06-15 (id cmrtp1elp00ghcpkov3xddn8u). 3) login user A, POST /leave/requests/<id>/cancel -> 200 CANCELLED. 4) Re-query: ON_LEAVE attendance = 0 (correctly removed) BUT the LEAVE calendar_event is STILL present. Reproduced live end-to-end, then cleaned up.

5. 🟡 **Delivery-surface read endpoints are not permission-gated — HR (and every authenticated role) can read all projects/tasks/issues**  
   `rbac` · GET /projects, GET /projects/:id, GET /tasks, GET /tasks/:id, GET /issues · _reproduced_ · found by: hr  
   **Expected:** HR_CODES in permissions-catalog.ts (lines 204-208) states HR 'Deliberately does NOT include the delivery surfaces (projects/tasks/milestones/issues)'. These reads should require project.view/task.view/issue.view.  
   **Actual:** The list/detail GETs have no @RequirePermission (projects.controller.ts:19 & 39; tasks.controller.ts:15 & 26; issues.controller.ts:10 & 15), so any logged-in user — HR or a plain Employee — can enumerate and read delivery data org-wide. (Mutations remain gated, so exposure is read-only.)  
   **Repro:** As HR (role deliberately excludes delivery surfaces): GET /projects?organizationId=... -> 200 full project list ('Test 1', etc.); GET /tasks?projectId=<any> -> 200 full task list + GET /tasks/:id -> 200 task detail.

6. 🟡 **Comp-off claimable for a non-working day the employee never actually worked (no timesheet/attendance verification)**  
   `domain` · POST /leave/compoff · _reproduced_ · found by: adversary  
   **Expected:** For an IP firm crediting a paid day off, a comp-off claim for a weekend/holiday should require evidence of actual work (a timesheet or punch on that date), or at least be flagged when none exists.  
   **Actual:** requestCompOff (attendance.module.ts:790-803) validates only: reason present, projectRef present, not future, and isNonWorkingDay. It never checks that any work was logged. A claim for any past weekend/holiday is created and sent for approval; the credit is granted on approval regardless of real work (mitigated only by the reviewer reading the evidence panel).  
   **Repro:** curl -b cookie -X POST .../leave/compoff -d '{"workDate":"2026-07-18","reason":"QATEST weekend work","projectRef":"PID-999","hoursWorked":8}' -> 201 PENDING, despite no timesheet or attendance for that Saturday. Also accepted for holiday-on-weekday 2026-07-01. (Deleted.)

7. 🟡 **leaveType is free text and never validated — leave can be applied against a non-existent leave type**  
   `validation` · POST /leave/requests · _reproduced_ · found by: employee  
   **Expected:** leaveType must be one of the org's configured leave_type codes (CL/CO/EL/SL); an unknown code should return 400.  
   **Actual:** Any arbitrary string is accepted and stored; the bogus type never maps to a balance and shows up in approver queues.  
   **Repro:** curl -b cookie -X POST http://localhost:4000/api/v1/leave/requests -H 'Content-Type: application/json' -d '{"leaveType":"ZZ-FAKE","startDate":"2026-07-21","endDate":"2026-07-21","reason":"x"}' -> HTTP 201 with leaveType:"ZZ-FAKE". leave_request.leaveType is a plain text column with no FK/enum, and LeaveService.create() never checks the value against the org's leave_type table. The web form (apps/web/app/attendance/page.tsx:552) constrains it to a <select> of real types, so this is a backend-only gap reachable via direct API / stale client.

8. 🟡 **No balance/quota enforcement on regular leave types — a user can request far more days than their annual entitlement**  
   `logic` · POST /leave/requests · _reproduced_ · found by: superadmin  
   **Expected:** Requesting 30 business days of EL against a 15-day annual quota should be rejected (or at least flagged), the same way CO leave is checked against earned credits in LeaveService.create (attendance.module.ts:605-610).  
   **Actual:** Accepted as PENDING with numDays=30. LeaveService.create only enforces balance for leaveType==='CO'; CL/EL/SL have no quota check at all. If approved, balances() clamps remaining to Math.max(0, quota-used) (attendance.module.ts:727), so the over-draw is silently hidden as remaining=0 rather than shown negative. (Note: for regular types balances count only APPROVED days while CO counts PENDING+APPROVED — an internal A/B inconsistency.)  
   **Repro:** As mohit (super admin): curl -b cookie -X POST http://localhost:4000/api/v1/leave/requests -H 'Content-Type: application/json' -d '{"leaveType":"EL","startDate":"2026-08-03","endDate":"2026-09-11","reason":"QATEST-overquota"}'. Earned Leave annualQuota is 15 (GET /leave/balance/me). Request returns 201 with numDays=30.

9. 🟡 **leaveType is free-text and not validated against the org leave-type catalog**  
   `validation` · POST /leave/requests · _reproduced_ · found by: superadmin  
   **Expected:** leaveType should be validated against the organization's leave_type codes (CL/CO/EL/SL). An unknown code should return 400.  
   **Actual:** Any arbitrary string is accepted and persisted. Consequence: such a request never appears in GET /leave/balance/me (balances() iterates only existing leave_type rows), so if approved those leave days escape ALL quota/balance accounting entirely.  
   **Repro:** curl -b cookie -X POST .../leave/requests -d '{"leaveType":"QATEST-FAKE","startDate":"2026-07-28","endDate":"2026-07-28","reason":"QATEST-badtype"}' -> 201, leaveType stored verbatim as 'QATEST-FAKE'. (Concurrent QA personas independently reproduced this with 'QATEST-bogustype'.)

10. 🟡 **leaveType is not validated against the org's leave types — arbitrary and empty strings are accepted**  
   `validation` · POST /leave/requests · _reproduced_ · found by: adversary  
   **Expected:** leaveType must be one of the org's LeaveType codes (CL/SL/EL/CO); unknown or empty types rejected with 400.  
   **Actual:** create() (attendance.module.ts:587-612) stores dto.leaveType verbatim with no membership check. A leave with an unknown code never maps to any quota — balances() groups by leaveType so it is invisible to quota tracking, letting an employee take leave that never debits any balance.  
   **Repro:** curl -b cookie -X POST .../leave/requests -d '{"leaveType":"HACKED","startDate":"2026-08-11","endDate":"2026-08-11","reason":"QATEST"}' -> 201 with leaveType:"HACKED", numDays:1. Also leaveType:"" -> 201 with leaveType:"". (Both deleted.) Numeric/null leaveType are rejected only incidentally by the global type pipe.

11. 🟡 **No quota or maximum-range enforcement for non-CO leave (CO is enforced but CL/SL/EL are not) — 259-day request accepted**  
   `ab-inconsistency` · POST /leave/requests · _reproduced_ · found by: adversary  
   **Expected:** Either enforce annual quota / a sane maximum span for CL/SL/EL at request time (as CO does for credits and WFH does for 31 days), or document that over-quota is intentional (LWP). The three flows should be consistent.  
   **Actual:** create() only balance-checks leaveType==='CO' (line 605); all other types have no quota check and no range cap, so an employee can file a year-long, hundreds-of-days leave far beyond quota. balances() also clamps remaining at max(0, quota-used), hiding any negative balance after approval.  
   **Repro:** curl -b cookie -X POST .../leave/requests -d '{"leaveType":"CL","startDate":"2026-10-01","endDate":"2027-09-30","reason":"QATEST"}' -> 201 numDays:259 (CL annualQuota is 12). Also 22-day CL (Sep) accepted. In contrast CO leave with 0 credits is correctly rejected ('Not enough comp-off credits'), and WFH requests are hard-capped at 31 days.

12. 🟡 **Applying for leave notifies no approver — no routing at all (inconsistent with comp-off, which does notify)**  
   `ab-inconsistency` · POST /leave/requests · _code-evident_ · found by: manager  
   **Expected:** A submitted leave request should notify the approver(s) (manager/HR) so it can be actioned, exactly like a comp-off claim does.  
   **Actual:** No one is notified when leave is applied. A manager/HR can only discover pending leave by manually polling GET /leave/requests/org?status=PENDING. Same-module comp-off flow does notify, so the two review queues behave inconsistently.  
   **Repro:** Applied several leaves via POST /leave/requests. DB check: SELECT DISTINCT type FROM notification returns compoff.requested, compoff.approved, leave.approved, leave.rejected — but there is NO 'leave.requested' type (SELECT count(*) FROM notification WHERE type='leave.requested' = 0). create() in attendance.module.ts L587-615 contains zero notifications.notify(...) calls, whereas requestCompOff() (L808-812) notifies HR+Managers+Yash on submission.

13. 🟡 **leaveType is never validated against the org's leave-type catalog — arbitrary types accepted and become invisible in balances**  
   `validation` · POST /leave/requests · _reproduced_ · found by: manager  
   **Expected:** leaveType should be validated against LeaveType.code for the org (CL/CO/EL/SL) and rejected with 400 otherwise.  
   **Actual:** create() (L587-615) stores dto.leaveType verbatim with no catalog lookup. Such a leave can be approved -> writes ON_LEAVE attendance + a calendar event with the garbage type. balances() (L712,L719-728) only enumerates catalog LeaveTypes, so the working days consumed by a bogus-type leave decrement NO quota and are invisible in every balance view.  
   **Repro:** login manager, POST /leave/requests {leaveType:'QATEST-ZZZ',startDate:'2026-12-14',endDate:'2026-12-14'} -> HTTP 201, row created with leaveType 'QATEST-ZZZ', numDays 1, status PENDING. Any string is accepted.

14. 🟡 **leaveType is not validated against the org's LeaveType catalog — bogus leave types are accepted**  
   `validation` · POST /leave/requests · _reproduced_ · found by: hr  
   **Expected:** Reject a leaveType that is not one of the org's LeaveType.code values (CL/CO/EL/SL) with 400.  
   **Actual:** Accepted. LeaveRequest.leaveType is a free String with no FK/lookup (schema.prisma:968; create() never checks the LeaveType table). The bogus leave is approvable, writes ON_LEAVE attendance and a calendar event titled '<name> — QATEST-FAKE leave', and never appears in balances — so it silently bypasses all quota accounting.  
   **Repro:** curl -b hr-cookie -X POST .../leave/requests -d '{"leaveType":"QATEST-FAKE","startDate":"2026-08-10","endDate":"2026-08-10"}' -> HTTP 201, request created with leaveType 'QATEST-FAKE'.

15. 🟡 **Annual leave quota/balance is not enforced and leave duration is unbounded (only comp-off checks credits)**  
   `logic` · POST /leave/requests · _reproduced_ · found by: hr  
   **Expected:** Requesting/approving more than the remaining annual quota for CL/SL/EL should be blocked (or at least flagged), and an absurd multi-year single request should be capped.  
   **Actual:** Accepted with no cap. create() only enforces a balance for leaveType 'CO' (attendance.module.ts:604-610); regular types have no quota check on request or approval. balances() reports remaining as Math.max(0, quota-used), which hides the overage. HR can approve unlimited over-quota leave.  
   **Repro:** curl -b hr-cookie -X POST .../leave/requests -d '{"leaveType":"EL","startDate":"2026-09-01","endDate":"2028-09-01"}' -> HTTP 201 with numDays=522, even though Earned Leave annualQuota is 15.

16. 🟡 **Omitting startDate/endDate (or workDate) returns 500 Internal Server Error instead of a clean 400**  
   `validation` · POST /leave/requests, POST /leave/compoff · _reproduced_ · found by: employee  
   **Expected:** Missing required fields should yield a clean 400 (Bad Request), never a 500 unhandled exception.  
   **Actual:** Missing date field crashes with HTTP 500.  
   **Repro:** curl -b cookie -X POST http://localhost:4000/api/v1/leave/requests -H 'Content-Type: application/json' -d '{"leaveType":"CL"}' -> HTTP 500 {"message":"Internal server error."}. Same for compoff: -d '{"reason":"x","projectRef":"P-1"}' (missing workDate) -> HTTP 500. Root cause: create() does dto.startDate.slice(0,10) and requestCompOff() does data.workDate.slice(0,10) with no null-guard (attendance.module.ts:588-589, 793), so a missing required date field throws TypeError before any validation. Malformed/missing non-date fields are handled (400), only missing dates crash.

17. 🟡 **Missing required date field returns 500 (TypeError) instead of a 400 validation error on 3 leave endpoints**  
   `validation` · POST /leave/requests, POST /leave/compoff, POST /leave/holidays · _reproduced_ · found by: manager  
   **Expected:** Missing required fields should return 400 with a clear message.  
   **Actual:** Each handler calls dto.<dateField>.slice(0,10) before any validation (create L588, requestCompOff L793, createHoliday L909); when the field is undefined this throws a TypeError surfaced as a raw 500. No DTO/class-validator guards exist on these POST bodies.  
   **Repro:** POST /leave/requests {leaveType:'CL',endDate:'2026-12-15'} (no startDate) -> HTTP 500 'Internal server error'. POST /leave/requests {} -> 500. POST /leave/compoff {reason:'x',projectRef:'P1'} (no workDate) -> 500. POST /leave/holidays {organizationId,name:'x'} (no date) -> 500. (Present-but-invalid strings are caught: startDate:'not-a-date' -> 400, name missing -> 400.)

18. 🟡 **Omitting a required date field crashes /leave/* create endpoints with HTTP 500 instead of a 400**  
   `validation` · POST /leave/requests, POST /leave/compoff, POST /leave/holidays · _reproduced_ · found by: hr  
   **Expected:** A clean 400 Bad Request naming the missing field (as the module already does for missing leaveType -> 400, invalid date -> 400, duplicate holiday -> 409).  
   **Actual:** 500 {"message":"Internal server error."}. Cause: LeaveService.create calls dto.startDate.slice(0,10)/dto.endDate.slice on undefined (attendance.module.ts:588-589), requestCompOff calls data.workDate.slice (line 793), createHoliday calls dto.date.slice (line 909) — all before any validation, so undefined throws a TypeError.  
   **Repro:** As any authenticated user: curl -b cookie -X POST http://localhost:4000/api/v1/leave/requests -H 'Content-Type: application/json' -d '{"leaveType":"CL","endDate":"2026-08-01"}' -> HTTP 500. Same for empty body {} , for missing endDate, for POST /leave/compoff with reason+projectRef but no workDate, and POST /leave/holidays without date.

19. 🟡 **Cancelling an APPROVED leave leaves a stale 'on leave' calendar event on the shared calendar**  
   `data-integrity` · POST /leave/requests/:id/cancel · _code-evident_ · found by: employee  
   **Expected:** Cancelling an approved leave should also remove the LEAVE calendar event it created, matching the ON_LEAVE attendance rollback.  
   **Actual:** Attendance rows are removed but the calendar event persists, leaving a phantom leave entry.  
   **Repro:** Code-evident: approve() creates a CalendarEvent of type LEAVE (attendance.module.ts:639-650). cancel() (line 689-699) deletes the generated ON_LEAVE attendance rows and flips status to CANCELLED, but never deletes the CalendarEvent. Could not drive the approve step as an employee (leave.approve returns 403), but the cancel path unambiguously omits calendar cleanup. Net effect: after HR approves then the employee cancels, the shared calendar (and anything reading calendar_event) still shows the person on leave.

20. 🟡 **Cancelling an approved leave leaves a stale 'on leave' event on the shared calendar**  
   `data-integrity` · POST /leave/requests/:id/cancel · _reproduced_ · found by: hr  
   **Expected:** Cancellation of an approved leave should also remove the shared-calendar LEAVE event so the person no longer shows as on leave.  
   **Actual:** approve() creates a calendar_event with no link back to the leave (attendance.module.ts:639); cancel() (lines 689-699) deletes only the ON_LEAVE attendance rows, never the calendar event. Calendar/capacity keep showing the cancelled leave.  
   **Repro:** Employee applies SL 2026-08-24; HR approves (creates ON_LEAVE attendance + a LEAVE calendar_event 'Ajay Sharma — SL leave'); employee cancels. DB after cancel: ON_LEAVE attendance row = 0 (deleted), but calendar_event 'Ajay Sharma — SL leave' still present.

21. 🔵 **Org-scoped leave reads/writes trust a client-supplied organizationId with no actor-org check**  
   `rbac` · GET /leave/requests/org · _code-evident_ · found by: manager  
   **Expected:** The org should be derived from the authenticated actor (or the supplied id validated against it); a request for another org should be 403.  
   **Actual:** The endpoints trust the client-provided org id. Real-world impact is latent because this is a single-org deployment (only one Organization exists, so no other tenant's data can be returned today), but the tenant guard is missing in code.  
   **Repro:** GET /leave/requests/org?organizationId=cmXXXfakeorgid00000000000 -> HTTP 200 [] (not 403). listForOrg() (L563-568) filters solely on the query param; /leave/types, /leave/holidays and POST /leave/holidays (org from body) do the same. None verify the id matches the actor's own organizationId.

22. 🔵 **Org-scoped leave endpoints trust a client-supplied organizationId instead of deriving it from the session actor (latent cross-tenant path; /types and /holidays have no permission gate)**  
   `rbac` · GET /leave/requests/org, GET /leave/types, GET /leave/holidays, POST /leave/holidays · _code-evident_ · found by: superadmin  
   **Expected:** Org-scoped reads/writes should resolve the organization from the authenticated actor (as /leave/compoff/pending and the attendance pending queues already do), not from client input, so a holder in one org cannot target another. Leave-type/holiday reads should also carry an appropriate view permission.  
   **Actual:** The organization is taken verbatim from the query/body. In this single-org deployment it is not exploitable (unknown org -> empty result / FK 400 on write), but it is a latent multi-tenancy leak: a leave.view.organization / holiday.manage holder in org A could point these at org B, and the ungated /types & /holidays reads accept any org id from any authenticated user. Inconsistent with the derive-from-actor pattern used elsewhere in the same module.  
   **Repro:** GET /leave/requests/org?organizationId=NONEXISTENT-ORG-9999 -> 200 []. GET /leave/types?organizationId=... and GET /leave/holidays?organizationId=... have NO @RequirePermission at all (attendance.module.ts:1147-1157) and read whatever org id the caller passes. POST /leave/holidays takes organizationId from the body (attendance.module.ts:1159-1163).

23. 🔵 **GET /leave/types and /leave/holidays trust a client-supplied organizationId without scoping to the actor's org**  
   `rbac` · GET /leave/types, GET /leave/holidays · _code-evident_ · found by: adversary, hr  
   **Expected:** Org-scoped reads should derive organizationId from the authenticated actor (as balances()/pending queues do), not from a client parameter, and should require holiday.view/leave read permission.  
   **Actual:** Caller can pass any organizationId. Not exploitable today because the deployment is single-org, but in a multi-org deployment this is a cross-tenant read of another org's leave types/holidays.  
   **Repro:** Both routes (attendance.module.ts:1147-1157) read organizationId from the query string and query by it directly, with no @RequirePermission and no check that it matches the caller's own org (holiday.view is not enforced either). Verified they return data purely per the param.

24. 🔵 **Comp-off claim accepts a negative hoursWorked value**  
   `validation` · POST /leave/compoff · _reproduced_ · found by: employee  
   **Expected:** hoursWorked, when supplied, should be a positive number within a sane daily bound; negative/zero should be rejected.  
   **Actual:** Negative hours accepted and stored, then shown to approvers as work evidence.  
   **Repro:** curl -b cookie -X POST .../leave/compoff -d '{"workDate":"2026-07-18","reason":"x","projectRef":"P-1","hoursWorked":-5}' -> HTTP 201 with hoursWorked:-5. requestCompOff() (attendance.module.ts:790-802) stores hoursWorked verbatim with no range check.

25. 🔵 **Negative hoursWorked accepted on a comp-off claim**  
   `validation` · POST /leave/compoff · _reproduced_ · found by: adversary  
   **Expected:** hoursWorked should be validated as a positive number within a plausible range (e.g. 0<h<=24).  
   **Actual:** requestCompOff stores data.hoursWorked with no range/sign validation (line 802), producing nonsensical evidence shown to approvers.  
   **Repro:** curl -b cookie -X POST .../leave/compoff -d '{"workDate":"2026-07-19","reason":"QATEST","projectRef":"PID-1","hoursWorked":-40}' -> 201 with hoursWorked:-40. (Deleted.)

26. 🔵 **Comp-off hoursWorked accepts negative / zero values**  
   `validation` · POST /leave/compoff · _reproduced_ · found by: manager  
   **Expected:** hoursWorked should be a positive, bounded number (e.g. 0<h<=24) or rejected.  
   **Actual:** Negative hours are stored and shown to reviewers as work evidence.  
   **Repro:** POST /leave/compoff {workDate:'2026-07-19',reason:'x',projectRef:'PID',hoursWorked:-5} -> HTTP 201 with hoursWorked:-5 stored. requestCompOff() (L790-802) applies no numeric range check.

27. 🔵 **Comp-off submission routing (HR/Manager/Yash) does not match approval authorization (leave.approve, which also includes Admin)**  
   `ab-inconsistency` · POST /leave/compoff, POST /leave/compoff/:id/approve · _code-evident_ · found by: manager  
   **Expected:** Notification routing and the authorization gate should target the same set (drive both off the leave.approve permission).  
   **Actual:** Routing is keyed off role NAME + a hard-coded email; authorization is keyed off a PERMISSION. The sets diverge, so some authorized approvers never see the queue via notifications.  
   **Repro:** compOffApproverIds() (L746-759) notifies users whose role name is 'HR' or 'Manager', plus yash@squarkip.com. But approveCompOff is gated on RequirePermission('leave.approve') (controller L1130), which per the DB is held by Admin, HR, Manager, Super Admin. Non-yash Admin/Super Admin users can approve comp-offs but are never notified of pending ones; conversely a Manager/HR who lacked leave.approve would be notified yet get 403 on approve.

28. 🔵 **Holiday can be created with an empty name**  
   `validation` · POST /leave/holidays · _reproduced_ · found by: superadmin  
   **Expected:** A blank holiday name should be rejected with 400.  
   **Actual:** Created (201). A nameless holiday renders as a blank entry on the shared calendar and silently removes that date from business-day/leave-day counting org-wide. (createHoliday performs no name validation — attendance.module.ts:907-911.)  
   **Repro:** curl -b cookie -X POST .../leave/holidays -d '{"organizationId":"cmqze4knz0000sjsu7ljwqivj","name":"","date":"2027-12-30"}' -> 201 with name:"".

29. 🔵 **Backdated (partially-past) leave is accepted, debiting balance for business days that have already elapsed**  
   `domain` · POST /leave/requests · _reproduced_ · found by: employee  
   **Expected:** A leave request whose start is in the past should be restricted (e.g., start >= today, or a bounded backdate window) so employees can't retroactively apply leave over days already recorded present/absent.  
   **Actual:** Leave starting up to arbitrarily far in the past is accepted as long as endDate is today or later.  
   **Repro:** Today is 2026-07-20. curl -b cookie -X POST .../leave/requests -d '{"leaveType":"CL","startDate":"2026-07-15","endDate":"2026-07-22","reason":"x"}' -> HTTP 201, numDays:6 (includes already-passed 07-15..07-17). The past-date guard only rejects when end < today (attendance.module.ts:592), so any range whose end is today/future is allowed regardless of how far back the start is.

30. 🔵 **Leave 'reason' has no length limit — a ~12,000-character reason is accepted and stored**  
   `validation` · POST /leave/requests · _reproduced_ · found by: employee  
   **Expected:** A reasonable max length (e.g., a few hundred/thousand chars) should be enforced with a 400 on overflow.  
   **Actual:** Arbitrarily long reason accepted and persisted.  
   **Repro:** curl -b cookie -X POST .../leave/requests with an ~11,900-char reason on a valid single-day SL request -> HTTP 201, full string stored. reason is an unbounded text column and create() applies no max length.

31. 🔵 **Create-leave endpoint is not gated by the leave.request permission (permission defined in catalog + matrix but never enforced)**  
   `rbac` · POST /leave/requests · _code-evident_ · found by: superadmin  
   **Expected:** Since leave.request is a first-class permission surfaced in the RBAC matrix and assigned selectively per role, revoking it from a user/role should stop them creating leave — consistent with leave.approve gating the approve/reject routes.  
   **Actual:** Any authenticated user can POST /leave/requests regardless of whether they hold leave.request; the permission is decorative for this endpoint. Over-exposure / matrix-vs-enforcement mismatch. (All seeded roles happen to include leave.request, so not currently exploitable, but a custom or deliberately-restricted role would bypass the intended gate.)  
   **Repro:** Code: LeaveController.create at apps/api/src/modules/attendance/attendance.module.ts:1079-1083 has no @RequirePermission decorator (only a manual actorId!=null check). The 'leave.request' permission exists (packages/db/prisma/permissions-catalog.ts:53) and is granted per-role + shown in the Admin permission matrix.

32. 🔵 **Missing required fields on create-leave returns HTTP 500 instead of a clean 400**  
   `validation` · POST /leave/requests · _reproduced_ · found by: superadmin  
   **Expected:** Missing startDate/endDate/leaveType should return 400 with a field-level message.  
   **Actual:** Returns 500 — LeaveService.create calls dto.startDate.slice(0,10) on undefined (attendance.module.ts:588), throwing a TypeError surfaced as Internal server error. (Malformed date strings like 'notadate' are handled better — they fall through to a Prisma 400 'Invalid request data.')  
   **Repro:** curl -b cookie -X POST .../leave/requests -H 'Content-Type: application/json' -d '{}' -> {"statusCode":500,"message":"Internal server error."}

33. 🔵 **No length cap on leave reason — ~5000-char reason accepted**  
   `validation` · POST /leave/requests · _reproduced_ · found by: adversary  
   **Expected:** reason should have a reasonable max length (e.g. a few hundred chars).  
   **Actual:** create() stores dto.reason unchecked (line 612). Same absence applies to comp-off reason/projectRef; enables oversized payloads and UI-breaking content.  
   **Repro:** curl -b cookie -X POST .../leave/requests with reason of ~5040 chars ('QATEST' x720) -> 201, full string stored. (Deleted.)

34. 🔵 **POST /leave/requests is not gated by the leave.request permission (only authentication)**  
   `rbac` · POST /leave/requests · _code-evident_ · found by: adversary  
   **Expected:** Either enforce @RequirePermission('leave.request') on create (consistent with leave.approve/leave.view.organization gating elsewhere), or remove the unused permission. A user whose role lacks leave.request could still file leave.  
   **Actual:** Any authenticated actor can create a leave request regardless of the leave.request permission; the permission is defined and assigned but dead.  
   **Repro:** Controller LeaveController.create (attendance.module.ts:1079-1083) has no @RequirePermission decorator, only an actorId null-check. The 'leave.request' permission exists and is granted to Employee but is never enforced on any route.

35. 🔵 **No maximum leave duration; business-day counter loops one calendar day at a time with no cap**  
   `validation` · POST /leave/requests · _reproduced_ · found by: manager  
   **Expected:** Leave span should be capped to a sane maximum (an IP analyst does not book a ~1-year single leave), and the day-count should not be an unbounded loop.  
   **Actual:** Arbitrarily long spans are accepted. An absurd/malicious range (e.g. end-year 9999) forces millions of loop iterations on the Node event loop per request — a potential DoS lever with no guard.  
   **Repro:** POST /leave/requests {leaveType:'CL',startDate:'2030-01-07',endDate:'2030-12-31'} -> HTTP 201, numDays 257. No upper bound is enforced. businessDays() (L571-585) iterates day-by-day from start to end.

36. 🔵 **Leave 'reason' free-text has no maximum length**  
   `validation` · POST /leave/requests · _reproduced_ · found by: manager  
   **Expected:** A reasonable max length (e.g. a few hundred chars) should be enforced.  
   **Actual:** Unbounded free text is accepted and persisted.  
   **Repro:** POST /leave/requests with an 8000-character reason -> HTTP 201 (stored in full). No length cap in create().

37. 🔵 **Leave can be partially back-dated — a request whose start is in the past is accepted as long as it is not entirely past**  
   `domain` · POST /leave/requests · _reproduced_ · found by: hr  
   **Expected:** Retroactively debiting balance for days that have already passed is questionable; the rule should be explicit about whether back-dated start days are allowed.  
   **Actual:** Accepted. The M4 guard (attendance.module.ts:592) only rejects leave that is ENTIRELY in the past (end < today); a range straddling today back-dates freely. Possibly intentional for multi-day spans, flagged for domain review.  
   **Repro:** With server 'today' = 2026-07-20: POST /leave/requests {"leaveType":"CL","startDate":"2026-07-17","endDate":"2026-07-21"} -> HTTP 201, numDays=3, including the already-elapsed Friday 2026-07-17.

38. 🔵 **Missing required date fields return 500 (unhandled crash) instead of a clean 400**  
   `validation` · POST /leave/requests, POST /leave/compoff · _reproduced_ · found by: adversary  
   **Expected:** Missing startDate/endDate/workDate should return 400 with a clear message.  
   **Actual:** create() does dto.startDate.slice(0,10) (line 588) and requestCompOff does data.workDate.slice(0,10) (line 793) with no presence check, so undefined.slice throws a TypeError surfaced as a generic 500.  
   **Repro:** curl -b cookie -X POST .../leave/requests -d '{"leaveType":"CL"}' -> {"statusCode":500,"message":"Internal server error."}. curl -b cookie -X POST .../leave/compoff -d '{"reason":"x","projectRef":"y"}' -> 500.

39. 🔵 **Any leave.approve holder can approve/reject any user's leave org-wide; reporting line (user_manager) is ignored (no team scoping)**  
   `rbac` · POST /leave/requests/:id/approve · _code-evident_ · found by: manager  
   **Expected:** For a 'team lead / approver' persona whose brief is 'act only within granted scope', a manager would be expected to approve only their own reports (or the design should explicitly document a flat approver pool + route to the specific manager).  
   **Actual:** There is zero team/manager scoping: any Manager/HR/Admin can approve/reject leave for anyone in the org (peers, other managers, HR, admins). Combined with the no-notification gap above, the whole leave-approval workflow is unrouted and unscoped.  
   **Repro:** As manager (Anant) I approved Nitin Goel's leave (POST /leave/requests/<nitin id>/approve -> 200 APPROVED, reviewedBy=my id) although Nitin is not scoped to me. approve()/reject() (L617-621,L672-676) check only the leave.approve permission and self-review; they never consult the user_manager reporting table (which exists and is populated).

40. 🔵 **No admin/HR path to revoke or cancel an already-APPROVED leave**  
   `domain` · POST /leave/requests/:id/cancel, POST /leave/requests/:id/reject · _code-evident_ · found by: superadmin  
   **Expected:** This ownership gate is intentional and correct (super admin rightly does NOT bypass it), but operationally HR/Admin should have some sanctioned way to undo a leave approved in error, or one belonging to an employee who is unavailable/offboarded.  
   **Actual:** Once APPROVED, only the original requester can cancel it; no privileged override exists, leaving a stuck approved leave with generated ON_LEAVE attendance rows and a calendar event that no admin can withdraw. Flagged as a deliberate-gate consequence, not a security defect.  
   **Repro:** cancel requires req.userId===actorId (attendance.module.ts:692) so super admin canceling arjun's approved leave returns 403 'You can only cancel your own leave requests'; reject requires status PENDING (attendance.module.ts:675) so an approved request returns 400 'Only PENDING requests can be rejected'.

41. ⚪ **GET /leave/types and /leave/holidays are ungated and trust a client-supplied organizationId; leave.request/leave.view.own permissions are never enforced on the self routes**  
   `rbac` · GET /leave/types, GET /leave/holidays, POST /leave/requests · _code-evident_ · found by: employee  
   **Expected:** Read endpoints should scope to the actor's own org (or require holiday.view/leave.view), and the create route should assert leave.request, so RBAC codes are actually enforced and a multi-org deployment can't leak another org's leave types/holidays via the param.  
   **Actual:** Org-scoped reads are param-driven with no permission gate; leave.request/leave.view.own are effectively decorative on these routes.  
   **Repro:** curl -b cookie '.../leave/types?organizationId=bogus-org-id' -> HTTP 200 [] (result is driven purely by the query param, not the actor's org; no @RequirePermission). LeaveController.types/holidays (attendance.module.ts:1147-1157) have no permission decorator and no check that organizationId matches the actor. Similarly POST /leave/requests and GET /leave/requests/me carry no @RequirePermission, so the defined leave.request/leave.view.own codes are never enforced (auth-only). Single-org today, so no cross-org data is exposed in practice.

42. ⚪ **Comp-off hoursWorked is stored without validation**  
   `validation` · POST /leave/compoff · _code-evident_ · found by: superadmin  
   **Expected:** hoursWorked should be validated as a positive, plausible number (e.g. 0<h<=24).  
   **Actual:** No validation on hoursWorked. Minor/cosmetic; the approver sees timesheet+attendance evidence regardless, so impact is low.  
   **Repro:** requestCompOff stores data.hoursWorked directly (attendance.module.ts:802) with no bounds check; a negative or absurdly large value would be persisted and shown to the approver as evidence.

43. ⚪ **Past-date rule only blocks entirely-past leave; a backdated leave ending today/future is accepted and retroactively writes ON_LEAVE attendance on approval**  
   `logic` · POST /leave/requests · _code-evident_ · found by: manager  
   **Expected:** Per the code's own comment the past-date check exists so approval doesn't 'retroactively debit balance' — that protection should cover the past portion of any span, or backdating should be an explicit, controlled path (e.g. sick leave).  
   **Actual:** The guard is all-or-nothing: only fully-past leave is blocked, so a partly-past span still retroactively debits balance and writes past-dated attendance rows, contradicting the stated intent.  
   **Repro:** create() (L591-592) rejects only when end < today ('Cannot request leave for dates in the past.'). A request with a past startDate and a today/future endDate passes; on approval businessDays() back-writes ON_LEAVE attendance for the already-elapsed working days in the span.

44. ⚪ **POST /leave/requests has no @RequirePermission — the catalog's leave.request permission is not enforced**  
   `rbac` · POST /leave/requests · _code-evident_ · found by: manager  
   **Expected:** If leave.request is a real permission it should gate creation; otherwise it is dead configuration.  
   **Actual:** leave.request is never enforced. No security impact today (every role preset includes it), but it is an unenforced-permission inconsistency.  
   **Repro:** LeaveController.create (controller L1079-1083) has no @RequirePermission decorator; the guard is opt-in (permission.guard.ts L24 allows routes with no requirement). The permissions catalog defines leave.request and assigns it per-role, but the create endpoint checks only that an actor cookie exists.


### compoff  (29 unique — 🟡10 🔵16 ⚪3)

1. 🟡 **POST /leave/compoff returns HTTP 500 (unhandled TypeError) for missing or wrong-typed workDate/reason instead of a 400**  
   `validation` · POST /leave/compoff · _reproduced_ · found by: manager  
   **Expected:** Malformed/missing/wrong-typed fields should return a clean 400 Bad Request with a helpful message (as missing reason and missing projectRef already do).  
   **Actual:** requestCompOff() has no DTO validation; it calls data.workDate.slice(0,10) and data.reason.trim() directly (attendance.module.ts:790-793), so a missing/non-string field throws an uncaught TypeError surfaced as HTTP 500.  
   **Repro:** Authenticated as manager (anant.gupta). Send body with reason+projectRef but NO workDate: curl -s -b cookie -X POST http://localhost:4000/api/v1/leave/compoff -H 'Content-Type: application/json' -d '{"reason":"QATEST worked","projectRef":"QATEST-P1"}' -> {"statusCode":500,"message":"Internal server error."}. Same 500 for {"workDate":null,...}, {"workDate":20260719,...} (number), and {"reason":123,...} (non-string reason). By contrast a bad date STRING ({"workDate":"notaday!!"}) is caught and returns 400 'Invalid request data.'

2. 🟡 **Comp-off can be claimed for an arbitrarily old weekend/holiday — no lower date bound and no actual-work verification**  
   `logic` · POST /leave/compoff · _reproduced_ · found by: adversary  
   **Expected:** A comp-off claim should be bounded to a recent window (e.g. the last N days) and, ideally, require corroborating attendance/timesheet on that day, since approval mints a paid compensatory day off (1 CO credit per approved claim, per compOffBalance at attendance.module.ts:781).  
   **Actual:** requestCompOff (attendance.module.ts:790-800) only checks workDate is not in the FUTURE and that the day is a weekend/holiday. Any historical weekend/holiday is accepted with zero work evidence. An employee can farm comp-off credits by submitting a claim for every past weekend/holiday; the only gate is a human reviewer, and the evidence panel would simply be empty (which a busy approver may miss). Contrast LeaveService.create (attendance.module.ts:592) which flatly rejects any entirely-past leave.  
   **Repro:** curl -s -b cookie -H Content-Type:application/json -X POST http://localhost:4000/api/v1/leave/compoff -d '{"workDate":"2020-01-04","reason":"x","projectRef":"PID-1"}'  → HTTP 201, claim created for a Saturday 6.5 years in the past.

3. 🟡 **Reason and Project ID (PID) accept unbounded length; 20,000+ char values stored and broadcast verbatim in notifications to all reviewers**  
   `validation` · POST /leave/compoff · _reproduced_ · found by: adversary  
   **Expected:** reason and projectRef should have sane max lengths (PID especially is meant to be a short id like 'PID-1042' per the UI placeholder). Over-long input should be rejected with 400.  
   **Actual:** No length validation exists (attendance.module.ts:791-792 only trims/checks non-empty). Any authenticated employee can store megabyte-scale text and fan it out into a notification row for each HR/Manager/Yash account — a self-service storage/notification-bloat vector with no rate limit beyond the per-day duplicate guard.  
   **Repro:** POST /leave/compoff with reason and projectRef each 20,007 chars → HTTP 201; DB stores reason len=20007, projectRef len=20007. requestCompOff then notifies every approver (HR + Managers + Yash) with a message embedding the full reason+PID (attendance.module.ts:808-812).

4. 🟡 **Omitting required workDate returns 500 (unhandled TypeError) instead of a clean 400**  
   `validation` · POST /leave/compoff · _reproduced_ · found by: hr  
   **Expected:** Missing mandatory workDate should yield a 400 Bad Request with a clear message, like the other missing-field checks.  
   **Actual:** Server throws an unhandled error and returns a generic 500, leaking that a required field is unguarded.  
   **Repro:** POST /leave/compoff with body {"reason":"QATEST","projectRef":"P1"} (no workDate) → HTTP 500 {"statusCode":500,"message":"Internal server error."}. reason and projectRef are validated first, but workDate is then read via data.workDate.slice(0,10) (attendance.module.ts:793) which throws on undefined.

5. 🟡 **hoursWorked accepts negative, zero, and absurdly large values; a negative-hours claim can be fully approved**  
   `validation` · POST /leave/compoff · _reproduced_ · found by: hr  
   **Expected:** hoursWorked should be constrained to a sane positive range (e.g. >0 and <=24); a negative or zero-hours claim is nonsensical and should not be creditable into a comp-off day.  
   **Actual:** Negative, zero, and 9999 hours are stored and can be approved into a comp-off credit.  
   **Repro:** POST with hoursWorked:-99 → 201 accepted; hoursWorked:0 → 201; hoursWorked:9999 → 201 (no upper bound). A pre-existing claim with hoursWorked:-5 was approved successfully via POST /leave/compoff/:id/approve → status APPROVED. Only wrong-type ("abc") is rejected (400). No numeric range check on hoursWorked in requestCompOff (attendance.module.ts:790-802).

6. 🟡 **No check that the employee actually worked the claimed day — comp-off can be farmed for weekends never worked**  
   `logic` · POST /leave/compoff (requestCompOff, attendance.module.ts:790-800) · _reproduced_ · found by: superadmin  
   **Expected:** Per the stated rule ('a PAST weekend or company holiday the person actually worked'), the claim should require some evidence of work (attendance punch or timesheet) on that day, or at least be flagged.  
   **Actual:** Anyone can submit comp-off claims for any past weekend/holiday with zero work record; approval relies entirely on manual reviewer diligence, and the earned credit becomes a real CO leave day.  
   **Repro:** POST /leave/compoff for a past Saturday with no attendance record and no timesheet for that date → 201 PENDING. requestCompOff only verifies the day is a past non-working day (weekend/holiday); it never queries attendance or timesheet to confirm work happened. The /pending evidence panel confirms this by showing timesheets:[] and attendance:null for such claims.

7. 🟡 **Comp-off accepts a fabricated Project ID (PID) — no validation against any real project**  
   `validation` · POST /leave/compoff (requestCompOff, attendance.module.ts:792) · _reproduced_ · found by: superadmin  
   **Expected:** A mandatory Project ID should be validated to reference a real project (or at least match the PID format), so comp-off claims are traceable/billable — the whole reason a PID is required.  
   **Actual:** Any arbitrary non-empty string is accepted as the PID; the claim persists with a meaningless projectRef.  
   **Repro:** Logged in as Mohit (super admin). POST /leave/compoff {workDate: past Saturday, reason:'QATEST-...', projectRef:'QATEST-PID1'} → 201 created a PENDING claim. 'QATEST-PID1' is not a real Project/PID. Service only does `if (!data?.projectRef?.trim()) throw` (line 792) and stores the raw string; it never looks up the Project.

8. 🟡 **Comp-off can be claimed and approved for a non-working day the employee never actually worked**  
   `domain` · POST /leave/compoff / approveCompOff · _reproduced_ · found by: hr  
   **Expected:** Per the stated rule, workDate must be a day the person actually worked; a claim with no attendance/timesheet evidence should be rejected (or at minimum flagged/blocked at approval).  
   **Actual:** Any past weekend/holiday is claimable with no proof of work; the evidence panel simply shows empty, but nothing prevents claiming or approving unearned paid leave.  
   **Repro:** As HR, POST /leave/compoff {"workDate":"2026-07-18","reason":"QATEST","projectRef":"QATEST-PID-001"} for a past Saturday with zero timesheets/attendance for HR that day → 201 PENDING. A colleague with leave.approve can then approve it, crediting a paid comp-off day. requestCompOff only checks isNonWorkingDay (attendance.module.ts:796) — it never verifies any timesheet or attendance record exists for workDate.

9. 🟡 **POST /leave/compoff returns 500 (not 400) when workDate is missing or non-string**  
   `validation` · POST /leave/compoff — requestCompOff · _reproduced_ · found by: employee  
   **Expected:** A missing or wrong-typed required field should return a clean 400 with a field-level message, like the other required-field checks (reason/projectRef return 400).  
   **Actual:** Service does data.workDate.slice(0,10) (attendance.module.ts:793) before any guard; undefined/number has no .slice → TypeError → 500. Reproduced twice (T7 missing, T9 numeric).  
   **Repro:** As employee, POST /leave/compoff with body {"reason":"x","projectRef":"X"} (no workDate) → HTTP 500 {"statusCode":500,"message":"Internal server error."}. Same with {"workDate":12345,...} (number) → 500. A malformed string like "not-a-date" is handled cleanly (400 "Invalid request data."), so only the absent/wrong-type cases leak a 500.

10. 🟡 **Comp-off is credited for a non-working day the employee never actually worked (no proof-of-work check)**  
   `domain` · requestCompOff eligibility (attendance.module.ts:790-800) · _reproduced_ · found by: employee  
   **Expected:** Task rule states the day must be a past weekend/holiday the person 'actually worked'. Claim should require (or at least flag) real work evidence on that date; otherwise any employee can farm comp-off credits for every past weekend/holiday.  
   **Actual:** isNonWorkingDay() returns true for ALL weekends and holidays regardless of work. Evidence (timesheets/attendance) is only surfaced to the reviewer in pendingCompOffs(); it is never enforced at submit. Mitigated by the approval gate but the integrity check is missing at source.  
   **Repro:** As employee, POST /leave/compoff for 2026-07-12 (a Sunday I had no timesheet or attendance on) → HTTP 201, PENDING claim created. The only eligibility test is isNonWorkingDay() (weekend or org holiday); there is no check that the user has any timesheet/attendance on that date.

11. 🔵 **hoursWorked is stored with no validation — negative and absurdly large values accepted**  
   `data-integrity` · POST /leave/compoff · _reproduced_ · found by: manager  
   **Expected:** hoursWorked, if accepted, should be validated to a sane positive range (e.g. 0<h<=24); negative hours worked is nonsensical and could mislead the reviewing manager who sees this as evidence.  
   **Actual:** Field is Float? in schema (schema.prisma:921) and passed straight through (attendance.module.ts:802) with no bounds check.  
   **Repro:** curl -s -b cookie -X POST .../leave/compoff -d '{"workDate":"2026-07-19","reason":"QATEST","projectRef":"QATEST-P","hoursWorked":-5}' -> 201 with hoursWorked:-5 persisted. Also accepted hoursWorked:100000. (A concurrent claim in the pending queue likewise shows hoursWorked:-8.)

12. 🔵 **projectRef (PID) and reason are length-unbounded — 3000-char PID accepted**  
   `validation` · POST /leave/compoff · _reproduced_ · found by: manager  
   **Expected:** PID should have a reasonable max length; unbounded free text invites storage abuse and breaks the reviewer's queue display.  
   **Actual:** reason and projectRef are unbounded String columns (schema.prisma:917,920); only a non-empty trim() check is applied (attendance.module.ts:791-792).  
   **Repro:** curl -s -b cookie -X POST .../leave/compoff with a 3000-character projectRef (QATEST-XXXX...) -> 201, full value persisted. PID is meant to be a short ref like 'PID-1042' (per the UI placeholder).

13. 🔵 **Comp-off can be claimed and approved for any past weekend/holiday with zero proof of work**  
   `domain` · POST /leave/compoff · _reproduced_ · found by: manager  
   **Expected:** For an IP firm crediting a paid day off, a weekend/holiday comp-off arguably should require some evidence (a timesheet or punch on that date) or at least warn the approver when none exists rather than silently showing null.  
   **Actual:** isNonWorkingDay() only checks the date was a weekend/holiday (attendance.module.ts:762-767); actual work is never required, so credit rests entirely on reviewer diligence with no enforced evidence.  
   **Repro:** Claims created for 2026-07-19/2026-07-12 with no attendance or timesheet on those days succeed (201). The reviewer's evidence payload comes back as {timesheets:[], attendance:null} (observed on the live pending queue). The only automated control is the same-day duplicate guard.

14. 🔵 **Missing or non-string workDate crashes with 500 instead of a clean 400**  
   `validation` · POST /leave/compoff · _reproduced_ · found by: adversary  
   **Expected:** Malformed/missing workDate should return 400 with a helpful message, consistent with the clean 400s returned for missing reason/projectRef and for invalid date strings ("notadate" and "" both return 400 'Invalid request data.').  
   **Actual:** requestCompOff calls data.workDate.slice(0,10) (attendance.module.ts:793) before any type/presence check; a missing or numeric workDate throws a TypeError that surfaces as 500. Inconsistent with sibling validations and leaks an unhandled-error response.  
   **Repro:** POST /leave/compoff -d '{"reason":"x","projectRef":"y"}' (no workDate) → HTTP 500 Internal server error. Also POST -d '{"workDate":12345,"reason":"x","projectRef":"y"}' → HTTP 500.

15. 🔵 **hoursWorked accepts negative and physically-impossible values**  
   `data-integrity` · POST /leave/compoff · _reproduced_ · found by: adversary  
   **Expected:** hoursWorked (if accepted) should be validated to a plausible range (e.g. 0 < h <= 24). Negative or >24 should be rejected.  
   **Actual:** requestCompOff stores data.hoursWorked as-is (attendance.module.ts:802, `hoursWorked: data.hoursWorked ?? null`) with no bounds. It is an API-only field (the web form never sends it), so this is reachable only via direct API, and it does not change the credited amount (approval always mints exactly 1 CO day) — low impact, but corrupt evidence shown to reviewers.  
   **Repro:** POST /leave/compoff -d '{"workDate":"2026-07-12","reason":"x","projectRef":"PID-1","hoursWorked":-99}' → HTTP 201 stored hoursWorked:-99. Same with hoursWorked:99999 → HTTP 201.

16. 🔵 **No cooldown on resubmission after reject/cancel — approver notification spam**  
   `logic` · POST /leave/compoff · _reproduced_ · found by: adversary  
   **Expected:** Re-submitting the same day repeatedly (especially after rejection) should be throttled, or repeat notifications de-duplicated, to avoid letting one employee spam every approver's notification feed.  
   **Actual:** Each resubmit unconditionally notifies compOffApproverIds (attendance.module.ts:808) with no rate limit or repeat guard. Combined with the unbounded reason length, this is a low-effort way to flood reviewers.  
   **Repro:** Create a claim for a day, cancel it (POST /leave/compoff/:id/cancel → 200), then POST /leave/compoff for the same day again → HTTP 201 (a new PENDING claim). The duplicate guard (attendance.module.ts:799) only blocks PENDING/APPROVED, so a rejected/cancelled day can be re-submitted unlimited times, each firing a fresh notification to HR + all Managers + Yash.

17. 🔵 **projectRef (mandatory PID) is unvalidated free text and seeded projects have no code to enter**  
   `data-integrity` · POST /leave/compoff · _reproduced_ · found by: hr  
   **Expected:** A mandatory Project ID should be validated against existing projects (and projects should have a usable PID/code), so comp-off work is traceable to a real engagement — important for an IP firm's billable/matter tracking.  
   **Actual:** Any arbitrary string satisfies the PID requirement; the reference is never linked to a Project, and real projects expose no code to cite.  
   **Repro:** POST with projectRef:"QATEST-PID-001" (not a real project) → 201 accepted; only presence/trim is checked (attendance.module.ts:792). Separately, every seeded project row has an empty code column (SELECT code,title FROM project → code is ''), so no genuine PID string actually exists for a user to reference.

18. 🔵 **No length cap on reason field**  
   `validation` · POST /leave/compoff · _reproduced_ · found by: hr  
   **Expected:** reason should have a reasonable maximum length to protect storage and reviewer-UI rendering.  
   **Actual:** Arbitrarily long reason strings are accepted and persisted.  
   **Repro:** POST with a ~5400-character reason → 201 accepted and stored verbatim (leftover prior-run rows contained multi-thousand-char reasons).

19. 🔵 **Comp-off notification routing (role-name based) diverges from approval authorization (permission based) — a Super Admin approver never gets pinged**  
   `ab-inconsistency` · POST /leave/compoff (notify) vs POST /leave/compoff/:id/approve (authz) · _code-evident_ · found by: manager  
   **Expected:** The set of people notified about a pending comp-off should match the set authorized to act on it (drive both off leave.approve), so no authorized reviewer is blind to the queue.  
   **Actual:** Routing uses a hard-coded role-name+email predicate that differs from the leave.approve permission actually enforced, leaving at least one authorized approver (Super Admin) un-notified.  
   **Repro:** compOffApproverIds() routes the 'Comp-off to review' notification to users whose ROLE NAME is in ('HR','Manager') OR email=yash@squarkip.com (attendance.module.ts:746-758), but the approve/reject/pending endpoints are gated by the leave.approve PERMISSION (lines 1123,1130,1136). DB comparison of the two sets: notify-set = {anant,ankit,hr,nitin,shaveta,yash}; leave.approve-set = {anant,ankit,hr,nitin,shaveta,yash, mohit}. mohit@squarkip.com is Super Admin, holds leave.approve, appears in the pending queue and can approve, but is excluded from every new-claim notification.

20. 🔵 **reason field has no maximum length (10,000-char reason accepted)**  
   `validation` · POST /leave/compoff (requestCompOff, attendance.module.ts:791,802) · _reproduced_ · found by: superadmin  
   **Expected:** reason should have a reasonable max length to prevent storage abuse and UI/notification overflow.  
   **Actual:** Unbounded text is stored verbatim and propagated into notifications.  
   **Repro:** POST /leave/compoff with a 10,000-character reason → 201 created; full text is stored and echoed back in GET /me and the approver's /pending queue (and embedded in the notification message).

21. 🔵 **hoursWorked accepts negative, zero, and absurd values (e.g. -50, 0, 100000)**  
   `validation` · POST /leave/compoff (requestCompOff, attendance.module.ts:802) · _reproduced_ · found by: superadmin  
   **Expected:** hoursWorked should be bounded to a sane positive range (e.g. >0 and <=24) since it is the effort evidence the reviewer weighs.  
   **Actual:** Negative, zero, and impossible (100000) hour values are stored on the claim, corrupting the approver's evidence.  
   **Repro:** POST /leave/compoff with hoursWorked:-50 → 201 (persisted hoursWorked:-50). Same with hoursWorked:0 and hoursWorked:100000 → both 201. A string ('abc') is correctly rejected with 400, but there is no numeric range check. Service stores `data.hoursWorked ?? null` with no lower/upper bound.

22. 🔵 **Comp-off approve/reject are not organization-scoped (latent cross-org IDOR)**  
   `rbac` · POST /leave/compoff/:id/approve, POST /leave/compoff/:id/reject · _code-evident_ · found by: adversary  
   **Expected:** A reviewer holding leave.approve should only be able to act on comp-off claims within their own organization; approving another org's claim should be forbidden/not-found.  
   **Actual:** Any leave.approve holder can approve or reject a comp-off id from a different organization by passing the id directly. Impact is currently latent because the deployment is single-org, but the guard is missing and inconsistent with the org-scoped listing.  
   **Repro:** Code review: approveCompOff (attendance.module.ts:848-852) and rejectCompOff (877-881) look up the claim by id and only assert status===PENDING and req.userId !== actorId. There is NO check that req.organizationId matches the actor's organization, unlike the queue endpoint pendingCompOffs (821-826) which IS org-scoped. Not reproducible from the Employee persona (no leave.approve), so verified in source only.

23. 🔵 **hoursWorked accepts negative and absurd values**  
   `validation` · requestCompOff (attendance.module.ts:790,802) · _reproduced_ · found by: employee  
   **Expected:** hoursWorked should be constrained to a sane range (e.g. 0–24) or rejected when negative.  
   **Actual:** Value is passed straight to Prisma (data.hoursWorked ?? null) with no bounds; negative and 100000 both persisted.  
   **Repro:** POST with hoursWorked:-99 → 201 (stored -99); POST with hoursWorked:100000 → 201. No range/sanity validation on hoursWorked.

24. 🔵 **reason field has no maximum length**  
   `validation` · requestCompOff (attendance.module.ts:791,802) · _reproduced_ · found by: employee  
   **Expected:** A reasonable max length (e.g. 500–1000 chars) to prevent storage/UI abuse, consistent with other free-text fields.  
   **Actual:** Only a non-empty trim() check exists; arbitrarily long text is accepted and persisted.  
   **Repro:** POST with a 20,000-character reason (QATEST + 'A'*20000) → HTTP 201, full string stored.

25. 🔵 **Mandatory projectRef (PID) accepts any free-text string — not validated against real projects**  
   `validation` · requestCompOff (attendance.module.ts:792,802) · _reproduced_ · found by: employee  
   **Expected:** The 'Project ID (PID) is required' rule implies a real project reference; a bogus PID should be rejected or resolved against Project.id/code.  
   **Actual:** Any non-empty string satisfies the PID requirement; reviewers see an unverifiable PID in the notification.  
   **Repro:** POST /leave/compoff with projectRef "TOTALLY-FAKE-PID" (and separately "X") → HTTP 201, stored verbatim. The rule only enforces non-empty (data.projectRef.trim()).

26. 🔵 **No lower bound on comp-off work date — claims for weekends years in the past are eligible**  
   `domain` · requestCompOff (attendance.module.ts:793-798) · _code-evident_ · found by: employee  
   **Expected:** Comp-off should have a reasonable claim window (e.g. within the current/prior month or a configurable N days), matching real HR policy for an IP firm.  
   **Actual:** Any past weekend/holiday, however old, is accepted; combined with the missing proof-of-work check this allows back-dated credit farming.  
   **Repro:** Code only rejects future dates (workDate > today) and non-weekend/non-holiday days; there is no earliest-date/recency window. Observed pre-existing PENDING claims in DB for 2018-01-06, 2020-01-04/05/11 for this user, confirming ancient dates pass eligibility.

27. ⚪ **Manager comp-off approval is org-wide with no team scoping — a Manager can approve claims of peers and more-senior staff**  
   `rbac` · GET /leave/compoff/pending, POST /leave/compoff/:id/approve · _code-evident_ · found by: manager  
   **Expected:** For 'team oversight', consider scoping a Manager's queue/approvals to their reports; at minimum this org-wide breadth should be an intentional, documented decision.  
   **Actual:** The only granted scope is the org-wide leave.approve permission — there is no team-level restriction, so 'act within scope' == whole organization. Behaviour is within the granted permission (not a privilege escalation), reported as a scope/design observation.  
   **Repro:** As manager, GET /leave/compoff/pending returns EVERY pending claim in the org (pendingCompOffs filters only by organizationId+status, attendance.module.ts:821-826). approveCompOff only checks status!=PENDING and self-review (lines 851-852); no relationship between reviewer and claimant is required. A Manager could thus approve the Super Admin's or another Manager's comp-off.

28. ⚪ **No lower bound on how old a claimed workDate may be**  
   `domain` · POST /leave/compoff · _code-evident_ · found by: hr  
   **Expected:** Comp-off claims should typically be time-bounded (e.g. within N days of the worked day) to prevent stale/retroactive credits.  
   **Actual:** Any arbitrarily old past non-working day can be claimed.  
   **Repro:** POST with workDate:"2026-06-20" (a month prior) → 201 accepted; only the future check exists (attendance.module.ts:794). Nothing prevents claiming comp-off for a weekend from months or years ago.

29. ⚪ **approve/reject comp-off does not verify the request belongs to the actor's organization (latent cross-org gap)**  
   `rbac` · POST /leave/compoff/:id/approve, /reject · _code-evident_ · found by: manager  
   **Expected:** Mutations should confirm the target request is in the actor's organization (defense-in-depth for any future multi-tenant deployment).  
   **Actual:** Org membership is not checked on the approve/reject id lookup.  
   **Repro:** approveCompOff()/rejectCompOff() do prisma.compOffRequest.findUnique({where:{id}}) and check only status and self-review (attendance.module.ts:848-852, 877-881); they never compare req.organizationId to the actor's org, unlike the pending queue which is org-scoped. No cross-org impact in this single-org deployment, so not reproducible here.


### wfh  (20 unique — 🟠1 🟡7 🔵11 ⚪1)

1. 🟠 **Cancelling an APPROVED WFH leaves a stale 'Working from home' event on the shared calendar**  
   `data-integrity` · AttendanceService.cancelWfh (attendance.module.ts:412-419) vs approveWfh:375-382 · _reproduced_ · found by: hr  
   **Expected:** Cancelling an approved WFH should also remove (or hide) the corresponding calendar event so the org/HR presence view is accurate.  
   **Actual:** cancelWfh only flips status to CANCELLED; it never deletes the calendarEvent that approveWfh created. The person still shows as 'Working from home' to everyone on those dates despite having cancelled — HR/managers see false presence.  
   **Repro:** As Arjun (employee) POST /attendance/wfh {2026-08-25..26}. As HR POST /attendance/wfh/<id>/approve -> a calendar_event 'Arjun Ghosh — Working from home' (type=WFH) is created (verified id cmru70g9i016kcpko8fwtfg4z). As owner POST /attendance/wfh/<id>/cancel -> request.status=CANCELLED (201) but the calendar_event row is STILL present (verified by DB select after cancel).

2. 🟡 **Missing startDate/endDate in WFH request returns 500 Internal Server Error instead of a clean 400**  
   `validation` · AttendanceService.requestWfh (attendance.module.ts:300-301) · _reproduced_ · found by: hr  
   **Expected:** Missing required field should yield a clean 400 with a helpful message (as empty-reason, past-date, end<start, >31-days, and malformed-date all correctly do).  
   **Actual:** reason is validated first, but startDate/endDate are used via data.startDate.slice(0,10) before any null check, so an absent field throws a TypeError surfaced as a 500. Inconsistent with every other validation path on this same endpoint.  
   **Repro:** POST /attendance/wfh with a valid reason but no startDate: {"reason":"QATEST-x","endDate":"2026-08-05"} -> {"statusCode":500,"message":"Internal server error."} [500].

3. 🟡 **Missing or wrong-type startDate/endDate returns HTTP 500 instead of a clean 400**  
   `validation` · POST /attendance/wfh · _reproduced_ · found by: manager  
   **Expected:** Missing/invalid required field should return 400 with a clear message (as it does for a malformed date string, which correctly returns 400 'Invalid request data.').  
   **Actual:** Returns {"statusCode":500,"message":"Internal server error."}. Cause: requestWfh does data.startDate.slice(0,10) with no presence/type guard (attendance.module.ts:300-301), so undefined/number throws TypeError before validation. reason is checked first (returns 400), so only date fields leak the 500.  
   **Repro:** As any authenticated user, POST /attendance/wfh with a valid reason but (a) no startDate, (b) no endDate, or (c) numeric dates: {"endDate":"2026-08-10","reason":"x"} => 500; {"startDate":123,"endDate":456,"reason":"x"} => 500; {"startDate":"2026-08-10","reason":"x"} => 500.

4. 🟡 **WFH reason field has no maximum length — 5000+ (observed 72000) chars accepted and stored**  
   `validation` · POST /attendance/wfh · _reproduced_ · found by: manager  
   **Expected:** reason should be capped at a sane length (e.g. a few hundred/thousand chars) to prevent oversized payloads and storage bloat, consistent with typical text-field limits.  
   **Actual:** requestWfh only checks reason is non-empty (attendance.module.ts:299); no upper bound. Arbitrary-length reasons are accepted and written to wfh_request.reason.  
   **Repro:** POST /attendance/wfh with reason of 5000 'X' chars => 201 Created and full string persisted. DB inspection also showed a prior request with a 72000-char reason stored.

5. 🟡 **POST /attendance/wfh returns HTTP 500 when a date field is missing or wrong type**  
   `validation` · POST /attendance/wfh (AttendanceService.requestWfh) · _reproduced_ · found by: employee  
   **Expected:** A clean 400 Bad Request naming the missing/invalid field, like the module's other validation branches (missing reason, past date, overlap all return 400).  
   **Actual:** 500 Internal server error. Root cause (attendance.module.ts:300-301): requestWfh calls data.startDate.slice(0,10) / data.endDate.slice(...) with no DTO validation, so undefined/number throws a TypeError that surfaces as 500. Note the inconsistency: a malformed date STRING ("not-a-date") is caught and returned as 400 "Invalid request data.", but a missing/wrong-type field is not.  
   **Repro:** As employee, POST /attendance/wfh with body {"endDate":"2026-08-20","reason":"x"} (no startDate) -> HTTP 500 {"statusCode":500,"message":"Internal server error."}. Same for missing endDate ({"startDate":"2026-08-28","reason":"x"} -> 500) and for a numeric date ({"startDate":12345,"endDate":"2026-08-25","reason":"x"} -> 500).

6. 🟡 **Missing or wrong-typed body fields cause HTTP 500 instead of a clean 400**  
   `validation` · POST /attendance/wfh (AttendanceService.requestWfh, attendance.module.ts:298-300) · _reproduced_ · found by: adversary  
   **Expected:** Missing required field or wrong-typed field should return 400 Bad Request with a validation message, like the other checks do.  
   **Actual:** Request handler has no DTO validation; requestWfh does data.startDate.slice(0,10) (throws TypeError when undefined) and data.reason.trim() (throws when reason is a number), surfacing as an unhandled 500.  
   **Repro:** As khushi.gupta, POST /attendance/wfh with body {"endDate":"2026-07-25","reason":"x"} (no startDate) -> HTTP 500 {"message":"Internal server error."}. Also POST with {"startDate":"2026-08-05","endDate":"2026-08-05","reason":12345} (numeric reason) -> HTTP 500.

7. 🟡 **Leave can be booked over an already-APPROVED WFH day (asymmetric double-booking)**  
   `ab-inconsistency` · POST /attendance/wfh vs leave create · _code-evident_ · found by: manager  
   **Expected:** The two mutually-exclusive states should be guarded symmetrically: if WFH blocks overlapping approved leave, leave creation should likewise block overlapping approved/pending WFH.  
   **Actual:** Only one direction is guarded; the leave flow ignores WFH, permitting a day to be simultaneously WFH and leave (which then contradicts the punch-time workMode derivation).  
   **Repro:** WFH creation rejects overlap with approved leave (attendance.module.ts:313-316). The leave create() path (attendance.module.ts:587-614) checks overlap only against other leave requests (596-599); it does NOT check wfh_request. So an approved WFH day can still receive an approved leave, leaving a day marked both 'working from home' and 'on leave'.

8. 🟡 **Cancelling an approved WFH request leaves the shared-calendar 'Working from home' event behind**  
   `data-integrity` · apps/api/src/modules/attendance/attendance.module.ts:412 · _reproduced_ · found by: superadmin  
   **Expected:** cancelWfh should delete/void the calendar_event it created on approval, so the team calendar no longer shows the person working from home on days that were cancelled.  
   **Actual:** cancelWfh (lines 412-419) only sets status='CANCELLED'; it never removes the calendarEvent created by approveWfh. The stale 'Working from home' entry persists on the org calendar indefinitely, misrepresenting where the person is. rejectWfh is unaffected (event is only created on approval), but a cancel-after-approve is a real flow the code explicitly supports (comment line 416).  
   **Repro:** anant creates WFH 2026-08-05..06; mohit approves it (approveWfh creates a calendarEvent titled 'Anant Gupta — Working from home', line 375-381); anant then POST /wfh/:id/cancel -> status CANCELLED (HTTP 200). DB check: SELECT FROM calendar_event WHERE type='WFH' still returns the event id cmru70hgp0172cpkohznl6rcr (2026-08-05) after cancellation.

9. 🔵 **WFH reason has no maximum length — 6000+ character reason accepted and persisted**  
   `validation` · AttendanceService.requestWfh (attendance.module.ts:299-320) · _reproduced_ · found by: hr  
   **Expected:** A sane upper bound (e.g. a few hundred chars) on a free-text reason, consistent with other request forms, to prevent bloat/abuse.  
   **Actual:** Only a non-empty (trimmed) check exists; arbitrarily long reasons are stored verbatim.  
   **Repro:** POST /attendance/wfh with a ~6000-char reason -> 201; DB shows wfh_request.reason length=6007.

10. 🔵 **WFH-vs-leave overlap check only considers APPROVED leave, not PENDING leave**  
   `ab-inconsistency` · POST /attendance/wfh · _code-evident_ · found by: manager  
   **Expected:** Consistent overlap semantics: a pending leave on the same day should also be considered when accepting a WFH request (or the inconsistency documented).  
   **Actual:** A WFH request is accepted even when a PENDING leave already covers the same dates; the conflict only surfaces if/when that leave is approved.  
   **Repro:** requestWfh's leave-clash query uses status:'APPROVED' only (attendance.module.ts:313-314), whereas the WFH-vs-WFH clash and the leave flow's own clash both use status IN ('PENDING','APPROVED').

11. 🔵 **WFH can be requested for weekend/holiday-only ranges (no working-day eligibility check)**  
   `domain` · POST /attendance/wfh (requestWfh) · _reproduced_ · found by: adversary  
   **Expected:** WFH on a non-working day (weekend/holiday) is meaningless since those days are already off; ideally rejected or at least ignored, consistent with comp-off/leave eligibility handling.  
   **Actual:** Any date range is accepted regardless of whether it contains working days.  
   **Repro:** As khushi.gupta, POST /attendance/wfh {"startDate":"2026-08-02","endDate":"2026-08-02",...} (2026-08-02 is a Sunday) -> HTTP 201 PENDING. No check that the range contains any working day.

12. 🔵 **WFH reason has no length cap — 20,000+ character reason accepted**  
   `validation` · POST /attendance/wfh (requestWfh, attendance.module.ts:299,320) · _reproduced_ · found by: adversary  
   **Expected:** A sane max length (e.g. 500-1000 chars) rejected with 400.  
   **Actual:** Only a non-empty check exists; arbitrarily large reason strings are persisted, enabling storage bloat / abuse.  
   **Repro:** As khushi.gupta, POST /attendance/wfh with reason = 20,400 chars of 'QATEST' -> HTTP 201, row stored in full (reason column is unbounded text).

13. 🔵 **Invalid calendar date is silently coerced instead of rejected**  
   `data-integrity` · POST /attendance/wfh date parsing (parseDay) · _reproduced_ · found by: employee  
   **Expected:** Reject nonsensical calendar dates as 400 rather than silently rolling them to a different day.  
   **Actual:** parseDay(s) = new Date(`${s}T00:00:00.000Z`) (attendance.module.ts:14) relies on JS Date coercion with no calendar-validity check; the stored WFH dates can differ from what the user submitted.  
   **Repro:** POST /attendance/wfh with startDate/endDate "2026-02-30" -> parseDay wraps it in new Date(); JS rolls it to a real date (early March) rather than erroring. Here it happened to be caught by the past-date guard (400), but a future invalid date (e.g. "2026-13-40"-style rollovers) would be silently shifted to a valid day and accepted.

14. 🔵 **No maximum length on WFH reason — arbitrarily large text accepted and stored**  
   `validation` · POST /attendance/wfh reason field · _reproduced_ · found by: employee  
   **Expected:** A sane upper bound (e.g. a few hundred/thousand chars) returning 400 when exceeded, to protect storage and the reviewer UI.  
   **Actual:** requestWfh only checks reason is non-empty (attendance.module.ts:299); no max length, so unbounded text is persisted and later rendered to HR/Admin in the pending queue and notification message.  
   **Repro:** POST /attendance/wfh with reason of ~14,000 characters -> HTTP 201, request created and stored in full.

15. 🔵 **A/B inconsistency: malformed date returns 400 but missing/wrong-typed fields return 500**  
   `ab-inconsistency` · POST /attendance/wfh validation path · _reproduced_ · found by: adversary  
   **Expected:** All malformed input on the same endpoint should map to 400 consistently.  
   **Actual:** Malformed-but-present date strings are caught as 400, while absent/wrong-typed fields escape as 500 — inconsistent error surface for equivalent bad input.  
   **Repro:** POST with {"startDate":"notadate","endDate":"notadate","reason":"x"} -> clean 400 {"message":"Invalid request data."}; but POST omitting startDate or sending numeric reason -> 500. Sibling validations (empty reason, past date, reversed dates, >31 days) all return clean 400s.

16. 🔵 **approveWfh/rejectWfh lack an org-scope check (by-id lookup), unlike the org-scoped pending queue**  
   `rbac` · POST /attendance/wfh/:id/approve|reject · _code-evident_ · found by: manager  
   **Expected:** A reviewer should only be able to action requests within their own organization; the by-id endpoints should verify req.organizationId matches the actor's org, matching the pending-queue scoping.  
   **Actual:** No org match is enforced on approve/reject. Moot in the current single-org deployment, but a cross-tenant approval gap if multi-org is ever enabled.  
   **Repro:** pendingWfhRequests filters by the reviewer's organizationId (attendance.module.ts:343-349), but approveWfh (352-356) and rejectWfh (393-397) fetch the request by id with no organizationId comparison against the actor. Guards only enforce attendance.manage + not-own-request.

17. 🔵 **approve/reject WFH not scoped to reviewer's organization**  
   `rbac` · approveWfh/rejectWfh (attendance.module.ts:352-353,393-394) · _code-evident_ · found by: adversary  
   **Expected:** Reviewer actions should verify req.organizationId matches the actor's org before mutating.  
   **Actual:** No org scoping on the review mutations; relies solely on the app being single-org.  
   **Repro:** Code review: approveWfh/rejectWfh do prisma.wfhRequest.findUnique({where:{id}}) with no organizationId filter, unlike pendingWfhRequests which scopes to the reviewer's org. A holder of attendance.manage in a different org could approve/reject another org's request by id. Not reproducible on this single-org deployment.

18. 🔵 **No maximum length on WFH reason — 21,000-character reason accepted and stored**  
   `validation` · apps/api/src/modules/attendance/attendance.module.ts:299 · _reproduced_ · found by: superadmin  
   **Expected:** reason should have a sane upper bound (e.g. a few hundred/thousand chars) returning 400 when exceeded, consistent with a short free-text justification field.  
   **Actual:** requestWfh only checks reason is non-empty after trim; there is no max-length cap, allowing arbitrarily large payloads to be stored (minor DoS / storage-bloat / UI-overflow surface). Sibling free-text fields elsewhere should be compared for consistency.  
   **Repro:** As mohit: POST /attendance/wfh with a reason of ~21,000 chars (printf 'QATEST-' x3000) -> HTTP 201, request created (id cmru702om015rcpko7v1rfcx4) with the full oversized reason persisted.

19. 🔵 **POST /attendance/wfh returns 500 (not 400) when startDate/endDate is missing or a non-string type**  
   `validation` · apps/api/src/modules/attendance/attendance.module.ts:300 · _reproduced_ · found by: superadmin  
   **Expected:** A missing or wrong-typed startDate/endDate should be rejected with a clean 400 'startDate is required' / validation error, like the empty-reason path returns.  
   **Actual:** requestWfh calls data.startDate.slice(0,10) with no presence/type guard, so a missing or non-string date throws a TypeError -> generic 500. The empty-reason and missing-reason cases (line 299) are handled with 400, but the date fields are not, so the DTO validation is inconsistent within the same endpoint.  
   **Repro:** As mohit (super admin): curl -b cookie -X POST /api/v1/attendance/wfh -d '{"endDate":"2026-08-20","reason":"QATEST-x"}' -> HTTP 500 {"statusCode":500,"message":"Internal server error."}. Same with numeric dates: -d '{"startDate":123,"endDate":456,"reason":"QATEST-num"}' -> HTTP 500.

20. ⚪ **Cancel endpoint leaks request existence: 404 for unknown id vs 403 for another user's id**  
   `rbac` · POST /attendance/wfh/:id/cancel · _reproduced_ · found by: employee  
   **Expected:** Uniform response (e.g. 404 in both cases) to avoid an id-enumeration oracle.  
   **Actual:** cancelWfh looks up the row first (404 if absent) then checks ownership (403), so existence is observable. Low impact since ids are cuids and no data is exposed.  
   **Repro:** Cancel a non-existent id -> 404 "WFH request not found"; cancel another user's real id -> 403 "You can only cancel your own WFH requests." The differing responses let an employee distinguish real request ids from fake ones.


### timesheets  (29 unique — 🟠2 🟡13 🔵13 ⚪1)

1. 🟠 **Project timesheet view (?projectId=) leaks all members' entries with no membership/ownership guard**  
   `rbac` · GET /timesheets?projectId= · _reproduced_ · found by: employee  
   **Expected:** Project-scoped timesheet reads should require project membership or an org-wide reporting permission; otherwise 403 or restrict to caller's own entries, mirroring the ?userId= path.  
   **Actual:** Any authenticated employee can enumerate any project's full timesheet ledger (per-person billable hours and free-text notes) with no membership check. The sibling ?userId= path is strictly own-only (403 for others), making this an inconsistent confidentiality leak - sensitive for an IP firm where per-person billable hours are confidential.  
   **Repro:** As employee Ajay (not a member of, and with zero entries in, project cmqze4krw00exsjsu2jy9yrpy) call GET /api/v1/timesheets?projectId=cmqze4krw00exsjsu2jy9yrpy. Returns 200 with 299 entries across 10 distinct OTHER users (incl. management Mohit Kalra, Arjun Ghosh, HR Admin), each exposing hoursLogged, billable flag, and notes.

2. 🟠 **Future-dated timesheets accepted — billable hours can be logged for dates that have not occurred**  
   `data-integrity` · POST /timesheets (dto.ts date @IsDateString only) · _reproduced_ · found by: manager  
   **Expected:** Time entries dated in the future should be rejected (or at least flagged), since you cannot bill or credit work not yet performed. An IP firm billing client patent work on future dates is a real revenue-integrity risk.  
   **Actual:** Any future date is accepted silently as a normal billable entry and inflates task actual hours.  
   **Repro:** POST /timesheets {taskId, date:"2027-12-31", hoursLogged:8, notes:"QATEST-future"} -> 201 Created, billable:true, entry stored with date 2027-12-31. No upper bound on date. The 8h also flow into Task.actualHours (recomputeTaskActualHours) which feeds capacity/performance.

3. 🟡 **Employee cannot delete their own timesheet (Employee role lacks timesheet.delete)**  
   `ab-inconsistency` · DELETE /timesheets/:id · _reproduced_ · found by: employee  
   **Expected:** An owner who can create and edit a timesheet should be able to delete an erroneous one (endpoint contract is owner-or-SuperAdmin). Employee role should carry timesheet.delete, or delete should be gated by ownership like update.  
   **Actual:** The permission gate fires before any ownership check, so an employee can never delete a mistaken entry themselves - they must ask a Super Admin. Inconsistent with update, which they are permitted.  
   **Repro:** As employee, DELETE /api/v1/timesheets/<my own entry id> returns 403 {message: 'Missing permission: timesheet.delete'}. The same user CAN create (201) and update (200) that same entry.

4. 🟡 **Self-scope on ?userId is bypassable via ?projectId — project view exposes every user's entries + billable flags with no ownership/relationship check**  
   `ab-inconsistency` · GET /timesheets (listForProject vs listForUser) · _reproduced_ · found by: hr  
   **Expected:** If a user may only read their own entries via ?userId, the project view should apply an equivalent authorization boundary (e.g. require project membership / a distinct broader permission), so the self-scope control cannot be trivially bypassed by adding a projectId.  
   **Actual:** Any holder of timesheet.view can read all users' logged hours and billable flags for any project by querying ?projectId; the ?userId self-restriction is defeated by supplying projectId (which takes precedence when both are present).  
   **Repro:** As hr@squarkip.com: GET /timesheets?userId=<Mohit> -> 403 'You can only manage your own timesheets.' But GET /timesheets?projectId=cmqze4krw00exsjsu2jy9yrpy -> 200 returning Mohit's and Yash's rows including userId, hoursLogged and billable. GET /timesheets?projectId=...&userId=<Mohit> -> 200 (projectId wins, userId self-scope ignored). timesheets.service.ts listForProject (line 51) applies no actor check while listForUser (line 75-78) enforces assertOwnerOrPrivileged.

5. 🟡 **listForProject applies no project-membership gate - full timesheet ledger readable by any timesheet.view holder**  
   `rbac` · GET /timesheets?projectId (timesheets.service.ts:51-73) · _code-evident_ · found by: superadmin  
   **Expected:** Timesheet ledger of a project should be gated to project members / privileged roles; a deliberate membership gate should exist for the project view as it does for the per-user view (which is self-scoped unless SuperAdmin).  
   **Actual:** Zero membership scoping: any principal with timesheet.view can enumerate any project's complete time+billing ledger by supplying its id. Correct for a super admin, but the absence of any gate over-exposes lower-privileged viewers. Confirmed live as superadmin (296 rows incl. other users' notes); cross-role exposure inferred from code.  
   **Repro:** GET /timesheets?projectId=<any project id> returns all 296 non-deleted entries for that project including every user's notes and billable flags. The service only requires timesheet.view; it never checks that the caller is a member of the project, nor that the project exists (nonexistent id just returns []).

6. 🟡 **Project timesheet view (?projectId) has no membership check — any user reads all colleagues' hours/billable/notes on projects they're not on**  
   `rbac` · GET /timesheets?projectId — TimesheetsService.listForProject (timesheets.service.ts:51-73) · _reproduced_ · found by: adversary  
   **Expected:** Project time view should be restricted to project members (or a management permission), consistent with the tightly guarded user-scoped read which returns 403 'You can only manage your own timesheets.' for anyone else's userId.  
   **Actual:** listForProject only requires timesheet.view and performs NO membership/ownership check — it unions and returns every user's task + issue entries for the given projectId. Horizontal information disclosure of colleagues' billable hours and free-text notes across the whole org.  
   **Repro:** As Khushi Gupta (Senior Research Associate, NOT a member of project cmqze4kuu00jqsjsun73zav17): curl -b cookie 'http://localhost:4000/api/v1/timesheets?projectId=cmqze4kuu00jqsjsun73zav17' returns [200] with 218 entries from 7 different colleagues (Meetu Singh, Mohit Kalra, Neha Shukla, etc.), each exposing userId, hoursLogged, billable flag and notes.

7. 🟡 **Project time view exposes every user's entries (hours, billable flag, notes) with no project-membership check, while ?userId=other is 403**  
   `ab-inconsistency` · GET /timesheets?projectId — listForProject vs listForUser · _reproduced_ · found by: manager  
   **Expected:** Consistent boundary: if a user is blocked from reading another user's entries directly, the project view should be limited to projects they can access. Currently any timesheet.view holder can enumerate the full time log (with notes) of any project in the org via one query.  
   **Actual:** Per-user read is denied but the same per-user data is fully readable through the unfiltered project view.  
   **Repro:** GET ?userId=<other user> -> 403 'You can only manage your own timesheets.' But GET ?projectId=cmqze4krw00exsjsu2jy9yrpy -> 200 returning 297 entries across 9 distinct users (Mohit, Vijay, Meetu, Ketan, ...) including their notes and per-entry billable flags. listForProject applies NO check that the actor belongs to the project.

8. 🟡 **Future-dated timesheets accepted — no upper bound on date, inflates Task.actualHours and time reports**  
   `validation` · POST /timesheets (CreateTimesheetDto.date) · _reproduced_ · found by: hr  
   **Expected:** Timesheet date should not be in the future (a person cannot have worked hours on a future date); reject or cap at today.  
   **Actual:** An arbitrary future date is accepted and counted toward actual hours, corrupting effort/utilization reporting.  
   **Repro:** POST {taskId, date:'2027-12-31', hoursLogged:2} as HR -> 201 created with date 2027-12-31 and it is summed into Task.actualHours by recomputeTaskActualHours. Only ISO-8601 format is validated; no max/today bound.

9. 🟡 **Duplicate identical timesheet entries allowed with no dedup or warning (double-billing risk)**  
   `domain` · POST /timesheets (create) · _reproduced_ · found by: manager  
   **Expected:** A same-user, same-task, same-date duplicate should be blocked or warned; identical re-submits are a common double-count / double-bill source.  
   **Actual:** Both entries persist and both contribute to Task.actualHours, doubling the logged time.  
   **Repro:** POST the same {taskId, date:"2026-07-09", hoursLogged:3} twice in a row -> both return 201 with distinct ids. No uniqueness/overlap check on (user, task, date).

10. 🟡 **Time can be logged for arbitrary future dates (no upper date bound)**  
   `validation` · POST /timesheets (create) / dto.ts date field · _reproduced_ · found by: superadmin  
   **Expected:** An IP firm timesheet cannot record work performed in the future; the API should reject dates after today (as attendance/leave sibling flows constrain their dates).  
   **Actual:** Future-dated timesheet accepted and counts toward Task.actualHours. Enables inflating/pre-booking billable hours for dates not yet worked.  
   **Repro:** POST /timesheets {taskId, date:"2030-01-01", hoursLogged:2} as mohit@squarkip.com -> 201 Created, entry stored with date 2030-01-01T00:00:00Z. @IsDateString only checks format, nothing rejects a date years in the future.

11. 🟡 **Any user can log time against tasks they are not assigned to / projects they are not a member of**  
   `rbac` · POST /timesheets (create) — no assignment/membership check · _reproduced_ · found by: manager  
   **Expected:** Logging time should be restricted to tasks the actor is assigned to (or at least a member of the project), otherwise anyone can inflate any project's actualHours and billable totals.  
   **Actual:** Time is accepted against arbitrary org tasks, silently increasing that task's actualHours and the project's billable time.  
   **Repro:** As an intern-designation actor, POST {taskId:"cmqze4ks900fesjsuvyrkuu6i" (a task in a project I am not assigned to), date, hoursLogged:2} -> 201 Created. create() only checks the task exists (task.findFirst), never that the actor is assigned to the task or a member of its project.

12. 🟡 **Future-dated timesheets accepted with no upper date bound**  
   `validation` · POST /timesheets (date) · _reproduced_ · found by: employee  
   **Expected:** Reject dates beyond today for work actually performed; time tracking is retrospective.  
   **Actual:** Entries dated years in the future are accepted, inflating task.actualHours and future capacity/billable projections with fictional work.  
   **Repro:** POST {taskId:<mine>, date:'2030-01-01', hoursLogged:8} returns 201 and persists; it also appears in my own ?userId= list.

13. 🟡 **Employee can log time against tasks they are not assigned to, in projects they don't belong to**  
   `domain` · POST /timesheets (taskId) · _reproduced_ · found by: employee  
   **Expected:** Logging time should require task assignment or project membership so a user cannot alter arbitrary tasks' actualHours.  
   **Actual:** Any employee can add billable hours to any task in the org, silently inflating that task's actualHours and its project progress/billable rollups.  
   **Repro:** POST {taskId:'cmqze4ky400p4sjsuqnbg1r4x' (Quarterly practice OKR planning, not assigned to Ajay, project he is not a member of), date, hoursLogged:1} returns 201.

14. 🟡 **No date bounds on timesheet create — far-future (year 3000) and far-past (1990) entries accepted**  
   `validation` · POST /timesheets — CreateTimesheetDto.date (dto.ts:14, only @IsDateString) · _reproduced_ · found by: adversary  
   **Expected:** Reject dates outside a sane range (e.g. no future dates, no dates before the project/employment start). Logging billable time in the year 3000 or 1990 is nonsensical.  
   **Actual:** Only ISO-format is validated; any parseable date is accepted and folds into Task.actualHours, corrupting reporting/billing.  
   **Repro:** POST /timesheets {"taskId":"cmqze4ksn00fwsjsuekrx31va","date":"3000-01-01","hoursLogged":2} → 201 created (date 3000-01-01). Also date "1990-01-01" → 201.

15. 🟡 **No per-day hours cap and no duplicate detection — 40h logged on one task on one day, identical entries created twice**  
   `domain` · POST /timesheets — TimesheetsService.create (timesheets.service.ts:87-119) · _reproduced_ · found by: adversary  
   **Expected:** Per-day total should be capped near 24h, and identical duplicate submits should be de-duplicated or warned. Otherwise billable revenue and Task.actualHours can be inflated arbitrarily.  
   **Actual:** Per-entry cap is 0.25..24 but there is no aggregate/day check and no duplicate guard; a user can log unlimited billable hours per day.  
   **Repro:** Three POSTs for same task cmqze4ksn00fwsjsuekrx31va, same date 2026-07-11, hours 8 + 8 + 24 = 40h, all [201]. First two are byte-identical (same task/date/hours/notes) and both created.

16. 🔵 **Asymmetric CRUD grant for HR: can create and edit own timesheets but cannot delete even own entries**  
   `ab-inconsistency` · DELETE /timesheets/:id (timesheet.delete permission) · _reproduced_ · found by: hr  
   **Expected:** Consistent self-service CRUD — if a user can log and freely edit (hours/billable/notes) their own entry they should be able to remove an erroneous one; or, if entries are meant to be immutable billing records, editing should be locked down too. Current split leaves users unable to fix a mistaken entry without a Super Admin.  
   **Actual:** HR can create/edit own timesheets but must escalate to a Super Admin to delete any, including their own mistaken entry.  
   **Repro:** As HR: POST create -> 201, PATCH own {billable:false} -> 200, but DELETE own entry -> 403 'Missing permission: timesheet.delete'. HR holds timesheet.view/create/update but not timesheet.delete.

17. 🔵 **Manager persona can create and edit own timesheets but cannot delete them (no timesheet.delete grant)**  
   `ab-inconsistency` · DELETE /timesheets/:id — permission scope · _reproduced_ · found by: manager  
   **Expected:** A user who can log and edit their own time should be able to remove a mistaken own entry; splitting update from delete forces edit-to-zero workarounds (which min 0.25 also blocks).  
   **Actual:** Own erroneous entries cannot be deleted at all through the API by this role.  
   **Repro:** DELETE own entry -> 403 'Missing permission: timesheet.delete'. DELETE other's -> also 403 'Missing permission: timesheet.delete' (blocked at guard before ownership). Yet POST (create) and PATCH (update) on own entries succeed. So this role has create+update+view but not delete.

18. 🔵 **RBAC CRUD inconsistency — Senior Research Associate can create and edit their own timesheet hours but cannot delete even their own entry**  
   `ab-inconsistency` · DELETE /timesheets/:id — timesheet.delete permission grant · _reproduced_ · found by: adversary  
   **Expected:** Consistent self-service CRUD: a user who may create and edit their own entries should be able to delete a mislogged one (or, if immutability is intended, editing hours should likewise be restricted).  
   **Actual:** A user can freely rewrite an entry's hours via PATCH but cannot remove it, so a wrongly-created entry can never be deleted by its owner — only overwritten. Possibly intentional (audit immutability) but inconsistent with the update grant.  
   **Repro:** As Khushi (has timesheet.view/create/update, NOT timesheet.delete): PATCH own entry reaches the service (hits value validation, i.e. authorized); DELETE own entry cmru74hki... → 403 'Missing permission: timesheet.delete'.

19. 🔵 **Issue-raised (non-billable) entries can be flipped to billable via PATCH**  
   `data-integrity` · PATCH /timesheets/:id (timesheets.service.ts:121-137) · _code-evident_ · found by: superadmin  
   **Expected:** Issue/technical-issue time is defined as always non-billable; the API should refuse to set billable=true on an entry whose taskId is null (issueId set).  
   **Actual:** No guard - a super admin or the owner can set an issue entry billable, corrupting the 'issue time is non-billable' invariant and billable totals.  
   **Repro:** update() writes data.billable = dto.billable with no guard that the entry is task-backed. An issue-raised entry (invariant per schema/spec: taskId null, non-billable) has no protection against PATCH {billable:true}. Could not exercise live because seed data has no issue entries and the create endpoint only produces task entries, so verified by code inspection.

20. 🔵 **No duplicate-entry detection - identical task+date+hours logged repeatedly**  
   `data-integrity` · POST /timesheets · _reproduced_ · found by: employee  
   **Expected:** Warn on or block obviously duplicated entries (same task, date, hours) to prevent accidental double-billing.  
   **Actual:** Duplicates are accepted silently, allowing inadvertent inflation of billable hours.  
   **Repro:** Two identical POSTs {taskId:<mine>, date:'2026-07-20', hoursLogged:2.5} both return 201 with distinct ids.

21. 🔵 **Far-past dates accepted with no lower bound (e.g. year 2001)**  
   `validation` · POST /timesheets (date) · _reproduced_ · found by: manager  
   **Expected:** Backdated entries should be bounded (e.g. within an open period / employment date); combined with no period-lock this allows editing already-reported/billed time indefinitely.  
   **Actual:** Any past date is accepted as a normal entry.  
   **Repro:** POST {date:"2001-01-01", hoursLogged:8} -> 201 Created. No lower bound / no lock on historical periods.

22. 🔵 **notes field has no length cap**  
   `validation` · POST /timesheets (notes) · _reproduced_ · found by: employee  
   **Expected:** Enforce a sane max length on notes (e.g. a few hundred/thousand chars).  
   **Actual:** Unbounded notes accepted; potential storage bloat and a mild abuse vector.  
   **Repro:** POST with a 5000-character notes value returns 201 and stores it in full.

23. 🔵 **No duplicate detection and no per-day aggregate hour cap**  
   `domain` · POST /timesheets business rules · _reproduced_ · found by: superadmin  
   **Expected:** For billing realism, duplicate identical entries should be flagged/prevented and total logged hours per user per day should not exceed 24.  
   **Actual:** Duplicates freely created and daily total is unbounded, allowing implausible/inflated billable hours to accumulate on Task.actualHours.  
   **Repro:** Posted two identical entries {taskId, date:2026-07-16, hoursLogged:3} -> both 201 with distinct ids (no dedupe). Single entry is capped at 24h, but nothing caps the SUM of entries per user per day, so 10x24h=240h/day is accepted.

24. 🔵 **No duplicate/overlap guard or per-day total cap — same task+date logged repeatedly and unlimited tasks each up to 24h/day**  
   `domain` · POST /timesheets business rules · _code-evident_ · found by: hr  
   **Expected:** For an IP firm billing model, warn/block obvious double-logging (same task+date) and cap total logged hours per day at 24.  
   **Actual:** Duplicates and a physically impossible daily total are both silently accepted.  
   **Repro:** Two entries for the same taskId and date (2026-07-10) both created successfully; per-entry cap is 0.25..24h but there is no aggregate check, so a user could log 24h against many tasks on the same day (>24h/day total).

25. 🔵 **notes has no maximum length - 100k-char note accepted**  
   `validation` · POST /timesheets notes field (dto.ts:26-28) · _reproduced_ · found by: superadmin  
   **Expected:** Free-text notes should have a sane cap (e.g. a few thousand chars) to prevent unbounded storage/payload abuse.  
   **Actual:** Arbitrarily large notes accepted and persisted; repeated use is a storage/DoS vector.  
   **Repro:** POST /timesheets with notes of 100,000 characters -> 201 Created, stored in full. @IsString @IsOptional has no @MaxLength.

26. 🔵 **notes field has no length limit — 20,000-char note accepted**  
   `validation` · POST /timesheets — CreateTimesheetDto.notes (dto.ts:26-28, @IsString @IsOptional only) · _reproduced_ · found by: adversary  
   **Expected:** Cap notes at a reasonable length (e.g. @MaxLength(2000)) to prevent storage bloat / abuse.  
   **Actual:** No length constraint; arbitrarily large notes are persisted.  
   **Repro:** POST /timesheets with notes = 20000 'x' chars → 201 created and stored.

27. 🔵 **notes field is unbounded — 5000-character note accepted**  
   `validation` · POST/PATCH /timesheets (dto.ts notes — @IsString @IsOptional, no @MaxLength) · _reproduced_ · found by: manager  
   **Expected:** notes should have a reasonable @MaxLength to prevent oversized payloads and UI breakage.  
   **Actual:** Arbitrarily long notes are persisted.  
   **Repro:** POST with notes of ~5000 'Q' chars -> 201 Created and stored. dto.ts CreateTimesheetDto.notes / UpdateTimesheetDto.notes have no length cap.

28. 🔵 **No max length on notes — 6000-character note stored without error**  
   `validation` · POST/PATCH /timesheets (notes) · _reproduced_ · found by: hr  
   **Expected:** Reasonable max length (e.g. a few hundred/thousand chars) enforced on notes.  
   **Actual:** Unbounded free-text is accepted, enabling oversized/abusive payloads in the timesheet table.  
   **Repro:** POST {taskId, date, hoursLogged:1, notes:'QATEST-'+6000 x's} -> 201 created and full note persisted. DTO applies no @MaxLength to notes.

29. ⚪ **No approval or period-lock workflow exists for timesheets — nothing for an approver to review, lock, or sign off**  
   `domain` · timesheets module (service/controller) — no approve/submit/lock endpoints · _code-evident_ · found by: manager  
   **Expected:** For an approver persona in a billing IP firm, timesheets typically need submit/approve and period-lock so time cannot be altered after approval/billing.  
   **Actual:** Timesheets are fully self-service with no approval gate or lock; the 'approver' role has no timesheet actions beyond viewing.  
   **Repro:** The module exposes only view/create/update/delete. There is no submit->approve state, no manager approval, and no lock: entries stay editable/backdatable/future-datable indefinitely (see future/past-date findings). Cross-user edits are correctly blocked (owner-or-SuperAdmin), so a manager cannot review or correct a report's time either.


### expenses  (30 unique — 🟡7 🔵19 ⚪4)

1. 🟡 **receiptDocumentId stored without existence or ownership validation (IDOR into document blobs)**  
   `validation` · POST /expenses · _reproduced_ · found by: adversary  
   **Expected:** Server should verify the document exists AND is owned by the submitting user; otherwise reject 400/403.  
   **Actual:** Any arbitrary or nonexistent document id is accepted and persisted. A user can attach another employee's private receipt document id to their own claim (surfaced to approvers), or reference a bogus id.  
   **Repro:** POST /expenses {amount:10,spentOn:'2026-07-15',description:'QATEST-receipt',receiptDocumentId:'totally-fake-doc-id-99999'} -> 201, response echoes receiptDocumentId:'totally-fake-doc-id-99999'. Service submit() (expenses.module.ts) sets receiptDocumentId: data.receiptDocumentId ?? null with no lookup/ownership check.

2. 🟡 **No duplicate-submission guard — identical expenses accepted repeatedly (double-claim vector)**  
   `domain` · POST /expenses · _reproduced_ · found by: adversary  
   **Expected:** Same receipt/amount/date should be de-duplicated or at least flagged, so one receipt can't be reimbursed multiple times.  
   **Actual:** No dedup/idempotency; an employee can submit the identical taxi/travel receipt many times and each becomes an independently reimbursable claim.  
   **Repro:** Same payload {category:'TRAVEL',amount:777,spentOn:'2026-07-10',description:'QATEST-dup identical receipt'} POSTed 3x rapidly -> 201 201 201, three separate PENDING records.

3. 🟡 **receiptDocumentId accepted with no existence or ownership validation**  
   `data-integrity` · POST /expenses (submit, expenses.module.ts:54) · _reproduced_ · found by: superadmin  
   **Expected:** Reject unknown document ids (400/404) and verify the referenced document is owned by the submitter / belongs to the org, so an expense cannot reference a dangling or another user's receipt.  
   **Actual:** Any arbitrary string is stored as receiptDocumentId. A user could set it to a document id belonging to another user; when an approver opens the receipt this is a potential IDOR / cross-user document exposure, and at minimum creates dangling references.  
   **Repro:** curl -b superadmin -X POST /api/v1/expenses -d '{"amount":10,"spentOn":"2026-07-10","description":"QATEST-badreceipt","receiptDocumentId":"nonexistent-doc-id"}' -> HTTP 201, expense created with receiptDocumentId:"nonexistent-doc-id". The service stores data.receiptDocumentId verbatim (line 54) with no lookup, no FK/existence check, and no check that the document belongs to the submitting user or org.

4. 🟡 **receiptDocumentId accepts arbitrary / another user's document with no existence or ownership check**  
   `data-integrity` · POST /expenses receiptDocumentId · _reproduced_ · found by: employee  
   **Expected:** Server should validate the receiptDocumentId exists and belongs to the submitting user (403/404 otherwise), so an expense cannot reference someone else's receipt evidence.  
   **Actual:** Both accepted with HTTP 201; expense created with foreign/non-existent receiptDocumentId persisted verbatim. An employee can attach any other user's document as their expense receipt, and approvers viewing org expenses would resolve/view that foreign document.  
   **Repro:** As employee Ajay, POST /expenses with receiptDocumentId set to a real document id owned by a DIFFERENT user (56c4879d-7c35-4ad2-ae7e-35aa2e0f213a, uploadedBy=cmqze4kpr...). Also tried a fully non-existent id 'nonexistent-doc-123'.

5. 🟡 **markReimbursed() lacks the self-review guard that approve/reject enforce (SoD gap + A/B inconsistency)**  
   `ab-inconsistency` · POST /expenses/:id/reimburse · _code-evident_ · found by: adversary  
   **Expected:** The person marking their own claim as paid out should be blocked, same as approve/reject, to preserve segregation of duties.  
   **Actual:** An approver (expense.approve) whose own expense was approved by a colleague can call reimburse on their own record and self-mark the payout REIMBURSED. Could not exercise live (khushi lacks expense.approve); code-evident.  
   **Repro:** expenses.module.ts decide() line ~87: `if (exp.userId === actorId) throw ForbiddenException('You cannot review your own expense.')`. markReimbursed() (line ~108) only checks status==='APPROVED' — no exp.userId===actorId check.

6. 🟡 **Reimburse step lacks the self-review guard that approve/reject enforce — an approver can mark their OWN expense as reimbursed**  
   `ab-inconsistency` · POST /expenses/:id/reimburse (markReimbursed, expenses.module.ts:105) · _reproduced_ · found by: manager  
   **Expected:** Consistent with the approve/reject guard, the person whose expense it is should not be able to mark their own expense as paid out; expect a 403 (You cannot reimburse your own expense).  
   **Actual:** Owner-approver successfully marks their own expense REIMBURSED (201), closing the reimbursement loop on themselves. Separation-of-duties is enforced at approval but not at the payout step — an A/B inconsistency between the two review actions guarded by the same expense.approve permission.  
   **Repro:** Manager anant (has expense.approve) submits own expense. Second approver ankit.verma approves it (legitimate). Then anant calls POST /expenses/<id>/reimburse on their OWN expense -> 201, status becomes REIMBURSED. The decide() path blocks self at expenses.module.ts:87 ('You cannot review your own expense.') but markReimbursed() at line 105-118 has no `exp.userId === actorId` check.

7. 🟡 **Segregation of duties: HR (people-ops) can both approve AND reimburse expenses single-handed**  
   `rbac` · expenses approval routing · _reproduced_ · found by: hr  
   **Expected:** For a financial reimbursement flow, approval (authorising spend) and reimbursement (marking money paid) should ideally require different actors/permissions, or at least people-ops should not single-handedly disburse firm funds. Sensitive people/RBAC/org mutations elsewhere in pdash require a step-up passcode; money movement here requires nothing.  
   **Actual:** expense.approve grants both /approve and /reimburse; the same HR user approved and then reimbursed the same expense with no second-party control and no step-up.  
   **Repro:** Logged in hr@squarkip.com. POST /expenses/<empId>/approve -> 200 status APPROVED (reviewedBy=HR). Then POST /expenses/<same>/reimburse -> 200 status REIMBURSED. One role/actor performed both financial approval and disbursement with no second party.

8. 🔵 **Invalid status query on /expenses/org returns 200 [] instead of validating the enum**  
   `validation` · GET /expenses/org (expenses.module.ts:78) · _reproduced_ · found by: superadmin  
   **Expected:** Reject unknown status values with 400 so an integrator/UI bug is visible rather than silently showing an empty (misleading 'no expenses') list.  
   **Actual:** A misspelled/wrong-case status silently yields an empty result, which reads as 'nothing to review'.  
   **Repro:** GET /expenses/org?status=BOGUS -> HTTP 200 []; GET /expenses/org?status=pending (lowercase) -> HTTP 200 [] (case-sensitive, no match). status is passed straight into the Prisma where with no enum check.

9. 🔵 **GET /expenses/org?status=<invalid> silently returns [] instead of validating the status filter**  
   `validation` · GET /expenses/org (forOrg, expenses.module.ts:77-80) · _reproduced_ · found by: manager  
   **Expected:** An unknown status value should 400 (or be ignored and return all), so a reviewer does not misread a typo as 'no expenses'.  
   **Actual:** Returns an empty array with 200, indistinguishable from a genuinely empty queue; a manager filtering with a mistyped/mismatched-case status (e.g. 'pending', 'BOGUS') silently sees nothing and could conclude there is nothing to approve.  
   **Repro:** curl -b <mgr> 'http://localhost:4000/api/v1/expenses/org?status=BOGUS' -> 200 with []. The status query value is passed straight into Prisma where{status} with no allow-list check, so any unrecognized value matches zero rows.

10. 🔵 **amount has no upper bound**  
   `data-integrity` · POST /expenses · _reproduced_ · found by: adversary  
   **Expected:** Cap the amount at a sane business ceiling; reject absurd values.  
   **Actual:** An expense of 1e30 INR is accepted, notifying approvers of a nonsensical figure and polluting reports/totals.  
   **Repro:** POST amount:1e30 -> 201, stored amount:1e+30.

11. 🔵 **Sub-paisa amounts accepted (no minimum / rounding)**  
   `data-integrity` · POST /expenses · _reproduced_ · found by: adversary  
   **Expected:** Enforce a minimum (e.g. >= 0.01 INR) and/or round to 2 decimals.  
   **Actual:** Fractional-of-a-paisa amounts (1e-7) are stored, producing meaningless currency values.  
   **Repro:** POST amount:0.0000001 -> 201, stored amount:1e-7.

12. 🔵 **currency field not validated against an allow-list and not length-capped**  
   `validation` · POST /expenses · _reproduced_ · found by: adversary  
   **Expected:** Restrict to an ISO-4217 allow-list (or at least INR) and cap length.  
   **Actual:** Arbitrary and 500-char currency strings persist, corrupting the amount/currency display and allowing storage abuse.  
   **Repro:** POST currency:'XXX' -> 201 stored currency:'XXX'; POST currency of 500 'X' chars -> 201 stored full 500-char string.

13. 🔵 **description length not capped (12k chars accepted)**  
   `validation` · POST /expenses · _reproduced_ · found by: adversary  
   **Expected:** Enforce a reasonable max length (e.g. 1-2k).  
   **Actual:** Very large descriptions are stored unbounded (storage/render bloat, potential DoS surface).  
   **Repro:** POST description of ~12,000 chars -> 201 created.

14. 🔵 **No amount upper bound or currency-precision limit (sub-paise fractions accepted)**  
   `validation` · POST /expenses (expenses.module.ts:42) · _reproduced_ · found by: superadmin  
   **Expected:** Enforce a sane upper bound and round/limit to 2 decimal places for money.  
   **Actual:** Amounts with impossible currency precision (0.00001) and absurdly large values are accepted and stored as reimbursable expenses.  
   **Repro:** POST amount:0.00001 -> HTTP 201; POST amount:999999999999999 -> HTTP 201. Only Number.isFinite && >0 is enforced (line 42).

15. 🔵 **No maximum length on description (and reviewNote) — 20k+ chars accepted**  
   `validation` · POST /expenses (expenses.module.ts:43,54) · _reproduced_ · found by: superadmin  
   **Expected:** Cap description (and reject/approve note) length to a sane bound (e.g. a few thousand chars) to prevent storage bloat / abuse.  
   **Actual:** Unbounded-length free text is persisted; reviewNote on reject has the same gap.  
   **Repro:** POST /expenses with a ~20000-char description (QATEST-AAAA...) -> HTTP 201, stored in full. Only trim/non-empty is validated (line 43).

16. 🔵 **Unknown category silently coerced to OTHER instead of rejected**  
   `domain` · POST /expenses (expenses.module.ts:45) · _reproduced_ · found by: superadmin  
   **Expected:** Reject unknown categories with 400 (or at least surface the coercion), so a client typo like 'TRAVELS' isn't silently misclassified as OTHER.  
   **Actual:** Any invalid/typo'd category is silently reclassified as OTHER, degrading expense reporting/analytics accuracy.  
   **Repro:** POST /expenses with category:"BRIBERY" -> HTTP 201 with category:"OTHER". Line 45 falls back to OTHER for anything not in the allow-list.

17. 🔵 **Currency field not validated — arbitrary long non-ISO string accepted**  
   `validation` · POST /expenses (expenses.module.ts:53) · _reproduced_ · found by: superadmin  
   **Expected:** Validate currency against ISO-4217 (or the firm's supported set) and cap length.  
   **Actual:** Any string becomes the currency; org list and reimbursement messages will render junk currency codes, and mixed currencies are stored with no conversion basis.  
   **Repro:** POST /expenses with currency:"UNITEDSTATESDOLLARSABC" -> HTTP 201, stored verbatim. Code uses data.currency || 'INR' with no allow-list/length check.

18. 🔵 **No upper bound on expense amount (999,999,999,999 accepted)**  
   `validation` · POST /expenses amount · _reproduced_ · found by: employee  
   **Expected:** A sane per-expense ceiling for an IP firm reimbursement, or at least a configurable cap, rejected with 400.  
   **Actual:** HTTP 201, ~1 trillion INR expense created in PENDING. Only amount<=0/non-finite is rejected; there is no maximum.  
   **Repro:** POST /expenses with amount=999999999999.

19. 🔵 **amount accepts sub-paisa precision (0.001) — no currency rounding**  
   `data-integrity` · POST /expenses amount · _reproduced_ · found by: hr  
   **Expected:** For an INR expense, amounts should be constrained to 2 decimal places (paisa); fractional-paisa values create reconciliation/rounding issues in reimbursement totals.  
   **Actual:** amount stored as 0.001 with no decimal-precision enforcement.  
   **Repro:** POST /expenses {amount:0.001,spentOn:"2026-07-12",description:"QATEST-tiny"} -> 201 created with amount 0.001.

20. 🔵 **currency field accepts arbitrary non-ISO strings**  
   `validation` · POST /expenses currency · _reproduced_ · found by: employee  
   **Expected:** currency validated against an allow-list of ISO 4217 codes (INR/USD/EUR...) with 400 on unknown, mirroring how category is an allow-list.  
   **Actual:** HTTP 201, currency stored as 'XXXXXXXX'. Inconsistent with the category allow-list handling (A/B inconsistency) and permits garbage currency on financial records.  
   **Repro:** POST /expenses with currency='XXXXXXXX'.

21. 🔵 **currency field accepts arbitrary non-ISO strings (no allow-list)**  
   `validation` · POST /expenses currency · _reproduced_ · found by: hr  
   **Expected:** currency should be validated against a known set (e.g. INR/USD/EUR) or at least a 3-letter ISO-4217 shape; garbage currency codes corrupt reimbursement/reporting.  
   **Actual:** Any string is stored verbatim as the currency.  
   **Repro:** POST /expenses {amount:100,currency:"XXXNOTREAL",spentOn:"2026-07-15",description:"QATEST-cur"} -> 201 created with "currency":"XXXNOTREAL".

22. 🔵 **No maximum length on expense description (20,000-char body accepted)**  
   `validation` · POST /expenses description · _reproduced_ · found by: employee  
   **Expected:** A reasonable max length (e.g. a few thousand chars) enforced with 400.  
   **Actual:** HTTP 201, full 20k description stored. Unbounded free-text with no cap (storage/DoS surface, and empty/whitespace is correctly rejected but length is not).  
   **Repro:** POST /expenses with description = 'QATEST-' + 20000 'x' chars.

23. 🔵 **description has no maximum length (20,000-char body accepted)**  
   `validation` · POST /expenses description · _reproduced_ · found by: hr  
   **Expected:** A sane max length (e.g. a few thousand chars) to prevent oversized rows / UI abuse; amount and dates are validated but free text is unbounded.  
   **Actual:** Unbounded description string accepted and persisted.  
   **Repro:** POST /expenses with a ~20,000-character description (QATEST-AAAA...) -> 201 created and stored in full.

24. 🔵 **spentOn accepts absurd past dates (year 1900) while future is blocked**  
   `validation` · POST /expenses spentOn · _reproduced_ · found by: hr  
   **Expected:** A reasonable lower bound (e.g. within the current/prior financial year, or not decades old) mirroring the future-date guard; a 1900 expense is not a realistic reimbursable claim.  
   **Actual:** Future date validated, but no lower bound — 1900-01-01 accepted.  
   **Repro:** POST /expenses {amount:100,spentOn:"1900-01-01",description:"QATEST-ancient"} -> 201 created. Future dates correctly return 400 'The expense date cannot be in the future.'

25. 🔵 **decide()/markReimbursed() fetch by id only, no organization scoping**  
   `rbac` · POST /expenses/:id/approve|reject|reimburse · _code-evident_ · found by: adversary  
   **Expected:** State-changing approver actions should confirm the expense belongs to the actor's organization (multi-tenant safety).  
   **Actual:** An approver could act on an expense from another organization by id. Low impact in the current single-org deployment but a latent multi-tenancy hole. Code-evident.  
   **Repro:** expenses.module.ts decide() and markReimbursed() do `prisma.expense.findUnique({where:{id}})` with no organizationId filter; only forOrg() is org-scoped.

26. 🔵 **Approve/reject/reimburse/cancel look up expense by id only, not scoped to actor's organization**  
   `rbac` · decide/markReimbursed/cancel (expenses.module.ts:84,106,121) · _code-evident_ · found by: superadmin  
   **Expected:** Defense-in-depth: verify the expense's organizationId matches the actor's org before allowing review/reimburse actions, so an approver can never act on another org's record if the deployment ever becomes multi-tenant.  
   **Actual:** Actions are authorized purely by global permission + id, with no org scoping on the target row.  
   **Repro:** Code-evident: findUnique({where:{id}}) with no organizationId constraint; the only guard is the expense.approve permission and the self-review check. Not reproducible here (single-org deployment), so no cross-tenant leak was demonstrated.

27. ⚪ **GET /expenses/org with an invalid status returns 200 [] instead of 400**  
   `ab-inconsistency` · GET /expenses/org status filter · _reproduced_ · found by: hr  
   **Expected:** An unrecognised status value should return 400 (as other validations do) rather than silently returning an empty list, which can mask client bugs/typos.  
   **Actual:** Unknown status silently yields an empty 200 result.  
   **Repro:** GET /expenses/org?status=BANANA -> HTTP 200 [] (empty array). Body-level validations on POST return clean 400s, but the query-param enum is not validated.

28. ⚪ **spentOn has no lower bound**  
   `domain` · POST /expenses · _reproduced_ · found by: adversary  
   **Expected:** Reject dates implausibly far in the past (e.g. before joining / older than a policy window).  
   **Actual:** An expense dated 1900-01-01 (126 years ago) is accepted. Future dates are correctly blocked, so the past side is an asymmetric gap.  
   **Repro:** POST spentOn:'1900-01-01' -> 201 PENDING.

29. ⚪ **spentOn accepts arbitrarily old dates (e.g. 1900-01-01)**  
   `domain` · POST /expenses (expenses.module.ts:48) · _reproduced_ · found by: superadmin  
   **Expected:** Optionally constrain spentOn to a reasonable claim window (e.g. within the last N months per reimbursement policy).  
   **Actual:** Expenses dated over a century ago are accepted, which is unrealistic for an active reimbursement claim.  
   **Repro:** POST spentOn:"1900-01-01" -> HTTP 201. Only a future-date guard exists (line 48); no lower bound.

30. ⚪ **Sub-paisa fractional amounts accepted (0.0001)**  
   `domain` · POST /expenses amount · _reproduced_ · found by: employee  
   **Expected:** Monetary amount rounded/validated to 2 decimal places (paisa) for INR reimbursement.  
   **Actual:** HTTP 201, amount 0.0001 stored. No precision/rounding guard on currency values.  
   **Repro:** POST /expenses with amount=0.0001.

---

## Batch 2 — Delivery  ✅ complete (30/30 agents · projects · tasks · capacity · performance · issues · calendar)

**120 unique findings** (from 122 raw across 30 runs) — 🟠 27 high · 🟡 40 medium · 🔵 45 low · ⚪ 10 info


### projects  (25 unique — 🟠12 🟡8 🔵5)

1. 🟠 **GET /projects list returns ALL org projects, not just the caller's memberships**  
   `rbac` · GET /projects (projects.controller.ts:19-22; service list() projects.service.ts:156-188) · _reproduced_ · found by: adversary  
   **Expected:** Contract says list is members-only; a user should see only projects they belong to. Org should come from the session, not a client-supplied query param.  
   **Actual:** Every project in the org is listed to any authenticated user regardless of membership; combined with the GET /:id IDOR this exposes all project detail org-wide.  
   **Repro:** As khushi (member of exactly 3 projects), GET /api/v1/projects?organizationId=cmqze4knz0000sjsu7ljwqivj returned 9 projects, including the foreign 'Patent Drafting — AI Accelerator Chipset' she is not a member of. list() filters `members: { some: { user: { organizationId } } }` (any project having a member in the org) rather than the actor's own memberships. Also, omitting organizationId entirely (GET /projects) still returns projects (undefined org filter is dropped), and organizationId is an unverified client query param.

2. 🟠 **IDOR read: GET /:id returns any project's full detail to a non-member**  
   `rbac` · GET /projects/:id (projects.controller.ts line 39; service get()/getRaw) · _reproduced_ · found by: manager  
   **Expected:** Per the members-gating rule (list/get only for members, no bypass), a non-member should get 403/404.  
   **Actual:** get() → getRaw() filters only on `id` + `deletedAt:null` with NO membership predicate, so any authenticated user reads any project by id. Combined with a global deadline.view.client holder, this also exposes clientDueDate (client commitments) of projects the actor is not on. list() has the same shape (filters by 'has a member in the org', not by the caller's membership).  
   **Repro:** As manager Anant (verified NOT a member of any project), GET /projects/cmqze4kw200lssjsutzdm9ktu ('Trademark Watch & Filing'). Got HTTP 200 with the full project: title, description, internal dueDate, members list, workflow status, createdBy.

3. 🟠 **GET /projects/:id has no membership gate — any authenticated user can read any project (no permission decorator, no member/org scoping)**  
   `rbac` · GET /projects/:id (projects.controller.ts:39-42, projects.service.ts:257-260 -> getRaw) · _reproduced_ · found by: superadmin  
   **Expected:** Per the stated design projects are members-gated on GET with NO super-admin bypass; a non-member (even Super Admin) should get 403/404.  
   **Actual:** The controller GET :id carries no @RequirePermission and the service get()->getRaw() fetches by id only (where id, deletedAt:null) with no member/org filter, then redacts deadlines. So the deliberate membership gate is entirely absent — every authenticated user can read every project by id (broad IDOR), and Super Admin trivially bypasses the membership boundary the spec says it must not.  
   **Repro:** As mohit, GET /projects/cmqze4ktq00hpsjsublst646g (FTO Analysis — MedTech Wearable, a project mohit is NOT an active member of) -> HTTP 200 returning the full project (title, description, dueDate, billable, workflow, members). DB confirms no active project_member row for mohit on that project.

4. 🟠 **IDOR: any authenticated user can read any project by id (GET /:id has no membership or permission gate)**  
   `rbac` · GET /projects/:id (projects.controller.ts:39-42; service get()->getRaw() projects.service.ts:238-260) · _reproduced_ · found by: adversary  
   **Expected:** Members-only per the module contract: a non-member should get 403/404. getRaw() only filters deletedAt:null and the controller GET has no @RequirePermission, so there is no membership or permission check at all.  
   **Actual:** Full project (incl. member roster + assignments + internal deadline) returned to a non-member. Only clientDueDate is stripped by redaction; everything else leaks. Enables enumeration + read of every project in the org.  
   **Repro:** Logged in as khushi.gupta@squarkip.com (Senior Research Associate; perms only project.create/project.view; member of 3 projects). GET http://localhost:4000/api/v1/projects/cmqze4kuu00jqsjsun73zav17 (Patent Drafting — AI Accelerator Chipset), a project she is NOT a member of. Response: HTTP 200 with full payload: title, description, projectPhase, priority, startDate, internal dueDate, completionPercentage, billable, workflow ids, and the full members roster with project roles [Mohit=MANAGER, Arjun=DEVELOPER, Yash=REVIEWER, Divyanshu=TESTER].

5. 🟠 **IDOR write: PATCH /:id (and lifecycle/member ops) mutate projects the actor is not a member/manager of**  
   `rbac` · PATCH /projects/:id + /complete|/close|/reopen + /members (service update/complete/close/reopen/removeMember) · _reproduced_ · found by: manager  
   **Expected:** Inventory states PATCH requires the actor be a member/manager of the project; a non-member holding project.update should be refused.  
   **Actual:** update() (and complete/close/reopen/removeMember) call getRaw(id) with no membership/manager check — only the controller's blanket project.update permission gates them. Any project.update holder can edit, complete, close, reopen, or strip members from ANY project in the org, not just their own.  
   **Repro:** As manager Anant (not a member/manager of it), PATCH /projects/cmqze4kw200lssjsutzdm9ktu {priority:'HIGH'} → HTTP 200, priority changed (restored to MEDIUM afterward).

6. 🟠 **addMember is completely broken — no user can ever be added to a project**  
   `logic` · POST /projects/:id/members (projects.service.ts addMember, line ~459) · _reproduced_ · found by: manager  
   **Expected:** The user (same org) is added as an active project member.  
   **Actual:** Always rejected. addMember compares `user.organizationId !== (project as any).organizationId`, but the Project model has NO organizationId column (getRaw does not select one — it is undefined), so the check is `<real cuid> !== undefined` → always true → BadRequest for every user. The entire staffing feature (add teammate to project) is non-functional via the API. re-activation of a previously-removed member is equally unreachable.  
   **Repro:** As manager, POST /projects/<pid>/members {userId: <a same-org active user id>, projectRole:'MEMBER'}. Got HTTP 400 {"message":"User is not in this project's organization."} for shavetasharma@squarkip.com AND meetu.singh@squarkip.com, both in org cmqze4knz0000sjsu7ljwqivj. Reproduced on a freshly-created QATEST project AND on an existing project.

7. 🟠 **addMember is completely broken — every add fails with 'User is not in this project's organization'**  
   `logic` · POST /projects/:id/members (projects.service.ts:455-461) · _reproduced_ · found by: superadmin  
   **Expected:** An active user from the same organization should be added as a project member (HTTP 200 with the member appearing in the project).  
   **Actual:** addMember calls getRaw(projectId), then checks `user.organizationId !== (project as any).organizationId`. The Project model/table has NO organizationId column (confirmed via information_schema — column absent), so `(project as any).organizationId` is always undefined; a real user's organizationId is never equal to undefined, so the guard always throws. Result: no member can EVER be added to any project through the API. Core project-staffing is non-functional.  
   **Repro:** Logged in as mohit (Super Admin), POST /projects/cmru7ioe901vqcpkogui7v9k3/members {"userId":"<any active org user>"} -> HTTP 400 {"message":"User is not in this project's organization."}. DB confirms the member row was NOT created (count=0). Reproduced for both a project I own and a project I am not a member of; fails identically.

8. 🟠 **GET /projects/:id has no permission guard and no membership check — any authenticated user reads any project (IDOR read)**  
   `rbac` · projects.controller.ts:39 get() / projects.service.ts get()->getRaw() · _reproduced_ · found by: hr  
   **Expected:** Inventory states get is members-only with NO super-admin bypass; a non-member should get 403/404.  
   **Actual:** The @Get(':id') route carries no @RequirePermission and service get() calls getRaw(id) with only `deletedAt: null` — no membership or org scoping. Any signed-in user (even a permission-less one) can read any project by id. Mitigation: clientDueDate is still redacted server-side, so only the internal deadline/description leak, not the client date.  
   **Repro:** As hr@ (not a member of FTO Analysis), GET /api/v1/projects/cmqze4ktq00hpsjsublst646g returns 200 with the full project payload (description, priority CRITICAL, start/due dates, createdBy, members).

9. 🟠 **GET /projects returns every project in the org to a non-member (membership gating absent)**  
   `rbac` · projects.service.ts list() / GET /projects · _reproduced_ · found by: hr  
   **Expected:** Per the authoritative inventory the list is members-gated — a user should only receive projects they are a member of. A people-ops (HR) account with no project membership should get an empty list.  
   **Actual:** The list() where-clause filters on `members: { some: { user: { organizationId } } }` — i.e. any project that has at least one member in the org — which is EVERY project. Membership of the actor is never checked, so all org projects (titles, descriptions, internal due dates) are disclosed to any authenticated user. Confirmed live: HR sees all 6+ projects.  
   **Repro:** Login hr@squarkip.com (a member of ZERO projects per project_member). GET /api/v1/projects?organizationId=cmqze4knz0000sjsu7ljwqivj returns 200 with the full project list (FTO Analysis, Patent Drafting, Trademark Watch, etc.).

10. 🟠 **PATCH /projects/:id lets a non-member edit any project (only global project.update checked, no member/manager gate)**  
   `rbac` · projects.service.ts:262 update() · _reproduced_ · found by: hr  
   **Expected:** Inventory: update must be a member/manager of the project. A non-member should be rejected with 403.  
   **Actual:** update() -> getRaw(id) performs no membership/manager check; the only gate is the controller's @RequirePermission('project.update'). Any project.update holder can edit any project in the org regardless of membership. removeMember/complete/close/reopen share the same service-layer gap (all guarded solely by project.update).  
   **Repro:** As hr@ (holds project.update via stacked roles, member of NO project), PATCH /api/v1/projects/cmqze4ktq00hpsjsublst646g with {"priority":"CRITICAL"} returns 200 and the updated project. (Sent the current value to avoid mutating live data, but authorization clearly passed.)

11. 🟠 **POST /projects/:id/members can never add a member — org-equality check compares against a non-existent Project.organizationId**  
   `data-integrity` · projects.service.ts:459 addMember() · _reproduced_ · found by: hr  
   **Expected:** Adding a same-org active user should succeed (200) and staff the project.  
   **Actual:** The Project table has no organizationId column (org is reached through members). getRaw() therefore yields `organizationId === undefined`, so `user.organizationId !== (project as any).organizationId` is always true and the guard always throws. The add-member endpoint is non-functional for ALL users/projects, not just HR — projects can only ever be staffed via the members created at project-creation time.  
   **Repro:** As hr@, POST /api/v1/projects/cmqze4ktq00hpsjsublst646g/members {"userId":"cmqze4kr300dcsjsuvnpxt1gl"} (a valid ACTIVE user in the same org) returns 400 "User is not in this project's organization."

12. 🟠 **hr@ people-ops account is role-stacked with Manager + Senior Consultant, granting full delivery write surface**  
   `rbac` · seeded user_role assignments for hr@squarkip.com · _reproduced_ · found by: hr  
   **Expected:** Per the design 'HR is designed to NOT have delivery surfaces' — a people-ops account should not hold project/task/issue write or approval permissions. The correctly-scoped pure HR role confirms the intended boundary.  
   **Actual:** The hr@ demo account is over-privileged via role stacking, so it silently passes every delivery-write boundary the HR role is meant to block. This masks the RBAC design in demos and grants people-ops full project create/edit/approve. (Pure boundary is correctly enforced only because the standalone HR role carries no such perms — verified project.delete returned a clean 403 'Missing permission: project.delete' since none of HR's stacked roles grant it.)  
   **Repro:** DB: hr@squarkip.com has roles {HR, Manager, Senior Consultant} and effective permissions include project.create, project.update, project.approve, deadline.view.client, task.create/update/delete/assign, issue.create/update. Live: HR could create a project (201), edit a non-member project (200), and would approve/reject if a pending approval existed. The PURE 'HR' role has ZERO project/task/issue/deadline permissions.

13. 🟡 **GET /projects returns all projects for a client-supplied organizationId with no auth scoping (membership bypass + cross-tenant read surface)**  
   `rbac` · GET /projects?organizationId= (projects.controller.ts:19-22, projects.service.ts:156-188) · _reproduced_ · found by: superadmin  
   **Expected:** List should be scoped to projects the actor is a member of (stated design: list is members-only), and org must come from the session, not a client-supplied query param.  
   **Actual:** list() filters on members.some.user.organizationId = <query param> with no per-actor membership filter and no permission decorator. Any authenticated user sees every project in the org, and because the org is read from the query string rather than the session, the endpoint is a cross-tenant enumeration surface (not reproducible here as the deployment has one org, but code-evident).  
   **Repro:** As mohit, GET /projects?organizationId=cmqze4knz0000sjsu7ljwqivj -> HTTP 200 listing 6 projects, though mohit is an active member of only 3. List is filtered solely by the organizationId taken from the query string.

14. 🟡 **PATCH projectPhase bypasses the lifecycle state machine and skips timestamps/notifications**  
   `logic` · PATCH /projects/:id update() (projects.service.ts:277-293; UpdateProjectDto.projectPhase dto.ts:76-78) · _code-evident_ · found by: adversary  
   **Expected:** Phase changes should only go through the lifecycle endpoints (or PATCH should validate the enum and the allowed transition), keeping completedAt/closedAt and member notifications consistent.  
   **Actual:** PATCH can jump a project to any phase (e.g. CLOSED without closedAt, or an invalid enum value) with no state-machine enforcement, diverging from complete/close/reopen behavior.  
   **Repro:** UpdateProjectDto.projectPhase is a free @IsString with no @IsEnum and no state-machine guard, and update() writes projectPhase straight through. A holder of project.update can PATCH projectPhase to 'COMPLETED'/'CLOSED'/'ACTIVE' (or any string) directly, bypassing complete()/close()/reopen() which enforce legal transitions and set completedAt/closedAt and notify members. Not exploitable by this Employee persona (khushi lacks project.update -> PATCH returned HTTP 403), so reported code-evident.

15. 🟡 **PATCH /projects/:id (and lifecycle endpoints) enforce only the global project.update permission, not project membership**  
   `rbac` · PATCH /projects/:id, POST /:id/complete|close|reopen (projects.service.ts:262, controller uses @RequirePermission only) · _reproduced_ · found by: superadmin  
   **Expected:** Per the stated design, update must require the actor to be a member/manager of the project; a non-member Super Admin should not silently mutate an unrelated project.  
   **Actual:** update()/complete()/close()/reopen() call getRaw(id) with no membership assertion; the only gate is the global @RequirePermission('project.update'). Any holder of project.update can edit/transition ANY project regardless of membership — the deliberate membership gate is bypassed.  
   **Repro:** As mohit, PATCH /projects/cmqze4ktq00hpsjsublst646g (a project mohit is NOT a member of) {"priority":"CRITICAL"} -> HTTP 200, returns the updated project. No membership/manager check is applied.

16. 🟡 **create() does not validate dueDate >= startDate (inconsistent with update())**  
   `ab-inconsistency` · POST /projects (projects.service.ts create, lines 86-89) · _reproduced_ · found by: manager  
   **Expected:** An inverted internal date range should be rejected on create just as it is on update.  
   **Actual:** create() only calls assertOrdered(internalDue, clientDue) (internal-vs-client) and never compares startDate to dueDate, so a backwards internal range is persisted — feeds bogus 'overdue' / Gantt state. Same rule, two different answers depending on whether you create or edit.  
   **Repro:** POST /projects {title:'QATEST-baddate', startDate:'2026-09-01', dueDate:'2026-08-01'} → HTTP 200, project created with dueDate a month BEFORE startDate. The equivalent PATCH is rejected: update() throws 'Due date cannot be before the start date.'

17. 🟡 **Inverted date range (dueDate before startDate) accepted on CREATE but rejected on UPDATE (A/B inconsistency)**  
   `ab-inconsistency` · POST /projects create() (projects.service.ts:85-112) vs PATCH update() (projects.service.ts:266-270) · _reproduced_ · found by: adversary  
   **Expected:** Create should apply the same start<=due validation as update.  
   **Actual:** Illogical schedule persists (due before start); produces nonsensical overdue/duration math downstream. (Test project cleaned up.)  
   **Repro:** POST /projects as khushi with {"title":"QATEST-inverted","managerId":<mohit>,"startDate":"2026-09-01","dueDate":"2026-01-01"} -> HTTP 201, project saved with startDate 2026-09-01 and dueDate 2026-01-01 (due 8 months before start). The same inversion via PATCH is rejected with 400 'Due date cannot be before the start date.' create() only calls assertOrdered(internalDue, clientDue) and never compares startDate vs dueDate.

18. 🟡 **Project create does not validate dueDate >= startDate (update does) — inverted date range persists**  
   `ab-inconsistency` · POST /projects vs PATCH /projects/:id (projects.service.ts:86-89 vs 262-270) · _reproduced_ · found by: superadmin  
   **Expected:** Create should reject an inverted start/due range with the same 400 that update returns.  
   **Actual:** create() only calls assertOrdered(internalDue, clientDue) (internal-vs-client) and never compares dueDate against startDate, while update() explicitly checks `due < start`. A project can be created with a due date before its start date.  
   **Repro:** POST /projects {"title":"QATEST-baddate","startDate":"2026-12-01","dueDate":"2026-01-01"} -> HTTP 201, project created with startDate Dec 2026 and dueDate Jan 2026. The same inverted range on PATCH is rejected 400 'Due date cannot be before the start date.'

19. 🟡 **GET /projects/:id has no membership or permission check — any employee can read a project they are not a member of**  
   `rbac` · projects.controller.ts GET :id / projects.service.ts get()/getRaw() · _reproduced_ · found by: employee  
   **Expected:** Per the stated rule projects are members-gated (get only for members, no bypass); a non-member employee should get 403/404.  
   **Actual:** GET :id is unguarded: the controller applies no @RequirePermission and service get()->getRaw() looks up the project by id with only `deletedAt: null` — no membership filter and no organization filter. Full project detail is returned to any authenticated user; getRaw also has no org scope, so in a multi-org deployment this is a cross-tenant read.  
   **Repro:** Logged in as employee ajay.sharma (member of 0 projects). GET /api/v1/projects/cmqze4kuu00jqsjsun73zav17 (a project I am not a member of) returned HTTP 200 with the full record: title, full description, priority, dates, createdBy, currentStatus, and — in getRaw — member list and task lists.

20. 🟡 **create() accepts an inverted date range (startDate after dueDate) that update() rejects**  
   `ab-inconsistency` · projects.service.ts create() vs update() · _reproduced_ · found by: employee  
   **Expected:** A due date before the start date should be rejected on create, exactly as update() does ('Due date cannot be before the start date.').  
   **Actual:** create() only calls assertOrdered(internal, client) — it never validates dueDate >= startDate. update() (lines 266-270) does validate it, so the same invalid range is blocked on edit but allowed on create, producing inconsistent/invalid project data.  
   **Repro:** POST /api/v1/projects {title:'QATEST-inverted', managerId:<approver>, startDate:'2026-12-01', dueDate:'2026-01-01'} returned HTTP 201 and stored startDate 2026-12-01 with dueDate 2026-01-01 (due six months before start).

21. 🔵 **Project priority accepts arbitrary free-string (no enum validation)**  
   `validation` · CreateProjectDto.priority / UpdateProjectDto.priority (dto.ts:38-40, 72-74) · _reproduced_ · found by: adversary  
   **Expected:** priority should be constrained to the allowed set (LOW/MEDIUM/HIGH/URGENT) and reject others with 400.  
   **Actual:** Arbitrary priority strings are stored, corrupting sorting/filtering and any UI that maps known priority values. (Test project cleaned up.)  
   **Repro:** POST /projects as khushi with {"title":"QATEST-prio","managerId":<mohit>,"priority":"SUPER_URGENT_HACK"} -> HTTP 201; response persisted priority:"SUPER_URGENT_HACK". DTO validates priority only as @IsString with no @IsEnum/@IsIn, and the column stored the junk value verbatim.

22. 🔵 **Project create accepts an arbitrary priority value outside the enum**  
   `validation` · POST /projects (CreateProjectDto priority) · _reproduced_ · found by: superadmin  
   **Expected:** priority should be validated against the allowed enum (LOW/MEDIUM/HIGH/CRITICAL) and rejected with 400 if invalid.  
   **Actual:** The create DTO does not constrain priority to the enum, so a garbage priority string is stored verbatim and echoed back, which can break priority-based sorting/filtering downstream.  
   **Repro:** POST /projects {"title":"QATEST-prio","priority":"SUPERURGENT"} -> HTTP 201, project persisted with priority 'SUPERURGENT'.

23. 🔵 **Whitespace-only project title accepted**  
   `validation` · POST /projects (CreateProjectDto title validation) · _reproduced_ · found by: manager  
   **Expected:** A blank/whitespace-only title should be rejected (trim before length check).  
   **Actual:** MinLength passes on 3 spaces; a titleless project is created and shows as blank across lists, boards and pickers.  
   **Repro:** POST /projects {title:'   '} → HTTP 200, project created with title '   '. (Empty '' is correctly rejected with 'title must be longer than or equal to 1 characters'.)

24. 🔵 **priority accepts arbitrary free-text (no enum validation) on project create**  
   `validation` · dto.ts CreateProjectDto.priority · _reproduced_ · found by: employee  
   **Expected:** priority should be constrained to the valid set (LOW/MEDIUM/HIGH/etc.) and reject unknown values with a 400.  
   **Actual:** priority is typed only as @IsString() with no @IsEnum/@IsIn, and the column stores free text, so an employee can inject arbitrary priority values that will not match UI filters/sorting or any downstream enum expectation.  
   **Repro:** POST /api/v1/projects {title:'QATEST-badprio', managerId:<approver>, priority:'SUPERHIGH'} returned HTTP 201 and persisted priority:'SUPERHIGH'.

25. 🔵 **GET /projects list is org-scoped, not membership-scoped — employee sees every project in the org**  
   `rbac` · projects.service.ts list() · _reproduced_ · found by: employee  
   **Expected:** Stated rule: list only shows projects the actor is a member of.  
   **Actual:** list() filters `members: { some: { user: { organizationId } } }`, i.e. any project having at least one member in the org — effectively every project in the org regardless of the caller's own membership. organizationId is taken from an untrusted query param instead of the session.  
   **Repro:** As employee (member of 0 projects), GET /api/v1/projects?organizationId=cmqze4knz0000sjsu7ljwqivj returned all 6-8 org projects. Also accepts an arbitrary client-supplied organizationId query param (bogus org returns [] rather than an auth error).


### tasks  (25 unique — 🟠6 🟡10 🔵9)

1. 🟠 **IDOR read: any authenticated user can read any task / any project's task list (no permission or membership check)**  
   `rbac` · GET /tasks/:id and GET /tasks?projectId= (tasks.controller.ts:26-29,15-24 — no @RequirePermission) · _reproduced_ · found by: adversary  
   **Expected:** A non-member should get 403 (or an empty/filtered result); read of tasks in projects you are not on should be blocked.  
   **Actual:** 200 OK — exposes title, internal dueDate, estimatedHours, actualHours (89h), completionPercentage, assignees, createdBy across every project org-wide. Route has neither a permission guard nor a membership scope. (Unauthenticated request correctly 401s — so the exposure is to any logged-in user, regardless of project.)  
   **Repro:** Logged in as Khushi (Senior Research Associate; perms task.create/update/view only, member of only 3 projects). GET /tasks/cmqze4kzx00s4sjsuug8jvliu (a task in 'Patent Landscape — EV Battery Chemistry', a project she is NOT a member of) returned 200 with full record. GET /tasks?projectId=cmqze4kww00n8sjsus9jw131w (that foreign project) returned 200 with its whole task list.

2. 🟠 **IDOR write: task.update lets a non-member edit tasks in projects they are not on (and corrupts that project's progress rollup)**  
   `rbac` · PATCH /tasks/:id (tasks.controller.ts:31-34; tasks.service.ts update() — no membership/ownership scope) · _reproduced_ · found by: adversary  
   **Expected:** Editing a task should require membership/assignment in the owning project; a non-member should get 403.  
   **Actual:** 200 OK — title rewritten and completion set to 77% on a stranger's project task, silently skewing that project's aggregate progress bar. task.update is a global org permission with no per-project scoping.  
   **Repro:** As Khushi (non-member of the EV Battery project) PATCH /tasks/cmqze4kzx00s4sjsuug8jvliu with {"title":"QATEST-idor-edited","completionPercentage":77} returned 200 and applied both changes. Setting completionPercentage also feeds recomputeProjectProgress on the foreign project.

3. 🟠 **IDOR: employee can edit, re-title, set completion and CLOSE any task in a project they are not a member of**  
   `rbac` · PATCH /tasks/:id, PUT /tasks/:id/status (tasks.service.ts update/setStatus, tasks.controller.ts:31-39) · _reproduced_ · found by: employee  
   **Expected:** The global task.update permission should be scoped by an object-level check (project membership or assignee/creator) so an employee cannot rename, re-progress, or close tasks belonging to client matters they have no involvement in. At minimum a clean 403.  
   **Actual:** No membership/ownership/assignee gate exists in TasksService.update() or setStatus() (tasks.service.ts:164-254) or the controller. Any user holding the flat task.update code can tamper with and close ANY task org-wide, including confidential IP matters they are not staffed on.  
   **Repro:** Logged in as Ajay Sharma (Employee role, zero project memberships). Target task cmqze4kte00h8sjsu1evm2dsv ('Client interim findings call') belongs to project cmqze4krw00exsjsu2jy9yrpy which Ajay is NOT a member of and is NOT assigned to. `curl -b cookie -X PATCH /api/v1/tasks/cmqze4kte00h8sjsu1evm2dsv -d '{"title":"QATEST-HIJACKED","completionPercentage":99}'` returned HTTP 200 with the mutated task; `curl -X PUT /api/v1/tasks/cmqze4kte00h8sjsu1evm2dsv/status -d '{"statusId":"cmqze4krr00evsjsuxyte2r47"}'` (Closed) returned HTTP 200 and cascaded subtasks to CLOSED. (Restored to original afterward.)

4. 🟠 **IDOR create + membership bypass: task.create writes into any project and assigns non-members**  
   `rbac` · POST /tasks (tasks.controller.ts:10-13; tasks.service.ts create() — validates only that taskListId belongs to projectId, never that the actor or assignees are members) · _reproduced_ · found by: adversary  
   **Expected:** Creating a task should require membership in the target project; assigneeIds should be restricted to project members (or at least the endpoint should 403 for a non-member).  
   **Actual:** 200 OK — arbitrary task injected into a foreign project and assigned to a user who is not on that project. No membership validation on either the actor or the assignees.  
   **Repro:** As Khushi (non-member) POST /tasks {"title":"QATEST-foreign-create","projectId":"cmqze4kww00n8sjsus9jw131w","taskListId":"cmqze4kwz00ndsjsulc0es6pa","assigneeIds":["cmqze4kqg00cksjsumw1iasoe" (anant, also not a member)]} returned 200 and created the task with the non-member assignee.

5. 🟠 **Subtask endpoints ignore the parent :id — any subtask can be closed/reopened/deleted by id alone (IDOR)**  
   `rbac` · POST /tasks/:id/subtasks/:subtaskId/close|reopen and DELETE (tasks.controller.ts:63-76; service closeSubtask/reopenSubtask/softDeleteSubtask look up by subtaskId only) · _reproduced_ · found by: adversary  
   **Expected:** The :id path segment should be verified to own the subtask, and membership on the owning project enforced; a mismatched/foreign parent should 404/403.  
   **Actual:** 200 OK with a bogus parent id — subtask state of any task in any project is mutable by whoever holds the global task.update permission. Broken object-level authorization.  
   **Repro:** As Khushi, POST /tasks/GARBAGE-not-the-parent/subtasks/cmr22maxz01kuy2rz20fqofen/reopen (a subtask under a foreign task cmr22kpun...) returned 200 and DB flipped status CLOSED→OPEN. Re-closed it via /tasks/whatever/subtasks/<id>/close (200, restored to CLOSED). The parent task id in the path is never validated against the subtask.

6. 🟠 **IDOR status transition: non-member can close/reopen any task, force 100% and cascade-close its subtasks**  
   `rbac` · PUT /tasks/:id/status (tasks.controller.ts:36-39; tasks.service.ts setStatus()) · _reproduced_ · found by: adversary  
   **Expected:** 403 for a non-member; only project members/assignees should move a task's workflow state.  
   **Actual:** 200 OK — a stranger's task marked Closed/100% with subtask cascade, again with no membership check. Same root cause: global task.update permission, no project scope.  
   **Repro:** As Khushi (non-member) PUT /tasks/cmqze4kzx00s4sjsuug8jvliu/status {"statusId":"cmqze4krr00evsjsuxyte2r47" (Closed)} returned 200, set completionPercentage=100 and (per setStatus) closes all subtasks.

7. 🟡 **Read endpoints have no permission guard: any authenticated user can read any task and list any user's/project's tasks**  
   `rbac` · GET /tasks, GET /tasks/:id, GET /tasks/:id/subtasks · _reproduced_ · found by: manager  
   **Expected:** Read endpoints should require task.view (which exists as a permission) and ideally scope to projects the caller can access.  
   **Actual:** tasks.controller.ts GET routes are unguarded; no membership/permission enforcement on task reads.  
   **Repro:** GET /tasks?userId=<any other user id> returns 200 with that user's full task list. tasks.controller.ts lines 15-29 and 58-61: none of the GET handlers carry @RequirePermission('task.view') (unlike create/update/assign/delete). So the task.view permission is never enforced on reads and any logged-in account (e.g. an intern) can enumerate tasks by project or by userId and fetch any task by id.

8. 🟡 **Task read endpoints have no authorization: any user can read any task and enumerate any user's full workload**  
   `rbac` · GET /tasks/:id, GET /tasks?userId=, GET /tasks?projectId= (tasks.controller.ts:15-29, no @RequirePermission) · _reproduced_ · found by: employee  
   **Expected:** Reads should be scoped (project membership or a task.view permission). An employee should not be able to pull every task of a project they are not on, nor enumerate an arbitrary colleague's whole workload by userId.  
   **Actual:** The list/get/listSubtasks handlers carry no @RequirePermission, so PermissionGuard's opt-in model (permission.guard.ts:24) lets any authenticated user through with no object-level scoping. Confidentiality gap for a client-matter tool.  
   **Repro:** As Ajay (non-member): GET /api/v1/tasks/cmqze4kte00h8sjsu1evm2dsv -> HTTP 200 full task detail; GET /api/v1/tasks?userId=cmqze4kqg00cksjsumw1iasoe -> HTTP 200 returning Anant's entire assigned-task list (titles, due dates, projects); GET /api/v1/tasks?projectId=cmqze4krw00exsjsu2jy9yrpy -> HTTP 200 full task list of a non-member project.

9. 🟡 **Task can be assigned to a user who is not a member of the project**  
   `domain` · POST /tasks (assigneeIds), PUT /tasks/:id/assignees · _reproduced_ · found by: manager  
   **Expected:** Assigning a task to a user outside the project membership should be rejected (400) or the user auto-added to the project; an IP matter's task should not be handed to someone with no access to the project.  
   **Actual:** tasks.service.create()/setAssignees() write TaskAssignee rows for any userId with no project-membership check; the assignee is notified about a project they cannot open.  
   **Repro:** As Manager, POST /tasks {title:'QATEST-recheck', projectId:cmqze4kw200lssjsutzdm9ktu (Trademark Watch project), taskListId:cmqze4kw500lysjsuf0u7xqod, assigneeIds:[cmqze4kqj00cssjsuvd9xaaee = Shaveta]}. Shaveta is NOT a project_member of that project. Response 201, assignees:['Shaveta'], and a 'task.assigned' notification is emitted to her.

10. 🟡 **Membership bypass: employee can create tasks inside any project they are not a member of**  
   `rbac` · POST /tasks (tasks.service.ts create:26-108) · _reproduced_ · found by: employee  
   **Expected:** task.create should be constrained to projects the actor is a member of (or otherwise authorized on); creating work items inside another team's matter should 403.  
   **Actual:** create() only validates that the taskListId belongs to the given projectId (tasks.service.ts:27-32) — it never checks the actor's membership of that project. Any employee can inject tasks into any project org-wide.  
   **Repro:** As Ajay (Employee, no memberships): `curl -b cookie -X POST /api/v1/tasks -d '{"title":"QATEST-prio","projectId":"cmqze4krw00exsjsu2jy9yrpy","taskListId":"cmqze4ks000f4sjsuy9n0jm72","priority":"SUPERDUPER"}'` returned HTTP 201 and created the task in that non-member project (and recomputed its progress). (Deleted afterward.)

11. 🟡 **Manager can create/update/delete tasks in projects they are not a member of**  
   `rbac` · POST /tasks, PATCH /tasks/:id, DELETE /tasks/:id · _reproduced_ · found by: manager  
   **Expected:** For a delegation lead acting 'within granted scope', task write access should be scoped to projects the manager belongs to or leads.  
   **Actual:** RBAC is a flat permission-code check (task.create/update/delete) with no project-membership/row scoping in tasks.service; global task.* permission grants write on every project's tasks.  
   **Repro:** Manager (anant.gupta) is a member of zero real projects, yet POST /tasks into project cmqze4kw200lssjsutzdm9ktu succeeds (201), and DELETE on the created task succeeds (200).

12. 🟡 **hr@squarkip.com is role-stacked (HR + Manager + Senior Consultant), defeating the people-ops delivery boundary**  
   `rbac` · auth/roles — hr@ account · _reproduced_ · found by: hr  
   **Expected:** The canonical HR (people-ops) principal must not hold delivery-surface permissions (task.create/update/assign/delete); HR presets in permissions-catalog.ts:209 deliberately exclude all task.* codes.  
   **Actual:** The hr@ demo/service account carries Manager + Senior Consultant on top of HR, so it can create, edit, reassign, and delete tasks in any project — the exact delivery surface HR is designed to be walled off from. The role name 'HR' on this account is misleading.  
   **Repro:** psql: SELECT roles for hr@squarkip.com returns HR, Manager, Senior Consultant. Logged in as hr@ and successfully POST /api/v1/tasks -> 201 (created task cmru7l5a4...), PUT /:id/status -> 200, PUT /:id/assignees -> 200, PATCH -> 200. A pure-HR user (shavetasharma@) gets a clean 403 on every one of these.

13. 🟡 **Ungated GET endpoints let pure HR (no delivery surface) read any task and any project's task list**  
   `rbac` · tasks.controller.ts GET / , GET /:id , GET /:id/subtasks · _reproduced_ · found by: hr  
   **Expected:** HR is designed to have no delivery surface; delivery reads should be gated by a permission and/or project membership, not open to any authenticated user.  
   **Actual:** All task read endpoints are completely ungated — any authenticated user (including pure HR) can enumerate and read every matter's tasks/subtasks by id or by projectId.  
   **Repro:** As pure-HR shavetasharma@ (403 on every write), GET /api/v1/tasks/cmr4iqofb034gy2rz1pflfhkt -> 200 full task body (title 'Patent Analysis', description, hours, completion). GET /api/v1/tasks?projectId=... -> 200 full task list. Controller lines 15-29 and 58-61 carry no @RequirePermission and the service applies no role/membership scoping.

14. 🟡 **Subtask close/reopen/delete ignore the parent task id in the URL path (IDOR / integrity)**  
   `logic` · tasks.controller.ts:63-76 / tasks.service.ts:363-380 (closeSubtask/reopenSubtask/softDeleteSubtask) · _reproduced_ · found by: superadmin  
   **Expected:** The subtask endpoints should confirm the subtask belongs to the task named in the URL (or 404), so a subtask can only be acted on through its real parent.  
   **Actual:** Any task id (even a non-existent one) in the path is accepted; the operation runs purely on subtaskId with no parent-membership check.  
   **Repro:** POST /tasks/WRONG-TASK-ID/subtasks/<sid>/close (with a bogus/non-owning task id in the path) returned 200 and closed subtask cmru7jkmi0219cpkogtl4plu9, which actually belongs to task cmru7iesm01uwcpko69qp2imk. DELETE /tasks/ANOTHER-WRONG/subtasks/<sid> likewise reopened/mutated it. The service methods take only subtaskId; the :id path param is never used to verify ownership.

15. 🟡 **No project-membership check on task create or assignee-set — cross-matter access/assignment**  
   `rbac` · tasks.service.ts create() / setAssignees() · _reproduced_ · found by: hr  
   **Expected:** For an IP firm with need-to-know matter confidentiality, creating/assigning tasks should be limited to project members (or require an explicit override), and assignees should be validated as members of the parent project.  
   **Actual:** Any principal holding task.create/task.assign can create tasks in, and assign colleagues to, projects/matters they are not members of. No membership gate exists.  
   **Repro:** As hr@ (member count 0 for project cmqze4krw00exsjsu2jy9yrpy per project_member query), POST /tasks with that projectId -> 201 task created and linked. PUT /:id/assignees with meetu.singh (project_member count 0 for that project) -> 200, meetu assigned. No membership validation anywhere in create() (service.ts:26-108) or setAssignees() (service.ts:256-284).

16. 🟡 **No project-membership gate: tasks can be created in a project you don't belong to and assigned to non-members**  
   `rbac` · tasks.service.ts:26-108 (create) / :256-284 (setAssignees) · _reproduced_ · found by: superadmin  
   **Expected:** Per the persona brief, deliberate project-membership gates should hold even for a super-admin; at minimum assignees should be constrained to project members (or the absence of any gate flagged as a design gap).  
   **Actual:** There is no membership check anywhere in the tasks service — any actor with task.create/task.assign can create tasks in arbitrary projects and assign them to users who are not on the project, silently.  
   **Repro:** As Mohit (Super Admin, and verified NOT a member of project cmqze4krw... 'Prior Art & Invalidation'; members are Divyanshu/Yash/Arjun/Khushi), POST /tasks with that projectId succeeded (task cmru7iesm...), and assigneeIds=[cmqze4kqn... Ajay Sharma] — a user who is not a project member — was accepted and recorded. create() and setAssignees() only validate that the taskList belongs to the project; they never consult project_member.

17. 🔵 **No startDate <= dueDate ordering validation — task can start after it is due**  
   `validation` · CreateTaskDto / UpdateTaskDto (dto.ts:45-54,90-99 — dates validated individually, never relative) · _reproduced_ · found by: adversary  
   **Expected:** Reject (400) when startDate is after dueDate.  
   **Actual:** Accepted — produces nonsensical scheduling (negative duration) that will misrender on Gantt/capacity views and skew overdue logic.  
   **Repro:** POST /tasks with startDate 2026-12-31 and dueDate 2026-01-01 returned 200 and stored both as-is.

18. 🔵 **priority accepts arbitrary strings (no enum validation) — stores raw markup verbatim**  
   `validation` · CreateTaskDto.priority / CreateSubtaskDto.priority (dto.ts:36-37,131-132 — @IsString only) · _reproduced_ · found by: adversary  
   **Expected:** priority should be constrained to the known enum (LOW/MEDIUM/HIGH/URGENT) with @IsIn/@IsEnum → 400 on anything else.  
   **Actual:** Any string is accepted and stored, including unescaped HTML; breaks priority-based sorting/filtering and lands untrusted markup in the record.  
   **Repro:** POST /tasks with {"priority":"SUPERCRITICAL-<script>"} returned 200 and persisted priority exactly as "SUPERCRITICAL-<script>".

19. 🔵 **No cross-field validation: dueDate can be earlier than startDate**  
   `validation` · POST /tasks, PATCH /tasks/:id · _reproduced_ · found by: manager  
   **Expected:** dueDate should be required to be >= startDate (400 otherwise).  
   **Actual:** CreateTaskDto/UpdateTaskDto validate each date in isolation; the service stores both without comparing them, producing impossible schedules that feed the overdue logic.  
   **Repro:** POST /tasks {..., startDate:'2026-09-01', dueDate:'2026-06-01'} -> 201; task saved with due date three months before its start date.

20. 🔵 **Task priority accepts arbitrary free-text (no enum validation)**  
   `validation` · POST /tasks, dto.ts CreateTaskDto.priority (@IsString only, line 36-37) · _reproduced_ · found by: employee, manager  
   **Expected:** priority should be validated against the allowed set (LOW/MEDIUM/HIGH/URGENT etc.) and reject unknown values with 400.  
   **Actual:** priority is typed @IsString with no @IsEnum/@IsIn, so any string is stored. Downstream kanban grouping / priority-colour mapping can silently misbehave on the junk value.  
   **Repro:** POST /api/v1/tasks with '"priority":"SUPERDUPER"' returned HTTP 201 and persisted priority='SUPERDUPER'.

21. 🔵 **Subtask close/reopen/delete ignore the parent task id in the path (broken object reference / IDOR)**  
   `logic` · POST /tasks/:id/subtasks/:subtaskId/close|reopen, DELETE /tasks/:id/subtasks/:subtaskId · _reproduced_ · found by: manager  
   **Expected:** The :id path segment should be validated to own :subtaskId (else 404), so a mismatched parent cannot mutate an unrelated task's subtask.  
   **Actual:** closeSubtask/reopenSubtask/softDeleteSubtask (tasks.service.ts 363-380) look the subtask up by subtaskId only and never check it belongs to the :id task.  
   **Repro:** Create subtask S under task A. Call POST /tasks/<taskB>/subtasks/<S>/close where taskB is an unrelated task. Response 201 and S is closed, even though S does not belong to taskB.

22. 🔵 **priority accepts arbitrary free-text (no enum validation)**  
   `validation` · dto.ts:36-37 (CreateTaskDto.priority @IsString only) · _reproduced_ · found by: hr, superadmin  
   **Expected:** priority should be constrained to the allowed set (e.g. LOW/MEDIUM/HIGH/URGENT) and reject unknown values with 400.  
   **Actual:** Any string is persisted as the priority, producing junk values that UI/sorting/filtering cannot interpret.  
   **Repro:** POST /tasks with priority:"SUPER-URGENT-LOL" returned 200 and stored the task with priority="SUPER-URGENT-LOL" (task cmru7ispt...). Same for subtasks (CreateSubtaskDto.priority is also @IsString only).

23. 🔵 **Task reads (GET / and GET /:id) have no permission guard and expose any user's task list**  
   `rbac` · tasks.controller.ts:15-29 (list/get have no @RequirePermission); DeadlineVisibilityService injected at tasks.service.ts:18 but never used in reads · _code-evident_ · found by: superadmin  
   **Expected:** Read endpoints should be gated by a task.read/task.view permission (and scoped to projects the caller can see).  
   **Actual:** Reads are open to every authenticated principal regardless of role or project membership.  
   **Repro:** GET /tasks?userId=<anyId> (listForUser) and GET /tasks/:id carry no @RequirePermission decorator, so any authenticated user can read arbitrary tasks and any other user's assigned-task list. get() returns the raw (taskIncludeFull) record. Not a super-admin problem (owner should read all) but is over-exposure for lower roles; verified by decorator absence in the controller.

24. 🔵 **Task create response reports projectTasks:[] though the project link is created in the same transaction**  
   `logic` · tasks.service.ts create() lines 59-92 · _reproduced_ · found by: hr  
   **Expected:** The create response should reflect the ProjectTask link (which project/tasklist the task landed in).  
   **Actual:** `created` is built with taskInclude() (line 77) BEFORE tx.projectTask.create() (line 83), so the returned object snapshots an unlinked state. A client that relies on the create response cannot tell which project/tasklist the task belongs to.  
   **Repro:** POST /tasks -> 201 body contains "projectTasks":[]; immediate GET /tasks/:id -> "projectTasks":[{projectId, taskListId, sequence:10}]. The link exists; only the create response omits it.

25. 🔵 **dueDate before startDate is accepted (no cross-field date sanity check)**  
   `validation` · tasks.service.ts:56,64-56 / dto.ts:45-54 (startDate/dueDate) · _reproduced_ · found by: superadmin  
   **Expected:** Reject (400) when dueDate precedes startDate.  
   **Actual:** No relational date validation; logically impossible schedules are saved and will feed 'overdue' and Gantt logic.  
   **Repro:** POST /tasks with startDate:"2026-12-01", dueDate:"2026-01-01" returned 200 and stored startDate 2026-12-01 / dueDate 2026-01-01 (task cmru7j9wn...), i.e. a task due 11 months before it starts.


### capacity  (12 unique — 🟡2 🔵6 ⚪4)

1. 🟡 **Team board row totals don't reconcile — committed + free wildly exceeds capacity, masking a catastrophically overloaded person as ~83% busy**  
   `data-integrity` · GET /capacity/team (capacity.module.ts:275-321) · _reproduced_ · found by: manager  
   **Expected:** Row-level committedHours + freeHours should equal capacityHours, and the headline utilization should reflect that a person has far more committed work than capacity (i.e. read as overloaded, not 17% free).  
   **Actual:** Overdue tasks dump their entire remaining effort onto today (per the model), so today's load exceeds daily capacity; the excess is counted in committedHours but per-day free is clamped to 0, so the row totals no longer reconcile. Row utilization = committed/capacity spreads that single-day pileup across the whole 14-day denominator and reports 83% (Mohit) / 20% (Amritpal), so a delivery lead scanning 'who can take work' sees these people as having spare capacity when today is saturated 805%/204%.  
   **Repro:** Login as Manager (anant.gupta) → GET /capacity/team?days=14. Mohit Kalra row: committedHours=80, freeHours=83.6, capacityHours=96 (80+83.6=163.6 ≠ 96), row utilization=83%. But his day-0 (today) object is load=77.2 on capacity=9.6 → a single working day carrying 77 hours of work. Amritpal Kaur: committed 19.6 + free 86.4 = 106 ≠ cap 96, today load 19.6 on 9.6.

2. 🟡 **hr@ people-ops account is role-stacked (Manager + Senior Consultant), giving it capacity.view plus full project/task/issue write access — breaking the HR delivery-surface boundary**  
   `rbac` · seed/role assignment (user_role for hr@squarkip.com) · _reproduced_ · found by: hr  
   **Expected:** An HR / people-ops account should have no delivery surfaces — no capacity.view and no project/task/issue writes, matching the pure HR role and the shavetasharma account.  
   **Actual:** The hr@ reference account can read the full capacity board and create/update/approve projects, tasks and issues because it is stacked with two delivery roles. This over-privileges people-ops and makes hr@ an unreliable boundary test in demo/prod.  
   **Repro:** DB: hr@squarkip.com holds roles HR,Manager,Senior Consultant. Live: login hr@squarkip.com and GET /capacity/team -> 200 with full org board; DB shows the account also has project.create/update/approve, task.create/delete/update/assign, issue.create/update. By contrast the pure HR account shavetasharma@squarkip.com gets 403 on all 4 capacity endpoints AND 403 on POST /projects (Missing permission: project.create). The pure HR role grants none of these perms.

3. 🔵 **coverage-risks surfaces tasks that were already overdue BEFORE the leave started as 'due while they're out'**  
   `domain` · CapacityService.atRiskTasks / coverageRisks task filter (capacity.module.ts) · _reproduced_ · found by: hr  
   **Expected:** Coverage-at-risk should ideally distinguish work due during the absence from pre-existing overdue backlog, or the messaging ('due while they're out') should not claim the overdue task became at-risk because of the leave.  
   **Actual:** Pre-existing overdue tasks are folded into the leave's coverage risk with the 'due while they're out' framing, slightly overstating the leave's impact.  
   **Repro:** GET /capacity/coverage-risks shows Arjun Ghosh's task 'BLE data-sync method search' dueDate 2026-07-10 (overdue:true) as a coverage risk for a leave starting 2026-07-21. The task was overdue 11 days before the leave even began.

4. 🔵 **coverage-risks labels an in-progress leave booked 22 days in advance as an emergency short-notice coverage risk**  
   `domain` · CapacityService.isShortNotice / coverageRisks (capacity.module.ts ~L465-520) · _code-evident_ · found by: hr  
   **Expected:** A leave booked 22 days ahead should not read as an 'emergency/short-notice' coverage risk; the emergency framing and noticeDays field should be consistent.  
   **Actual:** noticeDays:22 appears under an emergency short-notice risk board, mixing well-planned-but-active leaves with true short-notice ones. Functionally the reassignment prompt is still valid, but the emergency labeling is misleading to HR.  
   **Repro:** GET /capacity/coverage-risks as hr@ returns Arjun Ghosh EL 2026-07-21..07-25 with noticeDays:22 in the emergency risks list. isShortNotice returns true purely because start<=today ('already started — the ultimate short notice'), so a well-planned leave that merely began today is surfaced as an emergency alongside a contradictory noticeDays:22.

5. 🔵 **coverage-risks lists tasks already overdue BEFORE the leave starts as 'risks caused by' that leave**  
   `logic` · GET /capacity/coverage-risks (capacity.module.ts:531) · _reproduced_ · found by: manager  
   **Expected:** Coverage risk should be work that the leave prevents getting done during (or after) the leave; already-overdue pre-leave tasks are a separate problem and arguably shouldn't be attributed to this leave.  
   **Actual:** The filter includes any of the person's open tasks with dueDate ≤ window end, so pre-existing overdue tasks unrelated to the absence are folded into the leave's risk list, inflating the apparent coverage impact.  
   **Repro:** GET /capacity/coverage-risks. Arjun Ghosh's EL leave (2026-07-21→07-25) surfaces tasks 'BLE data-sync method search' (dueDate 2026-07-10, overdue:true) and 'Build claim chart' (dueDate 2026-07-20, overdue:true) — both due days/weeks before the leave window even opens.

6. 🔵 **Field name 'utilization' has two incompatible scales in the same API — 0–1 fraction at day level, 0–100 percentage at row level, and the day-level value is unclamped (can be 8.05 = 805%)**  
   `ab-inconsistency` · GET /capacity/team (capacity.module.ts:282 vs 321) · _reproduced_ · found by: manager  
   **Expected:** A single field name should carry a single, documented unit; a UI reading `utilization` uniformly will render day-level values off by 100x.  
   **Actual:** Day-level utilization = load/9.6 (fraction, rounded to 2dp, uncapped so can exceed 1.0); row-level utilization = round(committed/capacity*100) (percentage 0-100). Contract inconsistency invites frontend mis-rendering.  
   **Repro:** GET /capacity/team. rows[].days[].utilization is a fraction (e.g. today FREE day = 0.0, Mohit today = 8.05); rows[].utilization is a percentage (e.g. 83). Same key, different units.

7. 🔵 **GET /capacity/history ignores its documented 30-day default and falls back to 14 days**  
   `logic` · apps/api/src/modules/capacity/capacity.module.ts:611-613 · _reproduced_ · found by: superadmin  
   **Expected:** The retrospective 'Past 30 days' view should default to 30 days when no days param is supplied, matching the documented/service-level default of 30.  
   **Actual:** With no days param the history endpoint returns only a 14-day window; the 30-day default is unreachable because the controller always passes parseHorizon(days) (14 when absent). Any consumer not explicitly sending days=30 silently gets a shorter retrospective window than intended.  
   **Repro:** GET /capacity/history with no query params returns from=2026-07-08 to=2026-07-21 (14 days); GET /capacity/history?days=30 returns from=2026-06-22 to=2026-07-21 (30 days). The controller history() calls this.capacity.teamHistory(organizationId, parseHorizon(days)). parseHorizon returns DEFAULT_DAYS=14 when days is undefined, so teamHistory's own `days = 30` default (line 342) is dead code and never applies.

8. 🔵 **GET /capacity/history with no days param returns a 14-day window, contradicting the service's own 30-day default and the 'Past 30 days' range intent**  
   `ab-inconsistency` · apps/api/src/modules/capacity/capacity.module.ts:611-613 (controller) vs :342 (teamHistory default=30) · _reproduced_ · found by: adversary  
   **Expected:** With no days param the history/retrospective view should honor its documented 30-day default (matching the 'Past 30 days' range), i.e. return 30 days.  
   **Actual:** The controller calls parseHorizon(days), which returns DEFAULT_DAYS=14 when days is absent, shadowing teamHistory's own days=30 default. The history endpoint therefore defaults to 14 days, not 30. Forward-board default (14) is fine; the retrospective endpoint should default to 30. Cosmetic-only in practice since the frontend passes days explicitly.  
   **Repro:** As a capacity.view holder (nitin.goel@squarkip.com): GET /capacity/history (no query) -> {from:2026-07-08,to:2026-07-21}, 14 day-cells. GET /capacity/history?days=30 -> {from:2026-06-22,to:2026-07-21}, 30 day-cells.

9. ⚪ **team/history/coverage/project silently ignore unsupported from/to query params (only days is honored), returning the default window with no 400**  
   `validation` · CapacityController @Query('days') (capacity.module.ts ~L560-640) · _reproduced_ · found by: hr  
   **Expected:** Either honor documented range params or reject unknown ones; a caller passing a reversed/garbage date range should not silently receive a different (default) window.  
   **Actual:** Reversed/garbage from/to are silently discarded and the default horizon is returned, which could mislead an integrator into thinking their range filter applied. Low impact since the endpoint is read-only and the real param (days) is correctly clamped.  
   **Repro:** GET /capacity/team?from=2026-08-10&to=2026-07-01 and ?from=notadate&to=alsobad both return the default 2026-07-21..2026-08-03 window (14 days) with HTTP 200 — the from/to params are not part of the contract (the horizon param is 'days'). No error surfaces to signal the params were ignored.

10. ⚪ **team/history/coverage endpoints silently ignore from/to query params (only `days` is honored) — no 400 on bad/reversed dates**  
   `validation` · GET /capacity/* controllers (capacity.module.ts:603,611,622) · _reproduced_ · found by: manager  
   **Expected:** Either honor from/to, or reject unknown/garbage params; a caller assuming from/to works gets silently wrong (default) data with no error.  
   **Actual:** Controllers read only @Query('days'); any from/to/other params are ignored. This is defensive against garbage (no crash) but silently misleads a client that thinks it scoped a date range. Low risk since UI drives `days`.  
   **Repro:** GET /capacity/team?from=2026-08-10&to=2026-07-01 (reversed) and ?from=notadate&to=alsobad both return the default 2026-07-21→2026-08-03 window with 200, identical to no params. Only ?days=N changes the window.

11. ⚪ **Employee/HR RBAC on capacity module is correctly enforced (clean 403, guard runs before param parsing) — no bug**  
   `rbac` · apps/api/src/modules/capacity/capacity.module.ts (all @RequirePermission('capacity.view')) · _reproduced_ · found by: adversary  
   **Expected:** Employees get a clean 403 on every capacity route regardless of params.  
   **Actual:** Confirmed clean 403 on all routes and all malformed-param variants. Reported as info to document the positive coverage; not a defect.  
   **Repro:** As khushi.gupta@squarkip.com (Senior Research Associate, Employee): every route -> 403 {message:'Missing permission: capacity.view'}: /capacity/team, /capacity/history, /capacity/coverage-risks, /capacity/project/:id. Same clean 403 even with malformed params (from=2026-12-01&to=2026-01-01, from=1900&to=2200, from=notadate, a projectId the actor cannot see) — the permission guard short-circuits before any param/date handling, so no 500 or silent success.

12. ⚪ **No client-deadline leakage and no cross-tenant/out-of-org leakage in capacity responses**  
   `domain` · apps/api/src/modules/capacity/capacity.module.ts:104-119, 149-183, 515-563 · _code-evident_ · found by: adversary  
   **Expected:** Client deadlines never surface on a capacity board; cross-tenant ids 404; only in-org people appear.  
   **Actual:** All confirmed. clientDueDate is never selected; only internal dueDate (which capacity.view holders legitimately see). Org scoping holds. No defect.  
   **Repro:** As nitin.goel (manager): team/history/coverage-risks/project responses expose only task dueDate (internal deadline) and never project.clientDueDate. project/:id is org-scoped via members.some.user.organizationId -> a fake/cross-tenant id returns 404 ('Project not found'); a valid in-org project the caller is NOT a member of returns data, which is by-design for the org-wide availability board (capacity.view). Leaves/users/holidays queries all filter organizationId.


### performance  (14 unique — 🟠1 🟡2 🔵9 ⚪2)

1. 🟠 **hr@ seed account is role-stacked and holds full delivery-write + org-analytics permissions, defeating the 'HR = people-ops, no delivery surfaces' boundary**  
   `rbac` · RBAC / seed role config (cross-cuts performance org endpoints + projects/tasks/issues) · _reproduced_ · found by: hr  
   **Expected:** An HR/people-ops user should have no delivery write surface (cannot create projects/tasks/issues) and org-wide performance visibility should be an intentional people-ops grant, not a side effect of Manager role stacking. The design intent per spec is HR has no delivery surfaces.  
   **Actual:** The hr@ demo/seed account carries the Manager and Senior Consultant roles in addition to HR, so it silently passes every delivery-write and org-analytics check. The intended HR boundary is untestable/unenforced on this account; anyone testing 'as HR' sees a false pass.  
   **Repro:** psql shows hr@squarkip.com (userId cmqze4kr300dcsjsuvnpxt1gl) is assigned three roles: Manager, Senior Consultant, HR. Effective perms include project.create, project.update, project.approve, task.create, task.update, task.delete, task.assign, issue.create, issue.update AND analytics.view.organization (count=2, from two stacked roles). Live proof: `POST /performance/org` -> 200 full org leaderboard; `POST /performance/users/<arjun>` -> 200 (reads another user's KPIs); `POST /projects {"title":"QATEST-hr-proj"}` -> 201 created id cmrumpz2d04x9cpkoqaexhum8 (deleted during cleanup). By contrast a pure Employee (Arjun) is cleanly blocked on all the same calls (403).

2. 🟡 **Org performance/rebuild endpoints trust a client-supplied organizationId (cross-tenant read; unscoped when omitted)**  
   `rbac` · GET /performance/org, /org-heatmap, /org/breakdowns, /org/trend, POST /performance/snapshots/rebuild · _reproduced_ · found by: manager  
   **Expected:** organizationId should be derived from the authenticated actor's own org (server-side), not accepted/trusted from the query string; requests for another org should 403 and omission should scope to the caller's org.  
   **Actual:** organizationId is taken verbatim from the query param and passed to Prisma `where:{organizationId}`; when omitted the filter becomes undefined and Prisma returns ALL orgs' data. In a multi-tenant deployment a user with org-analytics in org A could read org B's aggregate performance (and trigger snapshot rebuilds) by passing org B's id. Single-org deployment currently masks the impact.  
   **Repro:** As manager (analytics.view.organization): `curl -b cookie 'http://localhost:4000/api/v1/performance/org'` WITHOUT any organizationId returns full aggregate data -> 200 {"totals":{"users":28,...}}. Passing an arbitrary organizationId (e.g. ?organizationId=BOGUSORG999) returns 200 with that org's scope ({"users":0}). The @RequirePermission('analytics.view.organization') guard checks the actor's permission globally but never verifies the actor belongs to the organizationId supplied in the query.

3. 🟡 **Intern (via Manager role) is exposed to full org-wide performance data and can trigger snapshot rebuilds**  
   `rbac` · performance /org, /users/:id, /snapshots/rebuild · _reproduced_ · found by: superadmin  
   **Expected:** An intern should not have org-wide analytics access; sensitive firm-wide performance/billable-hour data and the heavy snapshot-rebuild write should be restricted to management. The Manager role assignment on an intern account over-exposes all 28 employees' metrics.  
   **Actual:** Intern account reads every employee's performance metrics, the org leaderboard/rankings, and triggers org-wide snapshot rebuilds. Contrast: a true non-privileged Research Associate (divyanshu.saxena) correctly gets clean 403s on the same endpoints.  
   **Repro:** User anant.gupta@squarkip.com — designation 'Intern- Product Development & Research' — holds the Manager role (DB: user_role→role.name='Manager'), which grants analytics.view.organization. Logged in as this intern, GET /performance/org (200, users:28, full leaderboard+billable hours), /org-heatmap, /org/breakdowns, /org/trend, GET /performance/users/<Mohit-VP> (200, full KPIs), and POST /performance/snapshots/rebuild (201 {ok:true,days:835}) all succeed.

4. 🔵 **Heatmap accepts negative/zero days and silently returns empty instead of clamping (inconsistent with other endpoints)**  
   `validation` · GET /performance/heatmap/:userId · _reproduced_ · found by: manager  
   **Expected:** Consistent input handling: negative/zero days should clamp to a sane minimum (as /me and /org do) rather than silently producing an empty result.  
   **Actual:** Heatmap uses `days ? Math.min(parseInt(days,10),366) : 365` with no lower bound, so negative/zero windows pass through and yield an empty, misleading heatmap without any error.  
   **Repro:** `.../heatmap/<me>?days=-100` -> 200 {"days":[]}; `.../heatmap/<me>?days=0` -> 200 {"days":[]}; but `.../heatmap/<me>?days=abc` -> 400. Meanwhile /performance/me and /org clamp via Math.max(1,Math.min(365,n)) so days=0/-5 become 1 and days=99999 becomes 365.

5. 🔵 **periodDays query param silently ignored; only 'days' is honored**  
   `ab-inconsistency` · GET /performance/me and related derived-metric endpoints · _reproduced_ · found by: employee  
   **Expected:** A single documented param name; requests using the wrong name should either work or be rejected, not silently fall back to the 30-day default.  
   **Actual:** The accepted query key is 'days'. Any caller passing 'periodDays' (the field name echoed in the response body) is silently ignored and served 30-day data with no error, which can mislead a client that round-trips the response key.  
   **Repro:** curl -b cookie 'http://localhost:4000/api/v1/performance/me?periodDays=7' returns "periodDays":30 (default, param ignored), whereas 'http://localhost:4000/api/v1/performance/me?days=7' returns "periodDays":7.

6. 🔵 **getUserPerformance user lookup has no deletedAt/organization filter**  
   `data-integrity` · GET /performance/users/:userId (+ /breakdowns, /heatmap) · _code-evident_ · found by: manager  
   **Expected:** Target user lookup should be scoped to the actor's organization and exclude soft-deleted users.  
   **Actual:** No org/deletedAt scoping on the target; combined with the client-supplied-org issue above, metrics can be read for entities outside the actor's tenant boundary.  
   **Repro:** performance.service.ts:69-73 does prisma.user.findUnique({where:{id:userId}}) with no deletedAt or organizationId constraint; assertCanView only checks analytics.view.organization. A manager can thus resolve metrics for a soft-deleted user or (in multi-tenant) a user in another org purely by id. Bogus id correctly 404s.

7. 🔵 **Snapshot rebuild (a heavy write/recompute) is gated by a read-only 'view' permission**  
   `rbac` · POST /performance/snapshots/rebuild · _code-evident_ · found by: manager  
   **Expected:** A state-mutating recompute over the whole org's users (writes user_metric_daily rows) should require a distinct manage/write permission (e.g. analytics.manage) rather than a view permission, and/or be rate-limited beyond the global throttle.  
   **Actual:** Anyone with the analytics.view.organization *read* permission can repeatedly trigger a full org-wide snapshot rebuild — a semantic RBAC mismatch (view grant authorizes an expensive write).  
   **Repro:** As manager: `curl -X POST -b cookie 'http://localhost:4000/api/v1/performance/snapshots/rebuild?organizationId=cmqze4knz0000sjsu7ljwqivj'` -> 201 {"ok":true,"days":835}. Guard is @RequirePermission('analytics.view.organization') (performance.module.ts:65-68).

8. 🔵 **getUserPerformance / assertCanView is not org-scoped (potential cross-org read for a privileged actor)**  
   `rbac` · apps/api/src/modules/performance/performance.service.ts:61-73 · _code-evident_ · found by: adversary  
   **Expected:** The target user (and underlying task/attendance queries) should be constrained to the actor's organizationId so org-wide analytics permission cannot read across tenant boundaries.  
   **Actual:** No organizationId scoping on the user lookup or the metric guard; relies entirely on the deployment being single-org. If a second org is ever added, analytics.view.organization becomes a cross-tenant read.  
   **Repro:** assertCanView() only checks actorId===targetUserId OR analytics.view.organization; getUserPerformance() does prisma.user.findUnique({where:{id:userId}}) with no organizationId filter. A caller holding analytics.view.organization can pass ANY userId, including one belonging to a different organization, and receive their derived metrics. Not reproducible as an Employee (I lack the org perm and got a clean 403), so confidence is code-evident only.

9. 🔵 **assertCanView / getUserPerformance apply no same-organization filter on the target userId**  
   `rbac` · apps/api/src/modules/performance/performance.service.ts:61-73 · _code-evident_ · found by: hr  
   **Expected:** User-metric lookups should be constrained to the actor's own organization so an org-scoped analytics grant cannot cross tenant boundaries.  
   **Actual:** No organizationId predicate on the lookup or the guard; access is purely 'has org-view perm'. Impact is currently theoretical because this is a single-org deployment, hence low, but it is a latent cross-org IDOR if multi-org is ever enabled.  
   **Repro:** assertCanView (line 61) only checks actorId===targetUserId OR analytics.view.organization; getUserPerformance (line 68) does prisma.user.findUnique({where:{id:userId}}) with no organizationId scoping. Any actor holding analytics.view.organization could read a user belonging to a different Organization by id.

10. 🔵 **Heatmap days param lacks lower-bound clamping; negative/zero yield empty 200 while non-numeric yields opaque 400**  
   `validation` · performance.module.ts heatmap route · _reproduced_ · found by: superadmin  
   **Expected:** Consistent clamping (min 1, default 365) like the other routes, with a clear validation error for non-numeric input.  
   **Actual:** Negative/zero silently return an empty heatmap; non-numeric produces a generic 400 rather than being clamped — inconsistent with sibling endpoints.  
   **Repro:** As superadmin: GET /performance/heatmap/<id>?days=-30 → 200 {days:[]}; ?days=0 → 200 {days:[]}; ?days=abc → 400 'Invalid request data.' (parseInt→NaN slips downstream). The /me and /org routes use periodDays() which clamps to min 1, but the heatmap route uses Math.min(parseInt(days),366) with no lower bound or NaN guard.

11. 🔵 **Org performance endpoints trust client-supplied organizationId and return all-orgs data when it is omitted**  
   `data-integrity` · performance.module.ts org/org-heatmap/org/breakdowns/org/trend/snapshots/rebuild · _reproduced_ · found by: superadmin  
   **Expected:** organizationId should be derived from / validated against the authenticated actor's org, not accepted blindly from the query string; omission should scope to the actor's org, not return everything.  
   **Actual:** Endpoints scope purely by an untrusted client param. Single-org deployment makes impact low today, but a privileged user in one org could read another org (or all orgs) by manipulating the parameter.  
   **Repro:** As superadmin: GET /performance/org (no organizationId) returns full data (users:28); GET /performance/org?organizationId=BOGUS123 returns users:0; POST /performance/snapshots/rebuild?organizationId=BOGUS123 returns 201 {ok:true,days:0}. The organizationId comes straight from @Query and is never checked against the actor's own organization; when absent the Prisma filter is undefined so it aggregates across all organizations.

12. 🔵 **heatmap and breakdowns endpoints return 200 with fabricated/empty data for a non-existent userId instead of 404 (inconsistent with /performance/users/:userId)**  
   `ab-inconsistency` · performance.service.ts getUserHeatmap / getUserBreakdowns vs getUserPerformance · _reproduced_ · found by: hr  
   **Expected:** All three user-scoped read endpoints should behave consistently — 404 for an unknown userId — rather than one 404 and two 200s.  
   **Actual:** getUserPerformance does a findUnique existence check (404), but the heatmap and breakdowns paths skip it and return a fabricated 200 response for any arbitrary string.  
   **Repro:** As HR: `GET /performance/users/NOTAREALID` -> 404 {"message":"User NOTAREALID not found"}. But `GET /performance/heatmap/BOGUS` -> 200 with a full days[] array, and `GET /performance/users/BOGUS/breakdowns` -> 200 {"userId":"BOGUS","tasksByStatus":[],...}. Both echo back the attacker-supplied id and synthesize a payload without checking the user exists.

13. ⚪ **days query param clamps invalid values silently instead of 400 (defensive, minor UX)**  
   `validation` · apps/api/src/modules/performance/performance.service.ts (windowRange/days handling) · _reproduced_ · found by: adversary  
   **Expected:** Out-of-range or non-numeric days could return 400 for clarity, but silent clamping to [1,365] is a safe, non-exploitable choice.  
   **Actual:** Clamps gracefully; no crash, no 500, no data-boundary escape. Recorded as info only — not a defect.  
   **Repro:** GET /performance/me?days=-5 and ?days=0 both return periodDays:1; ?days=99999 returns periodDays:365; ?days=1e9 -> periodDays:1 (parseInt stops at '1'); ?days=abc -> periodDays:30 (default). All HTTP 200.

14. ⚪ **Pure-Employee performance boundaries are correctly enforced (positive control)**  
   `rbac` · performance endpoints as a non-privileged Employee · _reproduced_ · found by: hr  
   **Expected:** Non-privileged users see only their own metrics; org and cross-user reads are denied with 403; malformed input does not crash.  
   **Actual:** Matches expectation — IDOR is properly gated for a pure Employee and input handling is defensive. This confirms the high finding above is a seed role-stacking issue on hr@, not a broken code gate.  
   **Repro:** Logged in as arjun.ghosh@squarkip.com (role: Employee only, analytics.view.organization count=0). GET /performance/me -> 200 (own metrics). GET /performance/users/<vijay>, /users/<hr>, /users/<x>/breakdowns, /heatmap/<x> all -> clean 403 'Not allowed to view this user's performance.'. GET /performance/org and POST /performance/snapshots/rebuild -> 403 'Missing permission: analytics.view.organization'. days param is safely clamped (0/-5->1, 99999->365, 1.5->1, abc/empty->30) with no 500s.


### issues  (25 unique — 🟠8 🟡9 🔵6 ⚪2)

1. 🟠 **IDOR: any user can read issues (and their descriptions) of projects they are not a member of**  
   `rbac` · GET /issues, GET /issues/:id (issues.service.ts list/get, issues.controller.ts) · _reproduced_ · found by: adversary  
   **Expected:** A non-member should not be able to enumerate or read issues (which carry free-text titles/descriptions about confidential IP matters) of projects they are not on; expect 403/empty.  
   **Actual:** list()/get() in issues.service.ts filter only by {projectId, deletedAt:null} with no ProjectMember check, and the controller GET routes have NO @RequirePermission at all. Any authenticated user reads any project's issues. Confidential matter data leaks across the firm.  
   **Repro:** Logged in as khushi.gupta (Senior Research Associate, NOT a member of project cmqze4kww00n8sjsus9jw131w 'Patent Landscape — EV Battery Chemistry'). GET /issues?projectId=cmqze4kww00n8sjsus9jw131w -> 200 with full issue list; GET /issues/cmrums4tx05m7cpko8c1h8c7l -> 200 returning title/description/reporter of an issue in that project.

2. 🟠 **GET /issues and GET /issues/:id have no permission guard and no project scoping — any authenticated user can read every project's issues**  
   `rbac` · GET /issues, GET /issues/:id — issues.controller.ts:10-18; issues.service.ts:34-48 · _reproduced_ · found by: manager  
   **Expected:** Read endpoints should require issue.view and restrict to projects the caller can see; issues of unrelated projects should not be enumerable.  
   **Actual:** Both GET routes are ungated and unscoped; issue titles/descriptions of any project (which for an IP firm can contain sensitive prior-art/client context) leak to any logged-in user by projectId or issue id (IDOR).  
   **Repro:** GET /issues?projectId=cmqze4kww00n8sjsus9jw131w (a project I am not a member of) returned issue rows with full detail. The controller's list() and get() carry NO @RequirePermission decorator (unlike create/update/delete) and the service applies no membership filter — only where:{projectId,deletedAt:null}.

3. 🟠 **Non-creator can edit (and, with the delete grant, delete) any other user's issue**  
   `rbac` · PATCH /issues/:id — IssuesService.update (issues.service.ts:74-86); softDelete (89-97) · _reproduced_ · found by: manager  
   **Expected:** update/softDelete should enforce ownership or a project-manage scope so a user cannot silently rewrite/remove another person's issue and its associated time record.  
   **Actual:** Neither update() nor softDelete() checks reportedBy or project membership; possession of the flat issue.update / issue.delete permission is sufficient to mutate any issue org-wide.  
   **Repro:** PATCH /issues/cmqze4ktl00hjsjsuc23hkybh (reportedBy=divyanshu.saxena, not me) {title:'QATEST-hijacked-by-anant'} returned 200 and rewrote the title while reportedBy stayed divyanshu's. (Reverted immediately to the original title.) softDelete has the identical structure with no ownership/membership check — any issue.delete holder can soft-delete anyone's issue plus its timesheet.

4. 🟠 **Any user can raise an issue (and log non-billable time) against a project they are not a member of / cannot see**  
   `rbac` · POST /issues — IssuesService.create (issues.service.ts:51-72) · _reproduced_ · found by: manager  
   **Expected:** create() should verify the caller can access the target project (membership or an all-projects grant) and 403 otherwise — a delivery lead should not be able to inject issues/time into projects outside their scope.  
   **Actual:** No project-membership or visibility check exists in create(); it only checks the issue.create permission. Any holder can raise issues and log non-billable time on arbitrary projects.  
   **Repro:** Logged in as anant.gupta@squarkip.com (role Manager; NOT a member of any project). POST /issues {projectId:'cmqze4kww00n8sjsus9jw131w' (Patent Landscape — EV Battery, no membership), title:'QATEST-membership-bypass', hours:2}. Response 201 with the created issue; DB confirmed a non-billable timesheet (issueId set, billable=f, 2h) was written under my userId against that project.

5. 🟠 **Issue read endpoints (GET /issues, GET /issues/:id) have NO permission guard — any authenticated user reads all delivery issues in any project**  
   `rbac` · issues.controller.ts GET / and GET /:id · _reproduced_ · found by: hr  
   **Expected:** Reads should require issue.view (the permission exists) and honor project membership, so people-ops with no delivery role cannot enumerate matter-sensitive issues.  
   **Actual:** GET / and GET /:id carry no @RequirePermission decorator (issues.controller.ts:10-18) and the service performs no membership/visibility check, so any logged-in user reads every issue across every project. Issue titles/descriptions leak client matter detail (e.g. 'Translation needed for JP reference', 'Reference C publication date unverified', assignee/reporter identities).  
   **Repro:** Login as pure HR shavetasharma@squarkip.com (role-hr only: zero issue/project/task permissions, zero project memberships). GET /issues?projectId=cmqze4krw00exsjsu2jy9yrpy -> HTTP 200 returning the full issue list; GET /issues/cmqze4ktl00hksjsuead8ffhq -> HTTP 200 with full issue body (title, description, severity, assignee, reporter). The three write endpoints correctly return 403 for the same user, proving the guard was simply omitted on reads.

6. 🟠 **GET /issues and GET /issues/:id have no permission guard or project-membership check — any authenticated user reads every project's issues**  
   `rbac` · issues.controller.ts GET / and GET /:id (list/get in issues.service.ts) · _reproduced_ · found by: employee  
   **Expected:** Reads should require issue.view AND be scoped to projects the actor can access (member/visible); a non-member should get 403/empty, not another project's confidential issue titles and descriptions.  
   **Actual:** Both GET endpoints are unguarded (no @RequirePermission decorator, no membership filter). Any logged-in user reads any project's issue titles/descriptions by id or projectId. Information disclosure + RBAC bypass. Inventory claimed GET requires issue.view, but the controller has no such decorator.  
   **Repro:** Logged in as Ajay Sharma (employee, member of NO project, holds only issue.create + issue.view). GET http://localhost:4000/api/v1/issues?projectId=cmqze4kww00n8sjsus9jw131w (EV Battery project he is not a member of) returned HTTP 200 with the full issue list including title 'Database export hitting record cap' and its description 'The bulk export truncates at 10k records; need batched extraction by year.'. GET /issues/cmqze4kxf00o8sjsu6dfdoxak on an arbitrary issue id likewise returned HTTP 200 with full body. Neither GET handler carries @RequirePermission, so issue.view is never enforced and no project-scoping is applied.

7. 🟠 **GET /issues and GET /issues/:id have no permission guard and no membership filter — any authenticated user can read every project's issues + reporter PII**  
   `rbac` · issues.controller.ts list()/get() · _reproduced_ · found by: superadmin  
   **Expected:** Reads should be gated by an issue.read/project-membership check so a non-member (e.g. an intern) cannot enumerate another project's technical issues and reporter PII by supplying a projectId.  
   **Actual:** Both read endpoints are effectively public to any logged-in user; issues and reporter identities of projects you are not a member of are fully exposed.  
   **Repro:** As mohit (superadmin) but the guard gap is role-independent: `curl -b cookie 'http://localhost:4000/api/v1/issues?projectId=cmqze4ktq00hpsjsublst646g'` (FTO project — mohit is NOT a member) returns 200 with the full issue list including reporter {firstName,lastName,email,profilePhoto}. Neither GET endpoint carries a @RequirePermission decorator (only POST/PATCH/DELETE do), and issues.service.list/get apply no project-membership check.

8. 🟠 **POST /issues does not verify project membership — user can raise an issue and self-log a non-billable timesheet in a project they cannot access**  
   `rbac` · issues.service.ts create() (no membership check on dto.projectId) · _reproduced_ · found by: employee  
   **Expected:** create should reject (403) raising an issue in a project the actor is not a member of / cannot see, since it writes both an issue and a non-billable timesheet into that project's data.  
   **Actual:** create() only checks the issue.create permission; it never validates that the actor belongs to dto.projectId. Any user with issue.create can inject issues + timesheets into arbitrary projects, polluting another team's issue list and time records.  
   **Repro:** As Ajay (member of no project) POST /issues {projectId: cmqze4kww00n8sjsus9jw131w (EV Battery, non-member), title:'QATEST-emp-nonmember', hours:2} returned HTTP 201. DB confirmed a new issue with reportedBy=Ajay AND a linked timesheet (issueId set, taskId null, hoursLogged 2, billable=f) charged to Ajay against a project he has no access to. (Test rows deleted after.)

9. 🟡 **No ownership/membership check on update or delete — any holder of issue.update/issue.delete can edit or delete anyone's issue in any project**  
   `rbac` · PATCH /issues/:id, DELETE /issues/:id (issues.service.ts update/softDelete) · _code-evident_ · found by: adversary  
   **Expected:** Edit/delete should be limited to the issue's reporter (and/or project members/managers), not any global permission holder.  
   **Actual:** Authorization is a single flat permission with no row-level ownership/membership guard.  
   **Repro:** update() and softDelete() only call this.get(id) (which just checks existence) then mutate — no comparison of getActorId() to reportedBy and no ProjectMember check. A user with the global issue.update/issue.delete permission can therefore alter or soft-delete any issue firm-wide. Delete also cascades deletedAt onto the linked non-billable timesheet, so a holder can erase another user's logged time. khushi lacks both perms so got a clean 403 (correct for her), but the missing owner scoping is code-evident.

10. 🟡 **IDOR write: user can raise an issue in a project they are not a member of, injecting a non-billable timesheet against themselves**  
   `data-integrity` · POST /issues (issues.service.ts create) · _reproduced_ · found by: adversary  
   **Expected:** issue.create should be scoped to projects the actor is a member of; raising an issue on a foreign project should be rejected.  
   **Actual:** create() does no membership check; it writes the issue + a non-billable timesheet (userId=actor) purely from the supplied projectId. Lets anyone pollute another team's issue list and inject phantom non-billable time into capacity/timesheet reporting.  
   **Repro:** As khushi (non-member of cmqze4kww00n8sjsus9jw131w): POST /issues {projectId: that project, title:'QATEST-khushi-idor', hours:3} -> 201, created issue cmrumth0v05mqcpko5vrpcsh3 with a billable:false timesheet of 3h logged against khushi on a project she is not on. (Cleaned up.)

11. 🟡 **Issue accepts an arbitrary future date, writing a future-dated non-billable timesheet**  
   `data-integrity` · POST /issues date handling — issues.service.ts:54,61-63 · _reproduced_ · found by: manager  
   **Expected:** date should be constrained to a sensible range (e.g., not in the future, within the project/attendance window) since it feeds non-billable time that drives capacity/utilisation reporting.  
   **Actual:** Any valid ISO date is accepted, including years in the future, silently polluting time/capacity data.  
   **Repro:** POST /issues {projectId:...,title:'QATEST-future',hours:3,date:'2099-12-31'} returned 201; DB confirmed the linked non-billable timesheet was created with date=2099-12-31. No upper bound (today) or project-window check is applied.

12. 🟡 **'HR Admin' (hr@) account is role-stacked with Manager + Senior Consultant, granting full delivery write on issues/projects/tasks — contradicts HR-has-no-delivery-surface design**  
   `ab-inconsistency` · RBAC seed / user_role for hr@squarkip.com · _reproduced_ · found by: hr  
   **Expected:** A people-ops HR account should not be able to create/edit delivery issues, projects or tasks; the pure role-hr boundary (verified clean) is the intended shape.  
   **Actual:** The shared hr@ account bypasses the boundary entirely via stacked delivery roles; anyone testing 'as HR' via hr@ silently gets delivery write. Only issue.delete is absent (delete -> clean 403).  
   **Repro:** hr@squarkip.com carries roles HR + Manager + Senior Consultant, yielding issue.create/update/view, project.create/update/approve/view, task.create/update/delete/assign/view. Reproduced: POST /issues (project hr@ is NOT a member of) -> HTTP 201 created issue id cmrumubxi05recpkooul2avku with a non-billable timesheet; PATCH on another user's issue -> HTTP 200. Pure HR (shaveta) is correctly blocked (403), so the boundary itself is sound — the hr@ demo account just over-grants.

13. 🟡 **PATCH accepts an empty title, though create rejects it (validation asymmetry)**  
   `validation` · UpdateIssueDto.title — dto.ts (no @MinLength) vs CreateIssueDto.title (@MinLength(1)) · _reproduced_ · found by: manager  
   **Expected:** Update should apply the same @MinLength(1) as create; a blank title should be a 400.  
   **Actual:** UpdateIssueDto.title lacks @MinLength, so an existing issue can be blanked out to an empty title.  
   **Repro:** PATCH /issues/<my issue> {title:''} returned 200 and persisted title:''. By contrast POST /issues {title:''} is correctly rejected with 400 'title must be longer than or equal to 1 characters'.

14. 🟡 **PATCH /issues/:id accepts empty title — issue title can be blanked (create forbids it)**  
   `data-integrity` · dto.ts UpdateIssueDto.title · _reproduced_ · found by: superadmin  
   **Expected:** Update should enforce the same @MinLength(1) as create; empty title should be rejected with 400.  
   **Actual:** Empty-string title is persisted, leaving an untitled issue (and its non-billable timesheet still references the original notes).  
   **Repro:** `curl -b cookie -X PATCH http://localhost:4000/api/v1/issues/<id> -d '{"title":""}'` returns 200 and the issue's title becomes "". CreateIssueDto.title has @MinLength(1) but UpdateIssueDto.title has only @MaxLength(200), no @MinLength.

15. 🟡 **GET issue endpoints enforce no permission — issue.view is never checked**  
   `rbac` · issues.controller.ts GET list/get · _code-evident_ · found by: adversary  
   **Expected:** Reading issues should require issue.view (the permission that exists and is granted to roles); a user lacking issue.view should get 403.  
   **Actual:** Both read routes are unguarded, so the issue.view permission is dead — any authenticated principal regardless of role can read all issues. Code-evident (could not negative-test from khushi's session since she holds issue.view).  
   **Repro:** issues.controller.ts: @Get() and @Get(':id') have no @RequirePermission decorator, unlike @Post/@Patch/@Delete which carry issue.create/update/delete. The 403 responses on write ops confirm the permission guard only fires when the decorator is present.

16. 🟡 **Issue (and its non-billable timesheet) can be dated arbitrarily in the future**  
   `validation` · issues.service.ts create() date handling / dto.ts date · _reproduced_ · found by: superadmin  
   **Expected:** Date should be bounded (no future-dated time entries); IsDateString only checks format, not sanity.  
   **Actual:** Non-billable time is logged 1.5 years in the future, which pollutes availability/capacity and time reporting.  
   **Repro:** `curl -b cookie -X POST /issues -d '{"projectId":"cmqze4kww00n8sjsus9jw131w","title":"QATEST-future","hours":3,"date":"2027-12-31"}'` returns 201; DB shows the linked timesheet dated 2027-12-31 with hoursLogged=3, billable=false.

17. 🟡 **No project-membership check on issue create/update/delete — holder can raise/edit issues in projects they don't belong to**  
   `logic` · issues.service.ts create()/update() (lines 51-86) · _reproduced_ · found by: hr  
   **Expected:** Raising or editing an issue should require membership on (or at least visibility of) the target project.  
   **Actual:** create() takes dto.projectId at face value with only an FK check; a permission-holder can attach time/issues to any project org-wide. Compounds the unguarded read leak above.  
   **Repro:** As hr@ (has issue.create but ZERO project memberships), POST /issues with projectId=cmqze4krw00exsjsu2jy9yrpy (Prior Art & Invalidation matter) -> HTTP 201, issue + non-billable timesheet created against a project the actor cannot otherwise access.

18. 🔵 **Future-dated non-billable time entries accepted (no upper bound on issue date)**  
   `validation` · POST /issues (dto.ts date, issues.service.ts create) · _reproduced_ · found by: adversary  
   **Expected:** Time-cost date should be bounded to a sane window (not in the future), since it feeds timesheet/capacity aggregations.  
   **Actual:** @IsDateString only checks format; any far-future (or arbitrarily old) date is accepted and logged, polluting future-period reporting.  
   **Repro:** As khushi: POST /issues {projectId: own project, title:'QATEST-future', hours:1, date:'2099-01-01'} -> 201; a billable:false timesheet is created dated 2099-01-01. (Cleaned up.)

19. 🔵 **Invalid projectId returns a raw DB constraint message**  
   `ux` · POST /issues — FK on issue.projectId · _reproduced_ · found by: manager  
   **Expected:** Validate project existence/visibility up front and return a clean domain error (e.g., 404/400 'Project not found').  
   **Actual:** The request reaches the DB and surfaces the ORM foreign-key error text to the client.  
   **Repro:** POST /issues {projectId:'nonexistent-proj-xyz',title:'QATEST-badproj',hours:1} returned 400 'Related record does not exist (foreign key constraint).' — the internal Prisma/DB constraint phrasing rather than a validated 'project not found' message.

20. 🔵 **UpdateIssueDto.title lacks MinLength — an update can blank an issue's title**  
   `validation` · dto.ts UpdateIssueDto · _code-evident_ · found by: adversary  
   **Expected:** Update should enforce the same MinLength(1) so a title cannot be emptied.  
   **Actual:** Empty string bypasses the create-time non-empty guard on the update path.  
   **Repro:** CreateIssueDto.title has @MinLength(1) @MaxLength(200); UpdateIssueDto.title has only @MaxLength(200). PATCH /issues/:id with {"title":""} would pass validation and update.title:'' persists an empty title. (Not runtime-reproducible from khushi — no issue.update perm.)

21. 🔵 **No project-membership gate on issue creation (superadmin and any issue.create holder can raise issues in projects they aren't a member of)**  
   `rbac` · issues.service.ts create() · _reproduced_ · found by: superadmin  
   **Expected:** Per the persona brief, deliberate project-membership gates should not be bypassed; a member check (or explicit superadmin-only override) is warranted so non-member creators cannot inject time into arbitrary projects.  
   **Actual:** Any user with issue.create can create issues + non-billable time in any project by id, with zero membership enforcement.  
   **Repro:** `curl -b cookie -X POST /issues -d '{"projectId":"cmqze4ktq00hpsjsublst646g","title":"QATEST-nonmember","hours":1}'` (FTO — mohit not a member) returns 201 and books a non-billable timesheet against that project. create() never checks membership.

22. 🔵 **Repurposed issue API leaks stale bug-tracker fields (severity/status/assigneeId/dueDate) with misleading defaults**  
   `data-integrity` · issues.service.ts shape()/include (spreads all issue columns) · _reproduced_ · found by: employee  
   **Expected:** After repurposing issues into time entries, the API surface should omit or not populate obsolete severity/status/assignee/dueDate fields so clients don't render meaningless bug-tracker semantics.  
   **Actual:** shape() spreads every issue column, so DB-default severity='MINOR'/status='OPEN' and unused assignee/dueDate fields are exposed on every issue, creating confusion about whether issues are still a bug tracker.  
   **Repro:** GET /issues and POST /issues responses include leftover columns from the old bug-tracker model: e.g. created issue returned 'severity':'MINOR','status':'OPEN','assigneeId':null,'dueDate':null even though the module is now 'technical issue = non-billable time entry'. Existing rows show 'severity':'CRITICAL' etc.

23. 🔵 **Any issue.update holder can edit issues raised by other users (no creator/ownership check)**  
   `rbac` · issues.service.ts update() lines 74-86 · _reproduced_ · found by: hr  
   **Expected:** Editing another person's issue should be restricted to the creator or a delivery lead/admin, not any issue.update holder.  
   **Actual:** update() calls get() then updates unconditionally with no reportedBy comparison; may be acceptable for managers but there is no ownership gate at all.  
   **Repro:** As hr@, PATCH /issues/cmqze4ktl00hksjsuead8ffhq (issue reported by Mohit Kalra) with {title:...} -> HTTP 200, title overwritten despite hr@ not being the reporter. (Restored to original during cleanup.)

24. ⚪ **Validation and non-billable timesheet linkage behave correctly (positive verification)**  
   `validation` · dto.ts + issues.service.ts create/softDelete · _reproduced_ · found by: hr  
   **Expected:** Clean 400s on bad input; issue creates exactly one non-billable time entry; delete cascades to the timesheet.  
   **Actual:** All confirmed working as designed.  
   **Repro:** hours=25 -> 400 'must not be greater than 24'; hours=-5 -> 400; empty title -> 400; 201-char title -> 400; bogus projectId -> clean 400 FK message (not 500). Create with hours=3 produced timesheet billable=f, taskId=null, issueId set, notes=title. Delete path soft-deletes issue + timesheet together (service lines 92-95).

25. ⚪ **Legacy bug-tracker fields (severity/status/assigneeId/dueDate) still returned by the repurposed issues API**  
   `domain` · issues.service.ts include / issue schema · _code-evident_ · found by: superadmin  
   **Expected:** Dead fields should be dropped from the API projection to avoid confusing consumers (they imply a triage/assignment workflow that no longer exists).  
   **Actual:** Stale schema fields leak through the response shape.  
   **Repro:** Every create/get response includes `"severity":"MINOR","status":"OPEN","assigneeId":null,"dueDate":null` — vestigial columns from the old bug-tracker model that the repurposed 'technical issue = non-billable time entry' feature never sets or exposes in the DTO.


### calendar  (19 unique — 🟡9 🔵8 ⚪2)

1. 🟡 **Event `type` field accepts arbitrary unvalidated strings (no enum guard)**  
   `validation` · POST /calendar-events — create · _reproduced_ · found by: hr  
   **Expected:** type restricted to a known enum (MEETING/MILESTONE/etc.); junk value → 400  
   **Actual:** Any string accepted and stored (201); calendar rendering/colour logic can receive unknown types  
   **Repro:** As hr@ POST /calendar-events with {"type":"WEDDING",...} → 201, event persisted with type="WEDDING". Contrast: `recurrence`:"HOURLY" → 400 enum error, `response`:"MAYBE_NOT" → 400 enum error. Only `type` is unguarded (another agent's leftover QATEST-typejunk confirms the same).

2. 🟡 **Event with endDate before startDate (negative duration) accepted**  
   `validation` · POST /calendar-events — create · _reproduced_ · found by: hr  
   **Expected:** 400 — endDate must be >= startDate  
   **Actual:** 201, event stored with end 2h before start; free-busy/duration math is corrupt  
   **Repro:** POST with startDate 2026-08-05T11:00Z, endDate 2026-08-05T09:00Z → 201 (id cmrumv3v3...). No cross-field date validation.

3. 🟡 **hr@ (people-ops) account is role-stacked with Manager + Senior Consultant, granting delivery-adjacent calendar.create/update it should not have**  
   `ab-inconsistency` · RBAC — account role assignment vs HR design · _code-evident_ · found by: hr  
   **Expected:** A people-ops HR account holds only the HR role (calendar.view) per the 'HR has no delivery surfaces' design; create/edit blocked  
   **Actual:** Account seeded with Manager+Senior Consultant, so it passes calendar.create/update — the RBAC engine is correct but the account provisioning violates the boundary. Positive side: pure HR role has NO project/task/issue permissions, so the role-level delivery boundary itself is clean.  
   **Repro:** DB: hr@squarkip.com carries roles Manager, Senior Consultant, HR. Pure HR role grants ONLY calendar.view (no create/update/delete). Because of the stack, hr@ successfully POSTs/PATCHes calendar events (201). A pure-HR account would correctly get 403 on create.

4. 🟡 **Event with endDate before startDate is accepted (negative-duration event)**  
   `validation` · apps/api/src/modules/events/dto.ts CreateEventDto/UpdateEventDto · _reproduced_ · found by: manager  
   **Expected:** 400 rejecting endDate < startDate.  
   **Actual:** Event created with a negative duration. For recurring events this also poisons every occurrence (duration = end-start is negative, so each generated occurrence gets endDate before its own startDate). Calendar UIs and the ICS DTEND become nonsensical.  
   **Repro:** POST /calendar-events {startDate:2026-07-25T12:00Z, endDate:2026-07-25T10:00Z} returns 200 and persists the event with end before start. No cross-field validation exists in the DTO.

5. 🟡 **joinUrl accepts arbitrary non-URL strings including javascript: scheme**  
   `validation` · apps/api/src/modules/events/dto.ts joinUrl (@IsString only, no @IsUrl) · _code-evident_ · found by: manager  
   **Expected:** joinUrl validated as an http(s) URL; dangerous schemes rejected.  
   **Actual:** joinUrl is stored as-is. If the calendar/meeting UI renders it as a clickable <a href>, this is a stored-XSS / malicious-link vector delivered to every attendee of the meeting. (Frontend rendering not verified from API layer, hence code-evident.)  
   **Repro:** POST /calendar-events {joinUrl:'javascript:alert(1)'} returns 200 and stores joinUrl verbatim. Any organizer (calendar.create) can set this on an org-wide-visible meeting.

6. 🟡 **Events accept endDate earlier than startDate (negative-duration events) on both create and update**  
   `validation` · apps/api/src/modules/events/events.service.ts create()/update() + dto CreateEventDto/UpdateEventDto · _reproduced_ · found by: superadmin  
   **Expected:** 400 rejecting endDate < startDate (an event cannot end before it begins).  
   **Actual:** Event created/updated with a negative duration. No DTO or service-level check that endDate >= startDate. Downstream impact: generateOccurrences computes durationMs<0 so recurring occurrences also invert; freeBusy synthesises busy end from the bad endDate; ICS export emits DTEND before DTSTART (RFC5545-invalid VEVENT that external calendar clients may reject or render wrong).  
   **Repro:** POST /calendar-events {title:'QATEST-negative-duration', startDate:'2026-08-01T10:00:00Z', endDate:'2026-08-01T09:00:00Z'} → HTTP 201, event persisted with endDate < startDate. Same on PATCH /calendar-events/:id {startDate:'...T10:00', endDate:'...T08:00'} → 200.

7. 🟡 **Recurring event silently capped at 60 occurrences regardless of recurrenceUntil**  
   `logic` · apps/api/src/modules/events/events.service.ts:103 generateOccurrences · _reproduced_ · found by: manager  
   **Expected:** Either honour recurrenceUntil up to a sane horizon, or reject/warn the organizer that only N occurrences will be created. A delivery lead scheduling a daily standup or weekly search-review 'until end of year' should not have half the series silently missing.  
   **Actual:** MAX=60 hard cap truncates the series with no error or indication; a DAILY series covers only ~2 months and a WEEKLY series ~14 months even though recurrenceUntil says otherwise. Recurring reviews/deadlines silently disappear past the cap.  
   **Repro:** POST /calendar-events with recurrence=DAILY and recurrenceUntil=2099-12-31. Then GET /calendar-events over a window covering that range. Only 61 rows returned for the series (master + 60 occurrences), i.e. the daily event stops ~60 days out. Same happens with no recurrenceUntil at all (defaults to start+3 months but still capped at 60).

8. 🟡 **List/get trust client-supplied organizationId while free-busy/export derive it from the session (A/B inconsistency + tenant-isolation risk)**  
   `ab-inconsistency` · events.controller.ts list() vs freeBusy()/exportIcs() · _code-evident_ · found by: adversary  
   **Expected:** All calendar reads should scope to the session org (actor.requireOrgId()) consistently; the client-supplied organizationId should be validated against the actor or ignored.  
   **Actual:** list() and get() honor an arbitrary client organizationId, so in a multi-org deployment an Employee could enumerate/read another tenant's calendar by supplying its id; behavior diverges from the session-scoped free-busy/export endpoints.  
   **Repro:** GET /calendar-events?organizationId=<any>&from=&to= passes the query param straight into list(organizationId) (controller:15-20, service:31-43) with no check that the actor belongs to that org. Sibling endpoints freeBusy and exportIcs instead use `await this.actor.requireOrgId()` (controller:30, 38). Passing organizationId=cmFAKEORG123 returns [] (200) rather than 403/ignoring the param.

9. 🟡 **GET /calendar-events/:id has no organization scoping — cross-tenant event read (IDOR)**  
   `rbac` · events.service.ts get() · _code-evident_ · found by: adversary  
   **Expected:** get() should scope to the actor's organization (where: { id, organizationId: <session org>, deletedAt:null }) so an id from another tenant returns 404.  
   **Actual:** Any authenticated calendar.view user can fetch ANY event by id across ANY organization — latent cross-tenant IDOR leaking client-matter titles, notes, and attendee PII. Not demonstrable cross-org in the current single-org dataset, but the missing org filter is code-evident.  
   **Repro:** As Employee Khushi (calendar.view only), GET http://localhost:4000/api/v1/calendar-events/cmqze4l0h00tusjsupc30uiz8 returns the full event (title, attendees w/ names+emails, notes) although she is neither organizer nor attendee. Service get() queries `findFirst({ where: { id, deletedAt: null } })` with NO organizationId filter (events.service.ts:45-53); controller passes only the raw :id (events.controller.ts:41-43).

10. 🔵 **Any org member can read full details (joinUrl, description, notes) of events they are not invited to via GET /calendar-events/:id**  
   `rbac` · GET /calendar-events/:id (events.service.ts findOne) · _reproduced_ · found by: employee  
   **Expected:** For a confidential client/SEP meeting an uninvited staff member arguably should not receive the meeting join link / private notes; either restrict single-event detail (joinUrl/notes/description) to organizer+attendees, or confirm shared-calendar visibility is intended.  
   **Actual:** GET /:id is gated only by calendar.view, so every org member can read every event's full detail including joinUrl and notes regardless of invitation. By-design per the shared-calendar model, but it leaks meeting join URLs and private notes to uninvited employees.  
   **Repro:** As Employee ajay.sharma (not organizer, not attendee), GET http://localhost:4000/api/v1/calendar-events/cmqze4l0h00tusjsupc30uiz8 ('Engagement Kickoff — SEP Matter') -> HTTP 200 with full payload; likewise GET /calendar-events/cmrumx5cy0665cpkoy1xyz21z returned the event's joinUrl ('javascript:alert(1)'). Confirmed via DB the caller has 0 attendee rows for these events.

11. 🔵 **Cross-org create leaks DB internals ('foreign key constraint') instead of clean 403**  
   `other` · POST /calendar-events — organizationId scoping · _reproduced_ · found by: hr  
   **Expected:** Clean 403/404 authorization error scoped to the caller's org; no DB-layer message  
   **Actual:** Request is blocked only incidentally by a Prisma FK error, and the response leaks 'foreign key constraint' internals  
   **Repro:** POST with organizationId of an org HR does not belong to → 400 {"message":"Related record does not exist (foreign key constraint)."}

12. 🔵 **Recurrence silently capped (~61 occurrences) — recurrenceUntil ignored/misleading for long series**  
   `data-integrity` · POST /calendar-events — recurrence generation · _reproduced_ · found by: hr  
   **Expected:** Either honor recurrenceUntil (materialize through 2029, or compute on the fly) or reject/warn that the series is truncated  
   **Actual:** Series silently stops ~61 days out while recurrenceUntil claims 2029 — calendar shows no events past the cap despite the stated end date  
   **Repro:** DAILY recurrence with recurrenceUntil 2029-08-05 generated only 61 materialized rows (~2 months). DAILY with NO recurrenceUntil also generated exactly 61. Verified via count of recurrenceParentId children.

13. 🔵 **RSVP/notes to a nonexistent event returns 403 'not invited' instead of 404**  
   `ux` · POST /calendar-events/:id/respond · _reproduced_ · found by: hr  
   **Expected:** 404 Not Found for a nonexistent id  
   **Actual:** 403 with an invitation-membership message; conflates missing-resource with authorization  
   **Repro:** POST /calendar-events/nonexistent123/respond → 403 {"message":"You are not invited to this meeting."}

14. 🔵 **Event 'type' is an unvalidated free-form string (accepts HTML/script)**  
   `validation` · apps/api/src/modules/events/dto.ts type (@IsOptional @IsString, no @IsIn) · _reproduced_ · found by: manager  
   **Expected:** type constrained to the known set (EVENT/MEETING/MILESTONE/etc.) via @IsIn.  
   **Actual:** Arbitrary strings are accepted for type, which drives colour/filtering/grouping in the calendar; junk or markup values break categorisation and are a stored-XSS candidate if type is rendered unescaped.  
   **Repro:** POST /calendar-events {type:'<script>zzz</script>'} returns 200 and persists type verbatim.

15. 🔵 **list / get / create trust the client-supplied organizationId with no session-org enforcement (latent cross-org scoping gap)**  
   `rbac` · apps/api/src/modules/events/events.controller.ts list(); events.service.ts get()/list()/create() · _code-evident_ · found by: superadmin  
   **Expected:** Endpoints should scope to the caller's session org (as free-busy/export.ics already do via actor.requireOrgId()) rather than trusting a client-provided organizationId.  
   **Actual:** organizationId is taken from the request (query/body) with no check that it matches the authenticated actor's org, and get(:id) applies no org filter at all. In a multi-tenant deployment any calendar.view holder could read/list/create against another org's id. Currently mitigated only by the single-org install.  
   **Repro:** GET /calendar-events?organizationId=<any-value> is queried verbatim (bogus id → []); GET /calendar-events/:id looks up by id + deletedAt only with no organizationId filter; POST body organizationId is written as-is. Only one org (Squark IP) exists so not exploitable today.

16. 🔵 **recurrenceUntil earlier than startDate is silently accepted**  
   `validation` · apps/api/src/modules/events/events.service.ts generateOccurrences · _reproduced_ · found by: manager  
   **Expected:** 400 rejecting recurrenceUntil < startDate (or at least normalising), so the organizer knows the series is empty.  
   **Actual:** Silently creates a recurring-flagged event with no occurrences; no feedback that the recurrence produced nothing.  
   **Repro:** POST /calendar-events {recurrence:WEEKLY, startDate:2026-07-25, recurrenceUntil:2026-07-01} returns 200; the while-loop (cur<=until) never runs so zero occurrences are generated, leaving a lone 'recurring' master.

17. 🔵 **free-busy leaks meeting titles (incl. confidential client-matter names) for arbitrary users**  
   `domain` · events.service.ts freeBusy() / controller freeBusy · _reproduced_ · found by: adversary  
   **Expected:** A free/busy abstraction should expose opaque busy intervals only (start/end/allDay), not titles — titles reveal confidential IP client matters and statutory deadlines.  
   **Actual:** free-busy returns full titles for any queried user. (Note: org-wide calendar.view already exposes these titles via the list endpoint, so this is not an incremental disclosure within one org, but it defeats the purpose of the free/busy view.)  
   **Repro:** As Employee, GET /calendar-events/free-busy?organizationId=...&userIds=cmqze4kpo00bcsjsu8hxgrqtx&from=..&to=.. returns busy blocks that include the event `title` for another user: ['Engagement Kickoff — SEP Matter','IPR Statutory Deadline','TM Filing Window Opens','Office Action Response Due']. userIds accepts any org member.

18. ⚪ **Reversed date window (from > to) returns 200 with empty array instead of a 400 validation error**  
   `validation` · GET /calendar-events?from=&to= · _reproduced_ · found by: employee  
   **Expected:** Either swap/normalise the range or reject with 400 for an inverted window, so a client bug doesn't silently show an empty calendar.  
   **Actual:** No validation of from<=to; silently returns [] which is indistinguishable from a genuinely empty calendar.  
   **Repro:** GET http://localhost:4000/api/v1/calendar-events?organizationId=cmqze4knz0000sjsu7ljwqivj&from=2026-12-31&to=2026-01-01 -> HTTP 200 body []

19. ⚪ **RSVP to a non-existent event returns 403 'not invited' instead of 404**  
   `logic` · events.service.ts respond() · _reproduced_ · found by: adversary  
   **Expected:** Consistent handling: a missing event should 404 on both respond and notes.  
   **Actual:** respond() checks invitation before existence, returning 403 for non-existent ids. Non-leaking and low-impact, but inconsistent with the notes path.  
   **Repro:** POST /calendar-events/nope123/respond {"response":"ACCEPTED"} -> 403 {"message":"You are not invited to this meeting."} for an id that does not exist. By contrast PUT .../notes on the same fake id returns a clean 404 'Event nope123 not found'.


---

## Home dashboard  ✅ complete (5/5 personas)

**24 unique findings** (from 24 raw) — 🟠 5 high · 🟡 9 medium · 🔵 9 low · ⚪ 1 info

1. 🟠 **analytics/projects is ungated: confidential client-matter descriptions leak firm-wide to any employee**  
   `rbac` · GET /analytics/projects (analytics.controller.ts:18-20) · _reproduced_ · found by: hr  
   **Expected:** For an IP firm, firm-wide project titles and descriptions of client matters (FTO, invalidation, prosecution) are confidential and should be gated (e.g. analytics.view.organization or project membership), not exposed to every authenticated user. The home 'my projects' widget is UI-gated by project.view but this org-wide feed is not server-gated.  
   **Actual:** Any authenticated user (incl. a permission-less analyst) retrieves the entire firm's project portfolio with sensitive matter descriptions by calling the endpoint directly.  
   **Repro:** Login as Employee ajay.sharma@squarkip.com (perms only project.view, project.create, analytics.view.own). GET /analytics/projects?organizationId=cmqze4knz0000sjsu7ljwqivj -> 200 with all 6 projects including full confidential descriptions, e.g. 'Invalidity search and claim charting against a portfolio of standard-essential patents (5G/Wi-Fi) for an IPR proceeding', plus priority, dueDate, billable, completionPercentage. Endpoint has NO @RequirePermission (analytics.controller.ts:18); comment at :9-14 marks dashboard/projects intentionally open under workstream B4.

2. 🟠 **analytics/projects is ungated: full client-matter project list leaks to any employee (member of zero projects)**  
   `rbac` · GET /analytics/projects (apps/api/src/modules/analytics/analytics.controller.ts:18-21) · _reproduced_ · found by: manager  
   **Expected:** An analyst staffed on none of these matters should not receive firm-wide client-matter descriptions; org-wide project analytics should require analytics.view.organization as the sibling /analytics/timesheets does.  
   **Actual:** Every authenticated user can read all projects incl. sensitive client-matter descriptions with no permission check. In an IP firm this is a confidentiality/conflict-wall concern.  
   **Repro:** Login as Employee ajay.sharma@squarkip.com (project_member count = 0). GET /analytics/projects?organizationId=cmqze4knz0000sjsu7ljwqivj returns all 6 org projects with full titles AND confidential descriptions (e.g. 'FTO study for a continuous glucose-monitoring wearable ahead of US/EU launch', 'Invalidity search and claim charting against a portfolio of standard-essential patents for an IPR proceeding'). Endpoint has no @RequirePermission; controller comment explicitly leaves it open for ALL users.

3. 🟠 **analytics endpoints ignore org scoping: omitting organizationId disables the org filter and returns ALL organizations' data**  
   `data-integrity` · apps/api/src/modules/analytics/analytics.service.ts:8-114 (getDashboard/getProjectStats) · _reproduced_ · found by: adversary  
   **Expected:** Analytics must scope to the authenticated caller's own organization (derive organizationId server-side from the session), never trust/require a client-supplied org id, and never fall through to an unfiltered query when it is absent.  
   **Actual:** organizationId is read straight from the query string with no validation and no binding to the caller; omitting it (undefined) silently disables the org filter and returns data across all organizations — a cross-tenant leak vector (currently masked only because the demo is single-org).  
   **Repro:** Logged in as khushi.gupta@squarkip.com (Senior Research Associate). GET /analytics/dashboard?organizationId=<own> -> {totalProjects:6,...}. GET /analytics/dashboard (NO organizationId) -> identical full payload {totalProjects:6,activeProjects:4,totalTasks:65,overdueCount:34}. GET /analytics/projects (no org) -> full 6-project list. Empty string org -> 0; garbage org -> 0. So the param is client-supplied and, when undefined, Prisma treats `members:{some:{user:{organizationId:undefined}}}` as no filter, returning every org's rows.

4. 🟠 **IDOR: /tasks?userId= and /tasks/:id return any colleague's tasks to a regular Employee**  
   `rbac` · tasks endpoint (backs 'my tasks' home widget) · _reproduced_ · found by: employee  
   **Expected:** The 'my tasks' widget endpoint should only return the authenticated actor's own tasks (or require task.view.organization to view others'). An Employee should not be able to enumerate a colleague's task list/details by changing the userId query param.  
   **Actual:** Any authenticated user can read any other user's assigned tasks (titles, descriptions, due dates, project, assignees) simply by passing an arbitrary userId, or any task by id. No permission decorator and no actor scoping.  
   **Repro:** Logged in as ajay.sharma@squarkip.com (Employee, Senior Associate Consultant). GET /api/v1/tasks?userId=cmqze4kqb00ccsjsu1y1vtezh (Divyanshu Saxena's id) -> 200 with 3 tasks: 'QA — search-string coverage audit', 'QA — claim/spec antecedent check', 'QA pass on claim mapping accuracy'. GET /api/v1/tasks/cmqze4kuk00jasjsuvqme7fgs -> 200 returning full task detail incl. assignee identity. Confirmed in code: apps/api/src/modules/tasks/tasks.controller.ts:15-24 @Get() list() has NO @RequirePermission and calls listForUser(userId) trusting the client-supplied userId with no check that userId===actor.id; :26-29 @Get(':id') also ungated.

5. 🟠 **GET /users is not permission-gated: full staff roster with phone numbers leaks to any authenticated user (no user.view)**  
   `rbac` · users / home people & admin widgets · _reproduced_ · found by: superadmin  
   **Expected:** The people/admin home widgets are UI-gated on user.view, so the backing list endpoint should also be server-gated (or at minimum redact PII like phone/email) — a permission-less analyst/intern should not be able to pull every colleague's phone number by calling the API directly.  
   **Actual:** users.module.ts UsersController.@Get() list() has NO @RequirePermission (code comment: 'Read endpoints stay open — the app resolves the current user from the user list'). It returns id, email, phone, designation, status for every ACTIVE user to anyone authenticated. UI hiding is not backed by server enforcement.  
   **Repro:** Login as Employee divyanshu.saxena@squarkip.com (role Employee — has no user.view/role.view). GET /api/v1/users?organizationId=cmqze4knz0000sjsu7ljwqivj returns HTTP 200 with the complete roster of all 28 staff including phone numbers, emails, and designations (e.g. 'Mohit Kalra … phone 8302971071'). The same session correctly gets 403 on /roles, /performance/org, /attendance/org/summary, /leave/requests/org, /capacity/team.

6. 🟡 **analytics/dashboard is ungated: firm-wide aggregate stats returned to any authenticated user**  
   `rbac` · GET /analytics/dashboard (analytics.controller.ts:13-16); home widget apps/web/components/home/sections.tsx:64 gated only by client-side can('project.view') · _reproduced_ · found by: manager  
   **Expected:** Firm-wide portfolio aggregates (total/overdue counts across all matters) should be gated to org-analytics viewers, not visible to every IP analyst.  
   **Actual:** No server-side gating; org-wide aggregates disclosed to any authenticated caller.  
   **Repro:** As Employee ajay.sharma: GET /analytics/dashboard?organizationId=cmqze4knz0000sjsu7ljwqivj returns {totalProjects:6, activeProjects:4, avgCompletion:51, totalTasks:65, overdueCount:34,...} with no permission check. UI hides the widget behind project.view but the endpoint itself is open.

7. 🟡 **analytics/projects exposes raw clientDueDate that the /projects module deliberately redacts (A/B redaction bypass)**  
   `ab-inconsistency` · GET /analytics/projects vs GET /projects · _reproduced_ · found by: hr  
   **Expected:** clientDueDate is server-side redacted for normal users (per capacity dual-deadline design). Both endpoints should apply the same redaction.  
   **Actual:** analytics/projects passes clientDueDate through unredacted while /projects strips it, defeating the redaction whenever the value is set.  
   **Repro:** As Employee: GET /analytics/projects returns each project object WITH a 'clientDueDate' field present. GET /projects (the real module) returns the same projects with clientDueDate entirely stripped (field MISSING). All projects currently have null clientDueDate in DB so no live value leaked, but the ungated analytics feed carries the field the dedicated module removes, so any populated client deadline would leak via home's analytics feed.

8. 🟡 **User directory (all employees' mobile numbers + role assignments) is fully open regardless of user.view**  
   `rbac` · GET /users and GET /users/:id (users.module.ts:328-339) · _reproduced_ · found by: hr  
   **Expected:** Home people/admin widget is UI-gated by user.view/role.view; the backing directory endpoint should at minimum not expose personal mobile numbers and every user's role map to permission-less staff. Phone is PII.  
   **Actual:** Any authenticated user enumerates the full staff directory with mobile numbers and each person's role assignments.  
   **Repro:** Employee ajay.sharma (no user.view, no role.view) -> GET /users?organizationId=<org> returns 200 with all 28 employees incl. personal mobile phone (e.g. '9460639443'), email, designation, employeeCode. GET /users/:id returns 200 with target's userRoles (full role assignments). Controller comment (users.module.ts:327) states read endpoints are intentionally open ('the app resolves the current user from the user list'). Inventory expected user.view gating; it is not enforced. (Deep profile PII address/DOB/next-of-kin is correctly NOT returned - profile is null.)

9. 🟡 **'My Projects' home widget shows ALL org projects, not the user's; backing GET /projects is not membership-scoped**  
   `data-integrity` · MyProjectsCard sections.tsx:201-214 -> api.projects.list(org.id) -> GET /projects · _reproduced_ · found by: manager  
   **Expected:** A card labelled 'My Projects' should list only projects the user belongs to (or the label should be 'Projects').  
   **Actual:** Card shows every firm project regardless of assignment; mislabelled and surfaces non-member client matters on the home screen.  
   **Repro:** Employee ajay.sharma is a member of 0 projects. GET /projects?organizationId=<org> returns all 6 org projects; the home card titled 'My Projects' renders the top 5 of them.

10. 🟡 **Org-wide firm aggregates leak to a permission-less Employee via ungated /analytics/dashboard and /analytics/projects**  
   `rbac` · analytics dashboard/projects (home org-summary widgets) · _reproduced_ · found by: employee  
   **Expected:** Firm-wide project counts, task totals, overdue counts, average completion and the full project roster are business intelligence an individual IP analyst on zero projects should not see on their home dashboard; the endpoint should be gated (e.g. analytics.view.organization) or scoped to the actor's own projects.  
   **Actual:** The org-wide aggregate and full project list are returned to any authenticated user regardless of permission or project membership. The UI hides the widget for employees but the backing endpoints are not server-gated, so the data leaks on direct call.  
   **Repro:** As Ajay (verified member of 0 projects via DB: project_member join = 0). GET /api/v1/analytics/dashboard?organizationId=cmqze4knz0000sjsu7ljwqivj -> {totalProjects:6, activeProjects:4, avgCompletion:51, totalTasks:65, overdueCount:34, tasksDueToday:0}. GET /api/v1/analytics/projects?organizationId=... -> 200 full list of all 6 firm projects with titles/descriptions (e.g. 'Prior Art & Invalidation — Wireless SEP Portfolio', 'FTO Analysis — MedTech Wearable'). Code: apps/api/src/modules/analytics/analytics.controller.ts:13-21 both handlers deliberately have NO @RequirePermission (comment cites workstream B4).

11. 🟡 **Client-supplied organizationId trusted with no actor-org check; omitting it drops the Prisma filter entirely**  
   `data-integrity` · analytics.dashboard/projects, /users, /projects org scoping · _code-evident_ · found by: employee  
   **Expected:** Org-scoped endpoints should derive the organization from the authenticated actor (or verify the actor belongs to the requested org), and must not silently return all-org data when the param is absent.  
   **Actual:** Scope is entirely driven by an untrusted query param; omitting it removes tenant isolation. Impact is limited today because the DB holds a single org (Squark IP), but this is a latent cross-tenant leak if a second org is ever added.  
   **Repro:** GET /analytics/dashboard with NO organizationId param -> still returns full aggregates (6 projects) because analytics.service.ts uses where members.some.user.organizationId = <undefined>, and Prisma drops an undefined filter, returning all rows across all orgs. Same pattern for GET /users (no org -> all 28 users) and GET /analytics/projects. The actor's own organizationId from the verified session is never used to constrain the query; a foreign/garbage org id is simply passed through (GARBAGE -> 0 rows).

12. 🟡 **Ungated analytics endpoints leak org-wide project confidentials (titles, client descriptions, hours, overdue counts) to a permission-less Employee**  
   `rbac` · analytics/dashboard, analytics/projects (home KPI + project widgets) · _reproduced_ · found by: superadmin  
   **Expected:** For an IP firm, firm-wide project inventory, client matter descriptions, and delivery aggregates are confidential; a junior/intern viewing their own home should not be able to pull them. These endpoints should be gated like their sibling analytics/timesheets (which correctly 403s).  
   **Actual:** analytics.controller.ts leaves dashboard and projects intentionally ungated (comment 'for ALL users', no @RequirePermission). Documented as intentional, but it exposes org-wide aggregates and every project's title+description to any authenticated user regardless of role.  
   **Repro:** As Employee (no analytics.view.organization): GET /api/v1/analytics/dashboard?organizationId=<org> returns {totalProjects:6, activeProjects:4, avgCompletion:51, totalTasks:65, overdueCount:34, ...}. GET /api/v1/analytics/projects?organizationId=<org> returns HTTP 200 with the full project list including titles and descriptions naming client matters (e.g. 'Prior Art & Invalidation — Wireless SEP Portfolio', 'FTO Analysis — MedTech Wearable', full descriptions).

13. 🟡 **Firm-wide KPI aggregates leak to a permission-less employee via ungated /analytics/dashboard while every other org-wide widget correctly 403s**  
   `rbac` · apps/api/src/modules/analytics/analytics.controller.ts:13-16 · _reproduced_ · found by: adversary  
   **Expected:** Org-wide operational aggregates (total tasks, overdue counts, firm hours) should be gated behind analytics.view.organization for consistency with the other org widgets; an individual IP analyst has no domain need for firm-wide overdue/hours rollups on their home.  
   **Actual:** Inconsistent gating: the analytics summary is deliberately left open, so the one org-wide surface that is NOT locked is the aggregate KPI feed. Data exposure is limited to counts, but it contradicts the role-adaptive model applied everywhere else.  
   **Repro:** Same Employee session returns 403 on all org-wide endpoints: attendance/org/summary, leave/requests/org, performance/org, capacity/team, roles. But GET /analytics/dashboard returns firm-wide totals: totalProjects:6, totalTasks:65, overdueCount:34, hoursLoggedThisWeek, avgCompletion:51 — no permission required (intentionally, per controller comment lines 9-14 / workstream B4).

14. 🟡 **GET /analytics/projects returns full project list (titles, descriptions, priority, dates) with NO permission check, unlike project.view-gated GET /projects**  
   `rbac` · apps/api/src/modules/analytics/analytics.controller.ts:18-21 (projects) vs projects controller (project.view) · _code-evident_ · found by: adversary  
   **Expected:** Org-wide project detail should require the same permission (project.view or analytics.view.organization) regardless of which route exposes it; the analytics route must not be a permission bypass.  
   **Actual:** UI-only/route-inconsistent gating: /analytics/projects has no server permission check while /projects does. The home dashboard's role-adaptive hiding does not protect this endpoint when called directly.  
   **Repro:** GET /analytics/projects?organizationId=<org> returns 6 full project objects including description, projectPhase, priority, startDate/dueDate, member counts — with no @RequirePermission on the handler (controller.ts:18 has none). The dedicated GET /projects requires project.view. Any authenticated user, including one whose role lacks project.view, can read every project's sensitive detail via the analytics route.

15. 🔵 **Employee directory exposes phone numbers and joining dates of all staff to any Employee**  
   `domain` · /users (people/admin widget data) · _reproduced_ · found by: employee  
   **Expected:** Phone number and joining date of every employee are semi-personal; exposing them to all staff may be broader than intended for a firm directory (email/name/designation is the usual minimum).  
   **Actual:** Any authenticated employee can pull the full roster incl. phone + joiningDate. Core PII redaction works, so this is minor, but the field set is wider than a self-only home widget needs.  
   **Repro:** GET /api/v1/users?organizationId=... as Ajay -> 200, 28 users, each with keys incl. email, phone, joiningDate, designation, employeeCode. Sensitive PII (address/DOB/next-of-kin) is correctly absent/redacted.

16. 🔵 **analytics/dashboard leaks org-wide aggregates to permission-less employees**  
   `rbac` · GET /analytics/dashboard (analytics.controller.ts:12-16) · _reproduced_ · found by: hr  
   **Expected:** An individual IP analyst's home need not surface firm-wide project/task/overdue counts; org-scoped aggregates are management data. Acknowledged as an open product decision (B4) but still a real exposure.  
   **Actual:** Firm-wide operational counts are readable by any authenticated user.  
   **Repro:** Employee ajay.sharma -> GET /analytics/dashboard?organizationId=<org> -> 200 {totalProjects:6, activeProjects:4, avgCompletion:51, totalTasks:65, overdueCount:34,...}. No @RequirePermission (intentional per B4 comment). Same numbers returned with organizationId omitted entirely.

17. 🔵 **Ungated analytics endpoints accept a client-supplied organizationId with no membership check**  
   `rbac` · GET /analytics/dashboard, GET /analytics/projects · _code-evident_ · found by: hr  
   **Expected:** Org-scoped reads should derive/verify organizationId from the authenticated actor, not trust the query param.  
   **Actual:** Endpoints trust the caller-supplied organizationId; only mitigated today by there being one org.  
   **Repro:** organizationId is taken straight from the query and passed to the service with no verification that the caller belongs to that org (analytics.controller.ts:13-20). Cannot be demonstrated as a live cross-tenant leak because the deployment has a single organization (garbage org id returns zeroed/empty results). In a multi-org deployment these open endpoints would return another tenant's aggregates/project list.

18. 🔵 **analytics/timesheets silently returns empty for a reversed date range instead of validating**  
   `validation` · GET /analytics/timesheets (analytics.controller.ts:23-31) · _reproduced_ · found by: manager  
   **Expected:** A from>to range should 400 or be normalised, not return an all-zero report that reads as 'no hours logged'.  
   **Actual:** Reversed range returns empty 200, which an approver could misread as zero team activity.  
   **Repro:** As Manager: GET /analytics/timesheets?organizationId=<org>&from=2026-07-21&to=2026-06-01 (to before from) returns {totalHours:0,byUser:[],entries:[]} with 200. Garbage dates (from=notadate) correctly return 400; reversed valid dates are accepted and yield a misleading empty result.

19. 🔵 **Analytics and users endpoints accept a client-supplied organizationId with no scoping to the actor's org (latent cross-tenant read)**  
   `data-integrity` · analytics.service getDashboard / users.service list · _code-evident_ · found by: superadmin  
   **Expected:** organizationId should be derived from/validated against the authenticated actor's org, not trusted from the client; an absent org id should not silently widen the query to every tenant.  
   **Actual:** No server-side check that the requested organizationId equals the actor's org, and undefined org id disables the tenant filter. Harmless in today's single-org deployment but a real cross-tenant leak the moment a second org exists.  
   **Repro:** GET /api/v1/analytics/dashboard (no organizationId param) returns the full org's aggregates instead of an error/empty; GET /api/v1/users (no organizationId) returns 9230 bytes of user data. The organizationId is taken straight from the query string and, when omitted, the Prisma where-filter (organizationId: undefined / user:{organizationId}) is dropped, so the query spans all organizations.

20. 🔵 **analytics endpoints trust client-supplied organizationId with no actor-to-org validation**  
   `rbac` · analytics.service.ts:8-18 (getDashboard/getProjectStats use the query organizationId verbatim in the Prisma where) · _code-evident_ · found by: manager  
   **Expected:** Endpoint should derive/validate organizationId from the authenticated actor, not accept an arbitrary client value.  
   **Actual:** Client-supplied org id used unscoped. Impact limited because deployment is single-org, but the path would serve another tenant's aggregates if a second org existed.  
   **Repro:** GET /analytics/dashboard?organizationId=FOREIGN-garbage-123 returns zeros (query executed against the supplied id); omitting organizationId (Prisma undefined filter) returns the full org data. The actor's own org is never enforced.

21. 🔵 **attendance/me/month returns 500 Internal Server Error on out-of-range year (unvalidated date params)**  
   `validation` · attendance controller/service — GET /attendance/me/month · _reproduced_ · found by: adversary  
   **Expected:** Reject invalid year/month with a 400 and a clear message; never surface a 500 from user-supplied query params. The 400 message 'year and month are required' is also misleading for out-of-range values (they are present, just invalid).  
   **Actual:** Out-of-range year values are not validated, producing an unhandled 500; the shared error message conflates 'missing' with 'invalid'.  
   **Repro:** GET /attendance/me/month?year=-1&month=7 -> 500 {"message":"Internal server error."}; year=99999&month=7 -> 500. By contrast month=13/0/abc -> 400 (handled), and missing params -> 400 'year and month are required'. So month is bounds-checked but year is not, and an invalid Date range reaches Prisma and throws unhandled.

22. 🔵 **Home 'Project Requests' approval widget is permanently dead after the approval gate was removed**  
   `ux` · home ProjectApprovalsCard / projects/pending-approvals · _reproduced_ · found by: superadmin  
   **Expected:** A widget that can never receive data should be removed, or the underlying flow restored; leaving a permanently-empty approvals card with dead approve/reject actions is misleading.  
   **Actual:** Dead widget: endpoint always [], approve()/reject() mutations are wired but unreachable.  
   **Repro:** GET /api/v1/projects/pending-approvals returns [] for every role (Employee, Super Admin). DB shows no project is ever in a pending-approval phase (phases present: ACTIVE, ON_HOLD, CLOSED only). The project approval gate was removed (PR #21) so nothing can ever land here, yet sections.tsx still renders the ProjectApprovalsCard (with approve/reject buttons) for project.approve holders — it just always shows 'No project requests awaiting your approval.'

23. 🔵 **'My projects' home widget endpoint (/projects) returns all org projects regardless of membership**  
   `rbac` · projects list (home 'my projects' widget) · _reproduced_ · found by: employee  
   **Expected:** A widget labelled 'my projects' should return only projects the user is a member of, or the endpoint should enforce project.view and scope accordingly.  
   **Actual:** The endpoint returns the entire org project list to a user who is on none of them; 'my projects' semantics are not enforced server-side.  
   **Repro:** Ajay is a member of 0 projects (DB project_member join = 0), yet GET /api/v1/projects returns all 6 org projects including 'Test 1' (CLOSED). apps/api/src/modules/projects/projects.controller.ts:19-21 @Get() list() has no @RequirePermission and no per-user scoping.

24. ⚪ **Positive: org/approval home endpoints are correctly server-gated for Employee**  
   `rbac` · attendance/org, leave/org, performance/org, capacity, roles, analytics/timesheets · _reproduced_ · found by: employee  
   **Expected:** These hidden widgets' endpoints should reject a permission-less employee server-side.  
   **Actual:** They do (403), confirming the RBAC guard works for the org/approval widgets; the gaps are the ungated tasks/analytics/projects/users endpoints noted above.  
   **Repro:** As Ajay all of these return 403 with 'Missing permission': /analytics/timesheets (analytics.view.organization), /attendance/org/summary (attendance.view.organization), /leave/requests/org (leave.view.organization), /performance/org (analytics.view.organization), /capacity/team (capacity.view), /roles (role.view). /projects/pending-approvals returns [] (approval gate removed per PR#21). Self widgets (/attendance/me/today, /leave/balance/me, /performance/me, /tasks self) return correct self-scoped data.


