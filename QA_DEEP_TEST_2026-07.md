# pdash — Deep QA test sweep (2026-07)

Multi-agent QA to find every bug / missing feature / production-breaker / AWS-deploy risk before
the AWS rollout. Agents act as real Indian users of specific roles (personas), tracing the actual
code paths each persona exercises across the modules — this is **code-level flow tracing** (the
reliable method here: the local instance is wiped/old-build and Contabo is live team data, so we
don't click a live UI). A live Playwright pass can follow if a dedicated seeded test instance is
stood up.

**Priority order (per request):** Projects → Patents → Performance FIRST, then the whole system,
then cross-cutting (event/audit logs, security, prod/AWS readiness).

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
  - ☐ Batch 3 — Performance (metric correctness, per-user vs org-wide, formulas, authz, empty-data, working-hours impact)
- **Phase 2 — Full system**
  - ☐ Batch 4 — Attendance + Leave + Comp-off + WFH + Timesheets(new PID/buffer) + Capacity(offices/pending leaves)
  - ◐ Batch 5 — HR people-ops (PII/appraisals/comms/approvals) ✔ [Discuss/Calendar/Channels not yet covered]
  - ☐ Batch 6 — Users/RBAC + Profile-gate + Home/Dashboard + Expenses + Rewards
- **Phase 3 — Cross-cutting**
  - ☐ Batch 7 — Event logs + Audit logs coverage + security sweep (authz/IDOR/cross-org/leaks)
  - ☐ Batch 8 — Production + AWS-deploy readiness (env/secrets, migrations, file storage/S3, health, scaling, N+1, indexes, Docker, HTTPS, backups)
- **Phase 4 — Synthesis** — consolidate + dedupe + severity-rank → final report

## Progress log
_(append one line per batch as it completes, so this survives a session drop)_
- 2026-07-24: plan created; Phase 0 research launched; working hours changed.
- 2026-07-24: Batch 1 (Projects) ✔ — 4 HIGH (stranded null-PID, unbounded list, closed-project write bypass, search membership leak), 6 MED, findings recorded. 8-agent fleet running for B2–B8 (Patents, Performance, Tasks/Timesheets/Capacity, Attendance/Leave/Home, HR, Audit/Security/AWS-deploy).

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

_(next batches append below)_
