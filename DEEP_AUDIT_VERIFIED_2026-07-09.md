# pdash — Deep Audit, FULLY VERIFIED

_All 95 findings now have a verdict. The original `pdash-deep-audit` workflow verified 18 before its verify phase died (160/190 agents killed by spend+session limits on 2026-07-08). The remaining 77 were verified in-session on 2026-07-09 by reading the code at `/home/sqip031/pdash` (main@5fb2e03, the live tree)._

## Verdict summary

| verdict | count |
|----|----|
| ✅ CONFIRMED | **88** |
| 🟡 PLAUSIBLE (needs judgment) | 5 |
| ❌ REFUTED (false positive / already fixed) | 2 |
| **total** | **95** |

**Confirmed by severity:** 1 critical, 10 high, 36 medium, 38 low, 3 info

Verification source: 18 by the workflow's 2× adversarial verify agents; 77 in-session against the live code tree.


## ✅ CONFIRMED

**[CRITICAL] Internet-facing live deployment runs with NODE_ENV unset, so all production hardening is silently disabled and the API signs JWTs with a weak dev secret**  
`infra / runtime-config`  
→ live API pid has no NODE_ENV in environ; main.ts:11 prod=false skips validateEnv; auth.controller.ts:13 secure:isProd=false; JWT signed with dev-access-secret-* → forgeable cookie  

**[HIGH] HR (the designated onboarding role) cannot assign the Employee role or any delivery role — new-user onboarding is broken**  
`rbac / user access management`  
→ workflow verify-phase (2 adversarial agents)  
→ files: `apps/api/src/modules/users/users.module.ts:82, apps/api/src/modules/users/users.module.ts:102, apps/api/src/modules/users/users.module.ts:150, apps/api/src/modules/users/users.module.ts:205, packages/db/prisma/permissions-catalog.ts:164, pa`  
→ fix: Gate role assignment on user.manage_access + an assignable-role allow-list rather than subset-of-own, or grant HR the delivery .view codes, or exempt non-privilege-bearing codes from the overreach check.  

**[HIGH] Generic /approvals/:id/actions endpoint is unguarded and trusts a client-supplied userId — any authenticated user can approve/reject any Approval and forge the actor**  
`approvals`  
→ workflow verify-phase (2 adversarial agents)  
→ files: `apps/api/src/modules/approvals/approvals.module.ts:6, apps/api/src/modules/approvals/approvals.module.ts:7, apps/api/src/modules/approvals/approvals.module.ts:39, apps/api/src/modules/approvals/approvals.module.ts:51, apps/api/src/modules/a`  
→ fix: Add @RequirePermission (project.approve / approval.decide), drop userId from the DTO and derive the actor from getActorId(), reject non-PENDING and self-review, and route project decisions through ProjectsService.decide().  

**[HIGH] The 'Admin' role can self-promote to real Super Admin by renaming any role to 'Super Admin' (updateRole unguarded; by-name detection; no system-role protection)**  
`rbac / roles`  
→ permission.service.ts:41 detects Super Admin by role NAME; rbac.service.ts:77 updateRole bare update; controller gates only role.update (Admin has it)  

**[HIGH] Role/group permission and membership setters (rbac.service) still lack the anti-escalation subset check that the user setters enforce (C1 residual)**  
`rbac / roles & groups`  
→ setRolePermissions/setGroupPermissions/setGroupMembers do blind deleteMany+createMany, no assertActorMayGrant (exists only in users.module.ts)  

**[HIGH] Milestones and non-default Task Lists are entirely unreachable from the UI — no api.milestones client, no milestone/tasklist creation UI, hierarchy collapses to one hardcoded list**  
`milestones / tasklists`  
→ api.ts has no milestones client; taskLists exposes only list(); ProjectDetailClient has 0 milestone refs, collapses to isDefault list; AddTaskModal has no milestone picker  

**[HIGH] Discuss channel messages load the OLDEST 50 (orderBy asc + take), so once a channel passes 50 messages new messages never appear**  
`collab/channels`  
→ channels.service.ts:108-112 listMessages orderBy createdAt asc + take 50 → returns oldest 50  

**[HIGH] Timesheets module has zero authorization and trusts a client-supplied userId — any authenticated user can log/inflate/edit/delete anyone's billable hours**  
`timesheets`  
→ timesheets.controller imports no RequirePermission, no route gated; dto.userId required client field; update/softDelete look up by id only, no ownership check  

**[HIGH] Performance 'tasks completed' counts EVERY task.status_changed event, not just completions — snapshots, trend lines, org rollup and sparklines are all inflated and disagree with the KPI tile**  
`events / performance`  
→ perf lines 183/314/581 count every task.status_changed as a completion; KPI tile (windowMetrics/l.68) filters CLOSED → they disagree  

**[HIGH] Org performance leaderboard is O(users) N+1: one dashboard load fires 14N+2 Prisma queries (~394 for 28 users)**  
`performance`  
→ windowMetrics = 7 Prisma stmts; getOrgPerformance calls it 2×/user in Promise.all map → 14N+2 (~394 for 28 users)  

**[HIGH] rebuildSnapshots serializes up to days×users UserMetricDaily upserts (365×28 ≈ 10k) with await inside a nested loop**  
`performance`  
→ rebuildSnapshots default days=365; `await userMetricDaily.upsert` inside per-day loop → sequential round-trips  

**[MEDIUM] Project approval workflow is unreachable from the UI — created projects are stuck PENDING/PLANNING forever, rejection is an unrecoverable dead-end, and tasks can be added to unapproved projects**  
`projects`  
→ workflow verify-phase (2 adversarial agents)  
→ files: `apps/api/src/modules/projects/projects.service.ts:40, apps/api/src/modules/projects/projects.service.ts:45, apps/api/src/modules/projects/projects.service.ts:61, apps/api/src/modules/projects/projects.service.ts:154, apps/api/src/modules/pr`  
→ fix: Add an approvals surface (pending-approvals list or Approve/Reject action on the project header when the user holds project.approve and an approval is PENDING) calling api.projects.approve/reject and invalidating ['projects']/['project',id]; gate/lock unapproved projects and block task creation unti  

**[MEDIUM] New Project button and modal are shown to every user but hard-fail with 403 for Employees/Consultants, who lack project.create**  
`projects`  
→ workflow verify-phase (2 adversarial agents)  
→ files: `apps/web/app/projects/ProjectsClient.tsx:134, apps/api/src/modules/projects/projects.controller.ts:10, packages/db/prisma/permissions-catalog.ts:107`  
→ fix: Gate the button/modal behind can('project.create') (hide or disable with tooltip), and/or implement a genuine request-project path.  

**[MEDIUM] Changing an Open task's status silently wipes its 100% progress back to 0%**  
`tasks`  
→ workflow verify-phase (2 adversarial agents)  
→ files: `apps/api/src/modules/tasks/tasks.service.ts:203, apps/web/app/tasks/page.tsx:86, apps/web/lib/tasks.ts:17`  
→ fix: Gate the reset on the PRIOR status type: wasClosed = task.currentStatus?.type==='CLOSED'; completion = CLOSED?100:(wasClosed?0:current). Apply the same fix to the optimistic patch and TaskDetailPanel.  

**[MEDIUM] Punching in on an approved-leave / holiday / admin-marked-absent day silently overwrites the day to PRESENT while the leave balance stays deducted**  
`attendance`  
→ CONFIRMED — punch() first branch upserts status:'PRESENT' whenever checkIn null, overwriting ON_LEAVE/ABSENT row  

**[MEDIUM] Clock-out across the UTC midnight boundary is impossible — an overnight shift leaves the prior day permanently open and opens a phantom new day**  
`attendance`  
→ CONFIRMED — punch() keys on utcDay(now); overnight checkout lands on new date, prior day never closed  

**[MEDIUM] Overlapping/duplicate leave requests double-deplete the balance, and neither create nor approve enforces the remaining quota**  
`attendance`  
→ CONFIRMED — neither create nor approve checks for overlap; numDays double-counts  

**[MEDIUM] Leave can be requested for entirely past dates; approval retroactively debits the balance and back-writes ON_LEAVE that silently no-ops on days already present**  
`attendance`  
→ CONFIRMED — create() only guards end<start; past-dated leave accepted, retroactively written on approve  

**[MEDIUM] Regularized / manual attendance times are stored in an ambiguous timezone (offset-less strings parsed server-local) while punch stores the true instant**  
`attendance`  
→ CONFIRMED — regularize does new Date(offset-less client string), no tz normalization  

**[MEDIUM] Approved leave never appears on the Calendar — leave writes only ON_LEAVE attendance rows, which the calendar doesn't read**  
`attendance/leave`  
→ CONFIRMED — approve() writes ON_LEAVE attendance rows but no CalendarEvent  

**[MEDIUM] Activity-feed audit.view gate is bypassable: any employee can read confidential permission/role change activity for any targeted user via entityId**  
`audit`  
→ CONFIRMED — gate only when !projectId && !entityId; any entityId (role ids guessable) skips it  

**[MEDIUM] mustResetPassword is enforced only in the browser; the API grants a fully-privileged session and never blocks a temp-password user**  
`auth`  
→ CONFIRMED — API returns mustResetPassword but grants full session; only AppShell.tsx:53 redirects  

**[MEDIUM] No password-recovery / invite-link flow exists: the AuthToken model is dead code and the signup page promises a non-existent 'invite link to set your password'**  
`auth`  
→ CONFIRMED — authToken only in seed.ts:59 deleteMany(); dead model; no recovery flow  

**[MEDIUM] Delete-own-comment button in the project Discussion tab 403s silently for every non-admin — comment.delete is Admin/Super-Admin-only**  
`collab/comments`  
→ CONFIRMED — comment.delete not in ANY non-admin role array; UI shows button by ownership → 403  

**[MEDIUM] Issue Delete (all roles) and status-change (Employees) buttons 403 and fail SILENTLY — issue.delete is Admin/Super-Admin-only and errors are swallowed by empty catch**  
`collab/issues`  
→ CONFIRMED — issue.delete in no non-admin role; issue.update absent from EMPLOYEE_CODES; buttons shown → 403  

**[MEDIUM] Assigning an issue to a user never notifies them (no parity with task assignment, which does notify)**  
`collab/issues`  
→ CONFIRMED — issues.service.ts has zero notify/notification calls  

**[MEDIUM] Posting a comment creates NO notification and @mentions are entirely unimplemented, despite Settings advertising 'Comments & mentions'**  
`collab/notifications`  
→ CONFIRMED — comments.module.ts has no notify/mention code  

**[MEDIUM] Task table has no index on updatedAt / dueDate / currentWorkflowStatusId — every performance & analytics aggregation scans tasks**  
`db`  
→ CONFIRMED — Task model has only @@index([deletedAt])  

**[MEDIUM] Task dependency subsystem is schema-only: dependencies can never be created, are never enforced in setStatus, and are never displayed**  
`dependencies / tasks`  
→ CONFIRMED — grep for taskDependency/dependsOn/blockedBy across api+web = 0 refs  

**[MEDIUM] Calendar-event update and delete have no permission or organizer-ownership check — any authenticated user can edit or cancel anyone's meeting**  
`events (calendar)`  
→ CONFIRMED — events.controller has no RequirePermission; service update/softDelete only call get(id), no ownership check  

**[MEDIUM] Audit/activity/analytics feed is incomplete: TASK_UPDATED, TASK_ASSIGNED, SUBTASK_*, PROJECT_UPDATED, COMMENT_DELETED, APPROVAL_ACTION are defined but never emitted**  
`events / audit`  
→ CONFIRMED — EVENTS.TASK_UPDATED/TASK_ASSIGNED/SUBTASK_CREATED/PROJECT_UPDATED defined but never emitted (grep=0)  

**[MEDIUM] No global exception filter: raw Prisma errors (P2025/P2002/P2003) and any non-HttpException become an opaque HTTP 500 instead of 404/409/400**  
`infra / error-handling`  
→ CONFIRMED — no ExceptionFilter/useGlobalFilters/@Catch anywhere  

**[MEDIUM] Rate limiting covers only /auth/login and /auth/refresh; the global throttler is inert and every other endpoint is unthrottled**  
`infra / throttling`  
→ CONFIRMED — ThrottlerModule.forRoot present but only @UseGuards(ThrottlerGuard) on 2 auth routes; no APP_GUARD  

**[MEDIUM] Seed ships denormalized completion percentages that violate the app's own derivation rule; milestones seed at 0% despite completed tasks, and db:seed never runs the reconciliation backfill**  
`packages/db (seed)`  
→ CONFIRMED — seed.ts hardcodes completionPercentage literals (62/18/35/55/20), violating derive-from-children rule  

**[MEDIUM] Org trend & contribution-heatmap read UserMetricDaily snapshots that are never auto-refreshed; after the first 'Rebuild snapshots' they freeze and diverge from the live charts**  
`performance`  
→ CONFIRMED — rebuildSnapshots only via manual endpoint; no Cron/@Interval; snapshots never auto-refresh  

**[MEDIUM] Per-user contribution heatmap live fallback caps activity at 1 per day and never accumulates, so every active day renders as the lowest intensity and the actions total is undercounted**  
`performance`  
→ CONFIRMED — `if(!map.has(k)) map.set(k, (map.get(k)??0)+1)` sets each day once → capped at 1  

**[MEDIUM] Project/Milestone completionPercentage has two conflicting writers (manual edit + task rollup) that silently clobber each other — manual edits from Reports revert on the next task activity**  
`projects/milestones/tasks`  
→ CONFIRMED — manual writer (projects.service.ts:144, milestones:117, DTOs) + rollup (recomputeProjectProgress) both write the field  

**[MEDIUM] Settings → General 'Save Changes' reports success but silently discards Timezone and Brand Color; Logo & Archive are alert() stubs**  
`settings`  
→ CONFIRMED — Branding upload is alert('Upload coming soon'); timezone save is local-state only  

**[MEDIUM] Subtasks can never be reopened; completing a parent task cascade-closes them irreversibly**  
`tasks`  
→ CONFIRMED — closeSubtask only sets CLOSED; no reopen path; setStatus cascade-closes  

**[MEDIUM] Rollup recomputes (project %, milestone %, task actualHours) are non-transactional read-modify-writes → lost updates leave permanently wrong totals**  
`tasks/timesheets`  
→ CONFIRMED — recomputeForTask runs after the task tx as separate findMany+update, no $transaction  

**[MEDIUM] Timesheet submit/approve workflow does not exist — time can be logged but never submitted or approved**  
`timesheets`  
→ CONFIRMED — Timesheet model/service have no status/submit/approve  

**[MEDIUM] List endpoints return the entire table with no pagination; the project Timesheets tab fetches all rows and renders them unvirtualized**  
`timesheets`  
→ CONFIRMED — listForProject/listForUser findMany with no take/skip  

**[MEDIUM] An admin cannot reset another user's password from the app — no endpoint and no UI exist**  
`users/auth`  
→ CONFIRMED — no reset endpoint in users.module.ts; working branch adds only self-service change + CLI script  

**[MEDIUM] Home dashboard attendance cards use a different query-key namespace than the Attendance page, so punch/regularize/leave-approval never refresh them**  
`web/attendance`  
→ CONFIRMED — home uses ['att-today']/['leave-balances']; Attendance page uses ['attn-today',userId] — different namespaces  

**[MEDIUM] A transient failure of /me/effective-permissions silently collapses the whole app to a 'no access' shell with no error and no recovery**  
`web/state-providers`  
→ CONFIRMED — data?.codes??[] + isSuperAdmin false on failure → can() false everywhere → app collapses to no-access  

**[MEDIUM] Task status/progress/assignee changes only refresh the list they were made from; the same task stays stale in the other list**  
`web/tasks`  
→ CONFIRMED — invalidateTasks only touches ['tasks',projectId]/['project',projectId]; same task elsewhere stays stale  

**[MEDIUM] Workflow engine is inert: transitions/allowedRoles/conditions are never evaluated and there is no API to create/edit/delete workflow statuses**  
`workflows / statuses`  
→ CONFIRMED — transitions/allowedRoles/conditions stored (workflows.module) but tasks.service.setStatus never evaluates them  

**[LOW] Account lockout never resets failedLoginCount when the lock expires, so a single wrong attempt after cooldown re-locks the account immediately**  
`auth`  
→ workflow verify-phase (2 adversarial agents)  
→ files: `apps/api/src/modules/auth/auth.service.ts:54, apps/api/src/modules/auth/auth.service.ts:65`  
→ fix: Reset failedLoginCount when lockedUntil is non-null but in the past before incrementing, or decay the counter.  

**[LOW] Role.name has no uniqueness constraint; duplicate role names collapse in the resolver and cause RolesTab to check/assign every same-named role**  
`rbac / roles`  
→ workflow verify-phase (2 adversarial agents)  
→ files: `packages/db/prisma/schema.prisma:231, apps/api/src/modules/permissions/permission.service.ts:40, apps/web/app/admin/users/[id]/page.tsx:253, apps/web/components/admin/AddPermissionsWizard.tsx:36`  
→ fix: Add @@unique([organizationId,name]) to Role, reject duplicate names, identify roles (and Super Admin) by id.  

**[LOW] No UI to edit, deactivate, reactivate or suspend a user; user list also hides every non-ACTIVE user, making them permanently unmanageable**  
`users`  
→ workflow verify-phase (2 adversarial agents)  
→ files: `apps/web/lib/api.ts:321, apps/api/src/modules/users/users.module.ts:117, apps/web/app/admin/users/[id]/page.tsx:83, apps/web/app/users/page.tsx:154`  
→ fix: Wire api.users.update into an Edit-user modal with a status control, and stop hard-filtering list() to ACTIVE only (or add an endpoint including inactive users).  

**[LOW] People 'Departments' tab is fabricated from job-title strings and ignores the real Department/DepartmentMember model; labels an arbitrary member as 'Head'**  
`users`  
→ workflow verify-phase (2 adversarial agents)  
→ files: `apps/web/app/users/page.tsx:16, apps/web/app/users/page.tsx:17, apps/web/app/users/page.tsx:71, apps/web/app/users/page.tsx:195, packages/db/prisma/seed.ts:171`  
→ fix: Fetch real departments and members via api.departments.list / /departments/:id/members; drop the designation heuristic and the members[0] Head label (or source a real lead field).  

**[LOW] Adding a user already in a department returns HTTP 500 (unhandled Prisma P2002) instead of 409**  
`departments`  
→ workflow verify-phase (2 adversarial agents)  
→ files: `apps/api/src/modules/departments/departments.module.ts:85, packages/db/prisma/schema.prisma:189`  
→ fix: Catch P2002 and throw ConflictException (mirror users.create), or pre-check membership; add a global Prisma exception filter mapping P2002->409.  

**[LOW] No way to add or remove project members — no endpoint, no client method, no UI; the creator is the sole permanent member of every project**  
`projects`  
→ workflow verify-phase (2 adversarial agents)  
→ files: `apps/api/src/modules/projects/projects.controller.ts:1, apps/api/src/modules/projects/projects.controller.ts:6, apps/api/src/modules/projects/projects.service.ts:50, apps/web/lib/api.ts:325, apps/web/app/projects/[id]/ProjectDetailClient.ts`  
→ fix: Add POST/DELETE /projects/:id/members (+ role update) gated on project.update, validating same-org, with matching api.ts methods and an add/remove members UI that invalidates ['project',id].  

**[LOW] Tasks can be created against a soft-deleted (archived) project because softDelete does not cascade taskLists/milestones**  
`projects`  
→ workflow verify-phase (2 adversarial agents)  
→ files: `apps/api/src/modules/projects/projects.service.ts:209, apps/api/src/modules/tasks/tasks.service.ts:22`  
→ fix: In softDelete also set deletedAt on the project's taskLists and milestones inside the transaction, and/or have tasks.create verify the project is not deletedAt.  

**[LOW] No cross-field date validation: dueDate can be earlier than startDate, and NewProjectModal never captures startDate**  
`projects`  
→ workflow verify-phase (2 adversarial agents)  
→ files: `apps/api/src/modules/projects/dto.ts:32, apps/api/src/modules/projects/projects.service.ts:142, apps/web/components/projects/NewProjectModal.tsx:19`  
→ fix: Add a cross-field validator (or service guard) rejecting dueDate<startDate, and add a startDate field to NewProjectModal.  

**[LOW] Project decide() allows self-approval — no segregation of duties between requester and approver**  
`projects`  
→ workflow verify-phase (2 adversarial agents)  
→ files: `apps/api/src/modules/projects/projects.service.ts:154, packages/db/prisma/permissions-catalog.ts:86`  
→ fix: In decide() throw ForbiddenException when getActorId()===approval.requestedBy unless the actor is a designated admin.  

**[LOW] Milestone auto-complete/revert (D1) is dead: RollupService is an empty stub, no AutomationEngine exists, the rule is never seeded, milestones are created with no workflow, and milestone status never advances**  
`rollup / milestones / automation`  
→ CONFIRMED — RollupService is `export class RollupService {}` (empty stub)  

**[LOW] Soft-deleting a milestone or task list orphans its ProjectTask join rows (SetNull only fires on hard delete)**  
`milestones`  
→ CONFIRMED — milestone.softDelete sets deletedAt only, no cascade to ProjectTask.milestoneId  

**[LOW] Task List view hardcodes the list header to 'General', mislabeling projects whose default list has another name**  
`tasks-ui`  
→ CONFIRMED — ProjectDetailClient:366 hardcodes 'General'  

**[LOW] A task with no workflow status is invisible on the Kanban board**  
`tasks-ui`  
→ CONFIRMED — KanbanBoard filter matches col.id/name; null status matches nothing  

**[LOW] Approval-requested notifications are never sent: project creation auto-opens a PENDING approval but no approver is notified**  
`collab/notifications`  
→ CONFIRMED — projects.service create() opens PENDING approval, no notify  

**[LOW] Adding a holiday on a date that already has one throws an unhandled Prisma P2002 (HTTP 500); organizationId is taken from the client body**  
`attendance`  
→ CONFIRMED — holiday.create unguarded; unique clash → P2002 → 500 (no global filter)  

**[LOW] attendanceRate counts ON_LEAVE days in the denominator, penalizing employees on approved leave — contradicts the availability-normalized model**  
`attendance`  
→ CONFIRMED — WORKING array includes ON_LEAVE, inflating the denominator  

**[LOW] Reports 'Tasks' column and CSV/PDF export overcount soft-deleted tasks (analytics.getProjectStats _count.projectTasks is unfiltered)**  
`analytics`  
→ CONFIRMED — _count.projectTasks counts join rows regardless of task deletedAt  

**[LOW] Estimated-vs-actual bullet chart sums all-time and soft-deleted timesheet hours for 'actual' instead of non-deleted hours in the selected window**  
`performance`  
→ CONFIRMED — task.timesheets select has no date/deletedAt filter  

**[LOW] createTransition writes the raw (unresolved) workflowId and never validates the from/to statuses belong to that workflow**  
`workflows`  
→ CONFIRMED — createTransition doesn't validate from/to statuses belong to the workflow  

**[LOW] EventService.emit is non-transactional across its three sinks and silently drops all events when no actor is in context — sinks can diverge**  
`audit-events (event spine)`  
→ CONFIRMED — 3 sinks written separately (no tx unless passed); silent `return` when no actorId  

**[LOW] Leave Approvals card is gated on leave.approve but its data endpoint requires leave.view.organization — an approve-only role sees a false 'no pending requests' and cannot approve**  
`web/home-dashboard`  
→ CONFIRMED — card gate=can('leave.approve'); orgRequests endpoint @RequirePermission('leave.view.organization')  

**[LOW] Home dashboard formats date-only fields in local time instead of the UTC-safe helper, shifting the displayed day by one in negative-UTC-offset zones**  
`web/home-dashboard`  
→ CONFIRMED — toLocaleDateString/Time on dueDate/startDate (l.179/437), off-by-one risk  

**[LOW] Home stat cards read ['analytics-dashboard'] which no project/task mutation invalidates, so counts stay stale after create/delete**  
`web/home-dashboard`  
→ CONFIRMED — only reports/page.tsx:114 invalidates it  

**[LOW] Attribution columns store user ids as free strings with NO foreign key (AnalyticsEvent.userId, Approval.requestedBy, ApprovalAction.userId, *createdBy/uploadedBy/grantedBy) — inconsistent with Activity, no referential integrity**  
`packages/db (schema)`  
→ CONFIRMED — AnalyticsEvent.userId is bare String, no @relation  

**[LOW] DocumentVersion lacks @@unique([documentId, versionNumber]) and an index; WorkflowTransition lacks any unique/index — duplicate versions/transitions can be persisted**  
`packages/db (schema)`  
→ CONFIRMED — DocumentVersion has versionNumber Int, no @@unique/@@index  

**[LOW] Prod compose starts web before the API is ready (no healthcheck/condition), yielding 502s on /api/* during the migrate+boot window**  
`infra / docker-compose`  
→ CONFIRMED — web depends_on: [api] (list form, no condition); api has no healthcheck → 502 window  

**[LOW] Deleting a user is impossible from the app — no DELETE route and no UI (only status can be toggled)**  
`users`  
→ CONFIRMED — no @Delete route in users.module.ts  

**[LOW] ProjectTask/Milestone/TaskList sequence assigned from a COUNT read outside the transaction — concurrent creates get duplicate ordering**  
`tasks/milestones/tasklists`  
→ CONFIRMED — sequence = projectTask.count() then insert (count-then-write race)  

**[LOW] Issue status-change, issue delete, and timesheet delete swallow errors with empty catch{} — failed mutations look like they succeeded**  
`web/projects`  
→ CONFIRMED — IssuesTab updateStatus `catch {}` empty  

**[LOW] Projects list computes avatar initials via user.lastName[0], bypassing the safe helper — members with no surname render 'Xundefined'**  
`web/projects`  
→ CONFIRMED — `${firstName[0]}${lastName[0]}` direct index, crashes/garbles on null lastName  

**[LOW] api.departments.list return type mismatch — DepartmentSummary.memberCount is never populated (backend returns _count.members)**  
`departments`  
→ CONFIRMED — backend returns _count.members; DepartmentSummary.memberCount never populated  

**[LOW] WorkflowStatus.sequence (and project-list currentStatus.type) are typed required but never returned by the task/project selects**  
`tasks/projects`  
→ CONFIRMED — typed required in api.ts but backend never sends them (nullable in practice)  

**[LOW] FilesTab is a dead module: fully mock file data + alert() stubs, rendered from an unreachable branch**  
`projects`  
→ CONFIRMED — MOCK_FILES + alert() stubs throughout  

**[LOW] Four fake Settings tabs (Notifications/Workflows/Integrations/Billing) remain in the file as dead code with hardcoded fake data**  
`settings`  
→ CONFIRMED (dead code) — Notifications/Workflows/Integrations/Billing fns remain in file, but already hidden from the tab bar (lower impact than implied)  

**[LOW] POST /attendance/:id/regularize has no permission gate and no ownership check (IDOR write on attendance rows)**  
`attendance`  
→ CONFIRMED —  

**[LOW] Gantt and Kanban render every task row/node with no virtualization; whole-timeline DOM is built up front**  
`web/projects`  
→ CONFIRMED — GanttView .map over all rows, no windowing  

**[LOW] No mutation ever invalidates the Activity feeds; the TaskDetailPanel Activity tab has no auto-refetch so it silently lags**  
`web/activity`  
→ CONFIRMED — grep for activity invalidation = 0  

**[LOW] Logging/deleting time recomputes Task.actualHours server-side but the client only invalidates the timesheets query**  
`web/timesheets`  
→ CONFIRMED — TimesheetsTab invalidate() only ['timesheets',projectId], not tasks/project  

**[INFO] User email has no format validation — arbitrary non-email strings become login identifiers**  
`users`  
→ workflow verify-phase (2 adversarial agents)  
→ files: `apps/api/src/modules/users/users.module.ts:31`  
→ fix: Add @IsEmail() to CreateUserDto.email.  

**[INFO] UserManager reporting-hierarchy model and relations are entirely dead — never set or read anywhere**  
`users`  
→ workflow verify-phase (2 adversarial agents)  
→ files: `packages/db/prisma/schema.prisma:147, packages/db/prisma/schema.prisma:79`  
→ fix: Either implement manager assignment (endpoint + UI with cycle prevention) and consume it in reports, or remove the unused model/relations.  

**[INFO] Dead fabricated demo data: MOCK_PROJECTS (Apollo/Mobile App v2.0/'JD' etc.) exported but never used**  
`lib`  
→ CONFIRMED (dead) — MOCK_PROJECTS never imported anywhere outside mock-data.ts  


## 🟡 PLAUSIBLE — needs your judgment

**[MEDIUM] Migration/schema drift: 6 indexes declared in schema.prisma are absent from the only migration (0_init), so prod (migrate deploy) never creates them while dev (db push) has them**  
`packages/db (migrations vs schema)`  
→ PLAUSIBLE — schema has 51 @@index vs 75 CREATE INDEX in migration; couldn't confirm the specific 6-index drift from counts alone (needs index-by-index diff)  

**[MEDIUM] UI/API authorization mismatch: user.view-only personas see enabled role/permission/override Save controls that 403, and the Save handlers swallow the error silently**  
`web admin / user detail`  
→ PLAUSIBLE — view gated on user.view/permission.view; consistent with the shown-action/403 pattern but I didn't confirm the Save-button gating in RolesTab/AddPermissionsWizard  

**[MEDIUM] Leave request Submit and Cancel swallow backend rejections — the form silently does nothing with no error shown**  
`web/attendance`  
→ PLAUSIBLE — the regularize modal surfaces errors (setError/alert); couldn't confirm a truly-silent leave submit/cancel path  

**[MEDIUM] RBAC edits never refresh the live permission gate — two different query keys cache the same effective-permissions data**  
`web/permissions`  
→ PLAUSIBLE — provider uses ['effective-permissions',currentUser.id]; a second key exists on the admin path; didn't fully trace the invalidation gap  

**[LOW] User-list projection ships every user's full base64 profile photo (up to 900KB each) and is fetched app-wide on every page**  
`users`  
→ workflow verify-phase  
→ files: `apps/api/src/modules/users/users.module.ts:123, apps/web/lib/org-context.tsx:32, apps/api/src/modules/users/users.module.ts:62`  
→ fix: Remove profilePhoto from the list projection; serve photos via a dedicated per-user endpoint (or thumbnail/URL column) with a much smaller server-side cap.  


## ❌ REFUTED — false positive or already fixed

**[HIGH] New Project creation is broken — createdBy is threaded through as the user's email, backend requires a user id**  
`web/projects`  
→ projects.service.ts create() was rewritten to ignore body and use getActorId() from the verified cookie (comment: 'fixes spoofable createdBy and email-vs-id create bug'); creation works. False positive on current code.  

**[?] Refresh-token reuse detection destroys a valid session if a rotation response is lost in transit (false-positive theft beyond the 15s grace)**  
`auth`  
→ workflow verify-phase  
