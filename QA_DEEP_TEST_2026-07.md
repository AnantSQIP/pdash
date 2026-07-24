# pdash — Deep QA test sweep (2026-07)

Multi-agent QA to find every bug / missing feature / production-breaker / AWS-deploy risk before
the AWS rollout. Agents act as real Indian users of specific roles (personas), tracing the actual
code paths each persona exercises across the modules — this is **code-level flow tracing** (the
reliable method here: the local instance is wiped/old-build and Contabo is live team data, so we
don't click a live UI). A live Playwright pass can follow if a dedicated seeded test instance is
stood up.

**Priority order (per request):** Projects → Patents → Performance FIRST, then the whole system,
then cross-cutting (event/audit logs, security, prod/AWS readiness).

## EXECUTIVE SUMMARY & FIX PLAN (Phase 4 synthesis)

8 persona agents traced the system. **The app is competently built** — profile gate, PII boundary, segregation-of-duties, RBAC anti-escalation, org-session-scoping (newer modules), project redaction, argon2 + refresh-rotation, no SQLi, no XSS, and empty-DB-safe math are all **verified solid**. But there is a **patent-confidentiality collapse** (3 chained CRITs) and the stack is **NOT AWS-ready** without changes.

### The headline: patent confidentiality is defeated today (3 chained CRITs)
The portal carefully gates real patent numbers behind `patent.manage` + a passcode — but three plumbing leaks route around it, and any ordinary project-creating employee can chain them:
1. `GET /patents/options` (only needs `patent.view`) returns `documentName` (= the real number, since PDFs must be named by it) and `documentId` → **handle↔real-number correlation, no passcode**.
2. `GET /documents/:id/content` has **no permission + no passcode** guard → feed it that `documentId` and **download the confidential PDF**.
3. Those same real numbers are written to Activity/AuditLog as filenames and read back via the **unguarded `/activity?entityType=DOCUMENT`** IDOR.

### Fix plan (priority order)
**P0 — fix before ANY deploy (confidentiality + integrity; all small, targeted fixes):**
1. Guard `GET /documents/:id/content` by ownership/linked-resource authz; route patent docs only through the passcode'd endpoint.
2. Remove `documentName` + `documentId` from `PATENT_OVERVIEW_SELECT` (keep them only in the passcode-gated FULL select).
3. Stop logging patent-derived filenames; add `DOCUMENT` to `SENSITIVE`; require project/audit scope on `/activity` (+ take org from session).
4. Block task + timesheet creation on COMPLETED/CLOSED projects (server-side, not just UI).
5. Close the 24h/day-cap bypasses: route issue-time through `assertDayCap` + future-date check; aggregate the cap by calendar day (not exact instant); dedup inside `assign()`.

**P1 — before AWS deploy (platform blockers — the auditor's verdict is NOT READY):**
6. Move document storage off the ephemeral container FS → **S3** (or EFS).
7. Use **RDS/Aurora** (backups/HA/PITR), not a Postgres container.
8. Take `prisma migrate deploy` **out of the app boot CMD** → a one-off migration job.
9. Make background sweeps single-runner (leader lock / EventBridge) — or pin `desiredCount=1`.
10. Shared store (Redis) for throttle + passcode lockout; `/health` returns **503** on DB-down; rebuild the web image with the correct `API_ORIGIN`.
11. Add audit events for **patent reveal, passcode change, login/failed-login, and approvals** (today none are logged — you can't answer "who revealed the patents / changed the passcode").

**P2 — correctness & hardening:**
Projects: PID reassign/cancel (stranded null-PID), search membership-scope, pagination on `list`/`tasks`, single-MANAGER invariant, lifecycle `PATCH projectPhase` guard, rate-limit PID requests. Performance: key "completed"/on-time off the completion event not `updatedAt`, one "completed" definition, buffer-hours handling, `@@index([organizationId, createdAt])`, move the heatmap event-load inside the snapshot fallback, enforce `performance.view.organization` (HR's is dead). Attendance: never-punch-out integrity + late-marking for 9–6 + UTC→IST rollover. Cross-cutting: org-from-session in older modules (users/channels/departments/rbac/holiday/audit), structure or redact the free-text project title, tamper-evident audit trail, buffer-timesheet billable/expiry. **Feature gap:** no mandatory 2nd-reviewer QA gate for claim-chart deliverables (the real Squark workflow requires it).

**Counts:** 3 CRIT · ~12 HIGH · ~18 MED · many LOW/NOTE. Full per-batch detail in the FINDINGS section below.

---

## Personas (mapped to the real roster)
| # | Persona | Role / perms | Focus |
|---|---|---|---|
| P1 | Mohit Kalra (VP) | **Super Admin** | Patents portal, RBAC, everything |
| P2 | Nitin Goel | **Manager** | Projects, PID generate, capacity, team |
| P3 | Neha Shukla | **Senior Consultant** | Projects/PID, delivery oversight |
| P4 | Ketan Dagar / Amritpal Kaur | **Senior Research Associate** | PID generate, task delegation, research |
| P5 | Meetu Singh / Vijay Mishra | **Consultant** | Projects (request PID), tasks, time |
| P6 | Anant Gupta | **Employee (intern)** | Request PID, log time, limited access |
| P7 | Shaveta Sharma | **HR** | People-ops, attendance, leave, appraisals (NO projects) |
| P8 | (any) Research Associate | **Employee** | Day-to-day analyst work |

## Batches / phases
Legend: ☐ pending · ▶ running · ✔ done

- **Phase 0 — Foundations**
  - ✔ Squark IP domain research → `docs/squark-ip-domain-brief.md` (6 domains, competitors, per-persona scenarios)
  - ✔ Working hours → 9am–6pm IST (8h/day): `DAILY_CAPACITY_HOURS`, perf `DAILY_HOURS` (commit 5aea39f)
- **Phase 1 — Core modules (priority)**
  - ✔ Batch 1 — Projects (2 agents: authority + requester/authz) — findings below
  - ✔ Batch 2 — Patents / passcode / RBAC / doc-storage (Super Admin persona) — findings below
  - ✔ Batch 3 — Performance / Analytics / Reports (Sr Consultant persona) — findings below
- **Phase 2 — Full system**
  - ☐ Batch 4 — Attendance + Leave + Comp-off + WFH + Timesheets(new PID/buffer) + Capacity(offices/pending leaves)
  - ◐ Batch 5 — HR people-ops (PII/appraisals/comms/approvals) ✔ [Discuss/Calendar/Channels not yet covered]
  - ☐ Batch 6 — Users/RBAC + Profile-gate + Home/Dashboard + Expenses + Rewards
- **Phase 3 — Cross-cutting**
  - ✔ Batch 7 — Event + Audit logs coverage + security sweep — findings below
  - ✔ Batch 8 — Production + AWS-deploy readiness — findings below (verdict: NOT READY, blockers listed)
- ✔ **Phase 4 — Synthesis** — consolidated at top (EXECUTIVE SUMMARY & FIX PLAN)

## Progress log
_(append one line per batch as it completes, so this survives a session drop)_
- 2026-07-24: plan created; Phase 0 research launched; working hours changed.
- 2026-07-24: Batch 1 (Projects) ✔ — 4 HIGH, 6 MED. 8-agent fleet launched for the rest.
- 2026-07-24: **ALL 8 agents complete** — Projects×2, Patents, Performance, Tasks/Timesheets/Capacity, Attendance/Leave/Home, HR, Audit/Security/AWS. Phase-4 synthesis done (3 CRIT patent-confidentiality chain, AWS NOT-READY with blocker list). Working-hours stale UI copy fixed (perf page 48h→40h). Sweep COMPLETE; fix plan at top of doc.

---

# FINDINGS
Severity: **CRIT** (data loss/security/prod-down) · **HIGH** · **MED** · **LOW** · **NOTE** (missing feature / UX).
Each finding: `[SEV] module — summary (file:line) → why it breaks / scenario`.

## Batch 1 — Projects (authority + requester personas)

**HIGH**
- Stranded null-PID project — a PidRequest has **no cancel / reassign / admin-override** and `PidRequest.projectId` is `@unique`, so if the nominated authority is off-boarded or ignores it, the project sits with `code=null` forever (projects.service.ts:317-323).
- `list()` is **unbounded** (no `take`/pagination) + `projectPhase` is **unindexed** though filtered; an oversight actor loads every org project (+ per-row `_count` + members) every 30s (projects.service.ts:412-442; schema:509). `tasks.list` likewise unbounded.
- **Closed/completed projects are "locked" in the UI only** — server `TasksService.create` + `TimesheetsService.create` do NOT check `projectPhase`, so tasks + **billable time can be booked to a CLOSED client matter** (tasks.service.ts:81, timesheets.service.ts create).
- Global **search leaks projects the actor isn't a member of** — `/search` scopes projects to org, not membership, returning `{title, code, phase}` for matters you're not staffed on; client/patent often sit in the free-text title (search.module.ts:48-51).

**MED**
- Every **"Generate PID" click burns a serial** (auto-committed allocate) across 3 buttons + Regenerate → gap-ridden, non-`_001`-starting client PIDs; `peek()/nextPid()` exists but the buttons don't use it (projects.service.ts:277; sequence.service.ts:21).
- `/patents/options` (the picker) returns `clientId` (+ `documentName`) to **every `patent.view` holder**, leaking the confidential **client↔patent association** the module claims is Super-Admin-only (patents.service.ts:13,120; PATENT_OVERVIEW_SELECT).
- **No rate limit on PID-pending creation** — `ThrottlerGuard` isn't a global `APP_GUARD`, so a requester can spam unlimited pending projects + notifications at any authority (app.module.ts; projects.service.ts:210).
- `pidRequestsFor` **shows requests for soft-deleted projects** → fulfilling sets a code on a dead project + sends a 404 notification link (projects.service.ts:294-314).
- **No single-MANAGER invariant** — `addMember(x,'MANAGER')` yields two managers (both see the client deadline); demoting all leaves none (projects.service.ts:760-800; deadline-visibility.service.ts:41).
- `update()` **bypasses the lifecycle state machine** — `PATCH /projects/:id {projectPhase}` writes any phase (PLANNING→CLOSED, ARCHIVED/CANCELLED with `deletedAt` null) (projects.service.ts:551; dto.ts:19).

**NOTE (missing feature / design)**
- **No mandatory 2nd-reviewer QA gate** for deliverables — claim-chart QC is just an ordinary task title with no sign-off / segregation-of-duties; the same analyst can tick their own QC (project-templates.ts:38-58). The real Squark workflow requires a second reviewer.
- **Dead approval flow** — `create()` raises a PidRequest, not an Approval, so `pendingApprovals`/`approve`/`reject`/`decide` are unreachable and any Home "pending approvals" widget is permanently empty (projects.service.ts:451-673). Dead `managerId`/`clientId` DTO fields too.
- **Free-text project title** flows verbatim into search results, notifications, and audit metadata — undermines every client/patent confidentiality control (dto.ts:22; root cause of the search leak).
- `projectType` is **optional at the API** (required only in UI) → a direct POST creates a typeless, template-less project (dto.ts:29). `description` has no `@MaxLength`.
- `deadline.view.client` + oversight are **org-wide** — a Manager sees client deadlines + full details of matters they're not staffed on (documented design; broad for a conflict-wall IP firm) (deadline-visibility.service.ts:36).

**LOW**
- Requester silently makes the nominated authority a MANAGER without consent (projects.service.ts:107).
- `removeMember` clears TaskAssignee but not subtask assignees (latent 400 once subtask-assignee edit exists) (projects.service.ts:793).
- `claimPid` clash-check + create aren't atomic → rare generic-409 instead of "PID already in use" (relies correctly on the DB constraint).
- `clientDueDate` validated vs `dueDate` but not `startDate`.
- Shared-task M2M access spans projects the actor isn't on; object-access treats MEMBER==MANAGER (latent — only the global perm differentiates today).

**✅ Verified GOOD:** non-authority can't sneak a `pid` in the body (ignored); PID assignee is validated active+same-org+actually-an-authority (no self-pick); org is always session-derived (no cross-tenant enum); project `get()` redaction correct (no client name / real number / clientId to non-privileged); the `INSERT…ON CONFLICT…RETURNING` serial allocator + `updateMany`-guarded fulfil race are well done.

## Batch 2 — Patents / passcode / RBAC / document storage (Super Admin persona)

**CRIT**
- `/patents/options` (gated only by `patent.view` = every delivery role) returns **`documentName`** — and patent PDFs are *required* to be named by their number — so any Research Associate reads `documentName:"US8300001.pdf"` next to `handle:"Pat_MLE_001"`: the **handle→real-number correlation with NO passcode** (patents.service.ts:13,120; PATENT_OVERVIEW_SELECT).
- The generic **`GET /documents/:id/content` has NO permission and NO passcode guard** (only channel-attached docs are gated); a `patent.view` user takes the `documentId` from `/patents/options` and **downloads the confidential patent PDF**, fully bypassing the passcode-gated `/patents/:id/document/content` (documents.controller.ts:33; documents.service.ts:166-191).

**HIGH**
- On-disk document storage has **no read-time fallback** and lives on a local docker volume → on AWS ECS/Fargate (ephemeral FS, multi-replica) a redeploy wipes `/app/.data` → every patent-doc read throws ENOENT (unhandled 500) and the **crown-jewel PDFs are permanently lost**; needs EFS or S3 (documents.service.ts:189; docker-compose.prod.yml:39).

**MED**
- Passcode brute-force lockout is **in-memory per-instance** (`Map`) → defeated by horizontal scale (5×N guesses) and cleared on every restart; needs Redis/DB (passcode.service.ts:27).
- Web **caches the passcode 15 min and auto-replays** it silently → an XSS'd/hijacked tab can `reveal()`/`downloadDocument()` within the window with no prompt (lib/api.ts:43-82).
- A plain **Admin (not Super Admin) can reset the org passcode** with just their own password → can lock out a Super Admin / weaken the step-up (auth.controller.ts:143).
- Orphaned confidential bytes on replace — old patent doc soft-deleted but file never `unlink`ed / blob never deleted (patents.service.ts:183,228).

**LOW** — no pagination on patents lists; N+1 in `registerPatents`/`updateClient` re-mint; `updatePatent` accepts unvalidated `realNumber` (no dedup).

**✅ Verified GOOD:** org always session-derived; reveal uses FULL_SELECT only behind `patent.manage`+passcode; `patent.manage` is Super-Admin-only + RBAC anti-escalation holds; project get/list/search embed handles only; inline-XSS mitigated (no HTML/SVG inline, nosniff); no path traversal (UUID storagePath); passcode not logged (caveat: ensure AWS ALB access logs don't capture the `x-org-passcode` header).

## Batch 3 — Tasks / Timesheets (PID+buffer) / Issues / Capacity (SRA persona)

**HIGH**
- **Issue path bypasses the 24h/day cap AND the future-date guard** — `POST /issues` with `hours` writes a timesheet directly with no `assertDayCap` and no future check → log 24h task time + 24h "issue" = **48h/day**, and issue `date` can be in the future (issues.service.ts:63-79).
- **24h/day cap defeated by a time component in `date`** — `assertDayCap` filters on the exact stored `DateTime`; two entries dated `…T09:00` and `…T14:00` (24h each) both pass since the cap query matches only the exact instant (timesheets.service.ts:70-79; needs direct API — the stock modal sends date-only).

**MED**
- **Duplicate-entry guard circumvented by buffer→assign** — the buffer path has no dedup and `assign()` has no dedup → identical rows, `Task.actualHours` doubled, billable hours inflated (timesheets.service.ts:164 vs 195-214).
- **Task status skips the workflow state machine** — `setStatus` checks only shared `workflowId`, never `WorkflowTransition`; any status reachable in one hop (Open→Closed force-closes subtasks + 100%). Config-driven workflow is effectively dead for tasks (tasks.service.ts:276-333).
- **"Assign PID within a week" is not enforced** — no age check in `assign()`, no expiry job; buffer hours count in personal performance yet never attach to a PID → pad indefinitely (timesheets.service.ts:195; the badge is UI-only).
- **Capacity: unbounded task fetch + board computed twice per page load** — `/capacity` runs `team()` and `coverageRisks()` which calls `team()` again; both fetch every open org task with no `take` (capacity.module.ts:173,537).

**LOW** — pending-leave days clickable/assignable (no warn); undated tasks dilute load across the whole window; member auto-add runs outside the create tx (orphan on failure); issue-logged timesheets carry `projectId:null` (mis-attributed in projectId-keyed reports).

**NOTE** — capacity comment still says "48h week / 9.6h" but constant is now 8 (cosmetic; perf also uses 8 so cross-module reconciliation is fine). **✅ Verified GOOD:** SRA can't assign non-members / cross-project; subtask IDOR genuinely closed; `actualHours` is a full re-sum (no drift); capacity window arithmetic correct (clamped, no off-by-one); `dto.userId` ignored (owner = actor).

## Batch 4 — Attendance / Leave / WFH / Comp-off / Home / Profile-gate (intern persona)

**HIGH**
- **Never-punch-out = full PRESENT day forever** — clock-in writes `status:'PRESENT'`; the `<4h ⇒ HALF_DAY` downgrade runs **only** on the punch-out branch and there's no auto-close job → an intern who punches in and never out is a full present day (totalHours null), `attendanceRate` stays 100% (attendance.module.ts:151,161,517). Companion: the overnight-close books a ~21h "present" day from two punches ~21h apart.

**MED**
- **No late-marking for the new 9am–6pm hours** — punch hardcodes `PRESENT`; `'LATE'` exists + is handled in `getMonth` but the punch flow never derives it. Punch in 2pm→6:30pm (4.5h) = full PRESENT. The 9–6 change ships with zero lateness detection (attendance.module.ts:147).
- **UTC-day math vs IST office** — all boundaries use `utcDay`/`Date.UTC`; the UTC day rolls at 05:30 IST, so any punch/leave-check/comp-off/regularization done 00:00–05:30 IST lands on the prior calendar day. Normal 9–6 IST hours are safe; setting `TZ=Asia/Kolkata` on AWS will NOT fix it (code uses explicit `getUTC*`) (attendance.module.ts:13,120).

**LOW** — regularization status is employee-chosen not hours-derived (HR-gated); `approveRegularization`/`reject`/`regularize`/`mark` lack the org-scope guard the other approvers have (latent multi-org); leave-quota window filters by `startDate` in the current UTC year (boundary over-count).

**NOTE** — asymmetric WFH/leave overlap (leave doesn't reject an existing approved WFH); Home's two punch buttons can race (UX only, server stays consistent). **✅ Verified GOOD (major):** the **first-login profile gate is robust — no bypass** (stamps `profileCompletedAt` only when complete; partial/empty/null all rejected; Indian-mobile/PIN/DOB rules enforced server-side) — confirms the Phase-3 hardening; intern **cannot see anyone's PII** (not even directory tier); Employee preset is correctly minimal (`patent.view` is intentional + safe — handles only, no real number/client name); **self-approval, quota, and date-range validation all hold** (every approve/reject blocks `req.userId===actor`, quota counts PENDING+APPROVED, one-leave-per-day, zero/over-366/all-past rejected, no backdated/future punch).

## Batch 5 — HR people-ops (PII / approvals / appraisals / company comms) — HR persona

**MED**
- **Approvals read + non-decision actions are ungated** — any authenticated user can `GET /approvals?entityType=…&entityId=…` / `GET /approvals/:id` and read any approval record + its full action/comment history, and `addAction` only gates APPROVE/REJECT (so anyone can POST a COMMENT/DELEGATE onto any approval) (approvals.module.ts:29-44,96).
- **Appraisal dead-ends with no manager** — `launch` sets `reviewerId = managerOf ?? null`; an employee with no `UserManager` row gets an appraisal stuck in `PENDING_MANAGER` forever — HR has **no reassign-reviewer / force-complete** endpoint, only `deleteCycle` (appraisals.module.ts:142,262).
- **People-ops queries unbounded / N+1** — `launch` inserts appraisals in a sequential `for…await create` loop (not `createMany`); `directory()`, `celebrations()`, `policyAckStatus()`, `listCycles` all fetch the full roster with no `take` (company.module.ts:125,166,293).

**LOW** — regularization & comp-off decisions lack the org-scope guard leave/WFH have (latent multi-org — also flagged by the attendance agent); birthday month/day broadcast to all via `GET /company/celebrations` (no permission/opt-out; year/age correctly withheld); announcement/policy edit+delete not author-scoped (any manager can edit a colleague's post).

**NOTE** — reimburse rides on `expense.approve` (no distinct payer perm; SoD per-record is correct but a lone approver can strand a reimbursement); regularization notif routes by literal role-name/email not permission.

**✅ Verified GOOD (major):** **PII boundary is solid** (explicit `PERSONAL_FIELDS` allow-list, redaction by key-deletion, a Manager gets only directory tier, an Employee gets Forbidden; users/search/directory select directory-only; profile audit logs field *keys* not values); **SoD holds on every approval** (expenses block payer==claimant AND payer==approver; all self-review blocked); **appraisal authz correct** (only employee/reviewer/`appraisal.manage` can read; manager can't review a non-report); **no XSS** (no `dangerouslySetInnerHTML`, bodies render React-escaped); **HR scope excludes delivery** (no project/task/patent/capacity codes); **privilege-escalation guard real** (`assertActorMayGrant` blocks HR self-granting Manager/Admin/Super-Admin; every user mutation passcode-gated).

## Batch 6 — Performance / Analytics / Reports (Sr Consultant persona)

**HIGH**
- **"Tasks completed" + "on-time %" keyed off `Task.updatedAt`**, not completion date → any edit to an old closed task re-enters it into "completed this window" AND recomputes on-time against *today* (flips a genuinely-on-time task to late). Distorts headline KPIs + leaderboard (performance.service.ts:135-147,280).
- **Two divergent "completed" definitions** — KPI/leaderboard use `updatedAt`; trend/heatmap/snapshots use the completion *event* date → the same task disagrees across surfaces (performance.service.ts:136 vs 209/410).
- **`getOrgHeatmap` always loads the full event window into memory** even when snapshots exist (query outside the `if (!snaps.length)`) → default 365d pulls 100k+ `AnalyticsEvent` rows per heatmap load and throws them away (performance.service.ts:374).

**MED**
- **Buffer (unassigned) timesheets distort everything** — created `billable:true` with null project; every hours aggregation sums them (inflates hoursLogged/billable/score) but `hoursByProject` drops them → `Σ hoursByProject < hoursLogged` reconciliation gap; buffer hours never expire (performance.service.ts:139,479).
- Snapshot `activityVolume` **double-counts** timesheets+comments (+2) vs the live path (+1) → rebuilt heatmap ≈ 2× a wiped-org's (performance.service.ts:406).
- Leaderboard `score` **dominated by raw hoursLogged** (incl. buffer/non-billable) → ranking is gameable by logging hours with no delivery (performance.service.ts:321).
- Missing **`@@index([organizationId, createdAt])`** on AnalyticsEvent → org scans range-scan the whole table (schema).

**LOW/NOTE** — `performance.view.organization` is granted (HR) but **never enforced** (code checks `analytics.view.organization`) → HR's org-perf access silently fails closed; `performance.view.own` enforced UI-only; snapshot `issuesResolved` always 0 (dead event type); `report.export` gate is decorative (client-side export — no leak found: exports are redacted/internal-only); `assertCanView` doesn't verify target shares org (latent multi-org); UTC-vs-IST day skew.
- **⚠ Fix from my working-hours change:** performance page copy still said "Capacity assumes a 48h week" (=9.6h) — corrected to 40h to match the 8h/day change (web app/performance/page.tsx:56).
- **✅ Verified GOOD:** every division is guarded → **a wiped/empty DB yields zeros, not NaN/crash** (genuinely solid).

## Batch 7+8 — Event/Audit logs · Security · AWS-deploy readiness (cross-cutting auditor)

**CRIT**
- (confirms Batch 2) **`GET /documents/:id/content` unguarded** — no permission, no passcode; only channel-attachment docs are gated, so a patent PDF streams to any authenticated user → download the crown-jewel PDF bypassing `patent.manage`+passcode (documents.controller.ts:33; documents.service.ts:166).
- **NEW: the real patent number is written to the logs as a filename, then readable via the unguarded `/activity` feed** — `createFromDocument`→`documents.upload` emits `document.uploaded` with `metadata.name = "US1234567.pdf"` to Activity/AuditLog/AnalyticsEvent; `DOCUMENT` isn't in `SENSITIVE`, and `/activity?entityType=DOCUMENT` bypasses the `audit.view` gate → any employee harvests every uploaded patent number **and** the documentIds to feed the download CRIT above (patents.service.ts:163; audit.service.ts:43).
- **Document storage on ephemeral container FS** → on ECS/Fargate every redeploy permanently loses the files (no blob fallback once `storagePath` set) + 404s across replicas. AWS blocker; needs S3/EFS (documents.service.ts:22,189).

**HIGH**
- **Audit-coverage holes on exactly the sensitive actions** — NOT logged: **patent reveal**, patent/client CRUD, **org passcode set/change/reset**, **login/logout/failed-login/lockout/password-change**, leave/expense/comp-off **approvals**, attendance punch/regularization. You cannot answer "who revealed the patents" or "who changed the passcode." (`APPROVAL_ACTION` defined but never emitted.)
- **`/activity` not route-guarded + IDOR** — `?projectId=`/`?entityId=` bypass the org gate with no membership check; `organizationId` taken from the query not the session (audit.service.ts:33-65).
- **Per-process background timers** (overdue alerts+digests, meeting reminders, channel retention) are `setInterval` per replica with no leader lock → **duplicate notifications** under multi-replica (overdue.module.ts:45; events.service.ts:353; channels.service.ts:509).
- **Single self-hosted Postgres, no backup/HA/PITR** → must be RDS/Aurora on AWS (docker-compose.prod.yml:8).
- **`prisma migrate deploy` in the API boot CMD** → crash-loops all replicas if a migration fails; couples cold-start to migration; every scale-up re-attempts it. Move to a one-off job (apps/api/Dockerfile:36).

**MED**
- Rate-limit + passcode lockout **in-memory** → weaken ×N replicas; need Redis/ElastiCache (app.module.ts:54; passcode.service.ts:27).
- Audit trail **append-only by convention only** — no triggers/REVOKE/hash-chain; any code path or compromised credential can silently update/delete audit rows (schema.prisma:1527).
- **Older modules still trust client-supplied `organizationId`** (users-create, channels-list, departments, rbac, holiday-create, audit) → latent cross-tenant IDOR / mass-assignment once multi-org (users.module.ts:168 etc.).
- **`GET /documents/:id/content` general IDOR** — project "Files" readable by non-members who obtain the cuid (leaks via /activity + listForProject).
- **`/health` returns 200 when the DB is down** (`degraded`) → ALB keeps a DB-severed task in rotation; return 503 (health.controller.ts:11).
- Next standalone **bakes `API_ORIGIN` at build time** → must rebuild the web image for AWS networking (apps/web/Dockerfile:20).

**NOTE / ✅ Verified GOOD:** NODE_ENV/weak-JWT is mitigated **via the Docker images** (`validateEnv()` fails boot in prod on missing/short/placeholder JWT secret, on `AUTH_DEV_TRUST_HEADER=true`, on missing CORS) — residual risk only on a **non-Docker native run** without NODE_ENV=production (reactivates the fallback secret — relevant to the local `npm run serve` path). Confirmed-good controls: helmet, `trust proxy 1`, pinned CORS allowlist, 2MB body limits, global `ValidationPipe(whitelist+forbidNonWhitelisted)`, argon2, login throttle + 8-try lockout, refresh-token rotation with reuse-detection + family revoke, `securityVersion` invalidation, graceful shutdown, **no SQL injection** ($queryRaw is parameterized), migration history is fresh-RDS-safe, no CSRF token but low risk (SameSite=lax + same-origin + credentialed CORS).

**AWS-deploy verdict: NOT READY.** Blockers: (1) patent-doc download bypass, (2) patent numbers in logs + /activity IDOR, (3) doc storage → S3/EFS, (4) RDS not container-Postgres, (5) migrations out of boot CMD, (6) single-runner background jobs (or desiredCount=1), (7) shared throttle/lockout + /health 503 + rebuild web image, (8) add audit events for reveal/passcode/auth/approvals.
