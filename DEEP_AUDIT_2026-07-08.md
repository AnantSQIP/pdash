# pdash — Deep Audit (bug / broken-workflow / architecture)

**Workflow:** `pdash-deep-audit` · run `wf_d424a948-890` · **status: completed** (2026-07-08 19:45 UTC)
**Agents:** 223 · **Tokens:** 1,522,071 · **Duration:** 2.1 h

Recovered from workflow run-state after the launching chat sessions (`3c9f567c`, `b876cca3`) hit spend/session limits. The 190 'stopped agents' were this run's verify-phase agents (95 unique findings × 2 adversarial verifiers) — they finished; the run completed in the background.

## Summary

| raw | unique | confirmed | plausible | refuted | regressions still-present | partial | fixed |
|----|----|----|----|----|----|----|----|
| 111 | 95 | 16 | 1 | 1 | 2 | 5 | 41 |

## Confirmed findings (16)

### 1. [HIGH] HR (the designated onboarding role) cannot assign the Employee role or any delivery role — new-user onboarding is broken
- **module:** rbac / user access management · **category:** broken-workflow · **verdict:** CONFIRMED · **auditId:** new
- **files:** `apps/api/src/modules/users/users.module.ts:82, apps/api/src/modules/users/users.module.ts:102, apps/api/src/modules/users/users.module.ts:150, apps/api/src/modules/users/users.module.ts:205, packages/db/prisma/permissions-catalog.ts:164, packages/db/prisma/permissions-catalog.ts:177, packages/db/prisma/seed.ts:143`
- **what:** C1's assertActorMayGrant enforces 'you may only grant a role whose permissions are a subset of your own'. Seeded HR is people-ops only (HR_CODES has no delivery perms) yet is the role with user.create + user.manage_access. The Employee role includes project.view/task.view/task.create etc., so overreach(EmployeeRolePerms) for an HR actor is non-empty -> ForbiddenException in both create() and setRoles(). Same for every delivery role.
- **repro:** Log in as HR, /admin -> Add User -> tick 'Employee' -> Create. POST /users throws 403 'You cannot grant a role with permissions you do not hold: project.view...'. HR can only create a user with no role (zero access).
- **impact:** The role designed for onboarding cannot onboard anyone; every HR-created account is rejected or left with no permissions.
- **fix:** Gate role assignment on user.manage_access + an assignable-role allow-list rather than subset-of-own, or grant HR the delivery .view codes, or exempt non-privilege-bearing codes from the overreach check.

### 2. [HIGH] Generic /approvals/:id/actions endpoint is unguarded and trusts a client-supplied userId — any authenticated user can approve/reject any Approval and forge the actor
- **module:** approvals · **category:** security · **verdict:** CONFIRMED · **auditId:** new
- **files:** `apps/api/src/modules/approvals/approvals.module.ts:6, apps/api/src/modules/approvals/approvals.module.ts:7, apps/api/src/modules/approvals/approvals.module.ts:39, apps/api/src/modules/approvals/approvals.module.ts:51, apps/api/src/modules/approvals/approvals.module.ts:67, apps/api/src/modules/approvals/approvals.module.ts:77, apps/api/src/app.module.ts:76`
- **what:** ApprovalsController carries no @RequirePermission and PermissionGuard is opt-in, so only AuthGuard applies. addAction() takes the actor from AddApprovalActionDto.userId (unvalidated) and, on APPROVE/REJECT, unconditionally flips Approval.status with no PermissionService and no getActorId, no PENDING check, no segregation of duties. The list route is also ungated so ids are discoverable. This is a second writer to the Approval row: flipping a PROJECT approval here bricks projects.decide()'s later 'find PENDING approval' lookup, denying the real approval route.
- **repro:** As any Employee: GET /api/v1/approvals?entityType=PROJECT&entityId=<pid> for the id, then POST /approvals/<id>/actions {userId:'<any>',action:'APPROVE'} -> 201, status APPROVED attributed to spoofed userId, no permission.
- **impact:** Authorization bypass + attribution forgery on the approval subsystem, plus cross-path corruption that leaves projects stuck in PLANNING.
- **fix:** Add @RequirePermission (project.approve / approval.decide), drop userId from the DTO and derive the actor from getActorId(), reject non-PENDING and self-review, and route project decisions through ProjectsService.decide().

### 3. [MEDIUM] Project approval workflow is unreachable from the UI — created projects are stuck PENDING/PLANNING forever, rejection is an unrecoverable dead-end, and tasks can be added to unapproved projects
- **module:** projects · **category:** broken-workflow · **verdict:** CONFIRMED · **auditId:** L24
- **files:** `apps/api/src/modules/projects/projects.service.ts:40, apps/api/src/modules/projects/projects.service.ts:45, apps/api/src/modules/projects/projects.service.ts:61, apps/api/src/modules/projects/projects.service.ts:154, apps/api/src/modules/projects/projects.service.ts:189, apps/api/src/modules/projects/projects.controller.ts:30, apps/web/lib/api.ts:338, apps/web/lib/api.ts:340, apps/web/app/projects/[id]/ProjectDetailClient.tsx:30, apps/web/app/reports/page.tsx:51, apps/api/src/modules/tasks/tasks.service.ts:22`
- **what:** create() writes phase PLANNING and a PENDING Approval, but nothing gates the project on it: list/get return it, update edits it, tasks.service.create adds tasks freely without checking approval status. The approve/reject route (POST /projects/:id/approve|reject) and its client wrappers api.projects.approve/reject exist and are correctly gated but have ZERO callers anywhere; there is no /approvals route or pending-approvals inbox, and the project detail tabs/header expose only Add Task. On reject, decide() sets phase back to PLANNING (visually identical to never-reviewed) and, since decide() requires a PENDING approval now REJECTED, the project can never be re-decided or resubmitted.
- **repro:** Create a project -> appears in Planning with a pending approval, fully editable with tasks addable. No button/tab/page calls approve/reject; the project can never become ACTIVE through the app. Forcing a reject via API drops it to PLANNING with no way to resubmit.
- **impact:** The entire project governance/approval workflow is a no-op; every project accumulates an orphan PENDING approval; 'rejected' is a dead-end; QA files 'created project but can't approve it / it never goes active'.
- **fix:** Add an approvals surface (pending-approvals list or Approve/Reject action on the project header when the user holds project.approve and an approval is PENDING) calling api.projects.approve/reject and invalidating ['projects']/['project',id]; gate/lock unapproved projects and block task creation until APPROVED; add a resubmit path after rejection.

### 4. [MEDIUM] New Project button and modal are shown to every user but hard-fail with 403 for Employees/Consultants, who lack project.create
- **module:** projects · **category:** broken-workflow · **verdict:** CONFIRMED · **auditId:** new
- **files:** `apps/web/app/projects/ProjectsClient.tsx:134, apps/api/src/modules/projects/projects.controller.ts:10, packages/db/prisma/permissions-catalog.ts:107`
- **what:** ProjectsClient renders 'New Project' and NewProjectModal unconditionally with no can('project.create') gate. The backend route requires project.create, but EMPLOYEE_CODES and CONSULTANT_CODES do not include it (only Manager and Senior Consultant do). An Employee/Consultant sees the button, fills the form, submits, and gets a 403 in the modal.
- **repro:** Log in as an Employee, /projects -> New Project -> fill -> submit -> red error 'project.create permission required'; nothing created.
- **impact:** A class of users is invited into a workflow they can never complete; the 'request a project' concept does not exist for non-managers.
- **fix:** Gate the button/modal behind can('project.create') (hide or disable with tooltip), and/or implement a genuine request-project path.

### 5. [MEDIUM] Changing an Open task's status silently wipes its 100% progress back to 0%
- **module:** tasks · **category:** data-integrity · **verdict:** CONFIRMED · **auditId:** new
- **files:** `apps/api/src/modules/tasks/tasks.service.ts:203, apps/web/app/tasks/page.tsx:86, apps/web/lib/tasks.ts:17`
- **what:** setStatus computes completion as status.type==='CLOSED'?100:(task.completionPercentage>=100?0:task.completionPercentage), using >=100 as a proxy for reopening a closed task, but it fires on ANY transition to a non-CLOSED status. lib/tasks.ts documents that a task can legitimately sit at 100% while Open, so this is self-contradictory. The optimistic patch mirrors the wipe, so the loss shows and persists.
- **repro:** Set an OPEN task's progress to 100%, then change its status to another open status (or drag between open columns) -> progress silently drops to 0% and project rollup recomputes with it at 0.
- **impact:** Silent data loss on a routine status/drag; a 100%-done open task loses that value on the next move, dropping project/milestone bars.
- **fix:** Gate the reset on the PRIOR status type: wasClosed = task.currentStatus?.type==='CLOSED'; completion = CLOSED?100:(wasClosed?0:current). Apply the same fix to the optimistic patch and TaskDetailPanel.

### 6. [LOW] Account lockout never resets failedLoginCount when the lock expires, so a single wrong attempt after cooldown re-locks the account immediately
- **module:** auth · **category:** correctness · **verdict:** CONFIRMED · **auditId:** new
- **files:** `apps/api/src/modules/auth/auth.service.ts:54, apps/api/src/modules/auth/auth.service.ts:65`
- **what:** failedLoginCount increments on each failure and lockedUntil is set at MAX_FAILED=8. failedLoginCount is reset to 0 ONLY on successful login. When the 15-min lock expires the counter stays at 8, so the next failed attempt computes 9>=8 and re-locks immediately.
- **repro:** Fail 8 times -> locked 15 min. Wait it out. Enter one more wrong password -> immediately locked again for a full 15 minutes with zero grace attempts, repeating indefinitely.
- **impact:** A once-locked user gets zero-tolerance thereafter — one fumble = another 15-minute lock.
- **fix:** Reset failedLoginCount when lockedUntil is non-null but in the past before incrementing, or decay the counter.

### 7. [LOW] Role.name has no uniqueness constraint; duplicate role names collapse in the resolver and cause RolesTab to check/assign every same-named role
- **module:** rbac / roles · **category:** data-integrity · **verdict:** CONFIRMED · **auditId:** new
- **files:** `packages/db/prisma/schema.prisma:231, apps/api/src/modules/permissions/permission.service.ts:40, apps/web/app/admin/users/[id]/page.tsx:253, apps/web/components/admin/AddPermissionsWizard.tsx:36`
- **what:** Role has only @@index([organizationId]) — no @@unique([organizationId,name]). The system keys on role NAME: the resolver builds roles from a Set of role.name, and RolesTab/AddPermissionsWizard resolve current roles by name. Two roles sharing a name that a user holds cause the name-filter to match BOTH ids: UI renders both checked and Save assigns both — silently granting an unheld role. Super Admin itself is detected only by name.
- **repro:** Create two roles both named 'Reviewer', assign one to a user; both rows show checked; Save -> user granted both roles' permissions.
- **impact:** Effective-permission attribution and role assignment can silently diverge from admin selection; underpins fragile by-name Super Admin detection.
- **fix:** Add @@unique([organizationId,name]) to Role, reject duplicate names, identify roles (and Super Admin) by id.

### 8. [LOW] No UI to edit, deactivate, reactivate or suspend a user; user list also hides every non-ACTIVE user, making them permanently unmanageable
- **module:** users · **category:** broken-workflow · **verdict:** CONFIRMED · **auditId:** new
- **files:** `apps/web/lib/api.ts:321, apps/api/src/modules/users/users.module.ts:117, apps/web/app/admin/users/[id]/page.tsx:83, apps/web/app/users/page.tsx:154`
- **what:** api.users.update (PATCH /users/:id) is defined but never called by any component. UsersService.list filters status:'ACTIVE',deletedAt:null. Both People and admin read that ACTIVE-only list. If a user is ever set INACTIVE/SUSPENDED (only possible via direct API), they vanish from every roster, the detail page can't resolve them (header shows generic 'User'), and there is no reactivate path.
- **repro:** Deactivate via PATCH /users/:id {status:'INACTIVE'}; reload /users and /admin -> user is gone from both; navigate to /admin/users/<id> -> header shows 'User' with no name/email; no reactivate button anywhere.
- **impact:** Admins cannot rename, re-title, deactivate, suspend, or reactivate any user; any non-ACTIVE user is erased from all UI and cannot be restored without DB/API surgery.
- **fix:** Wire api.users.update into an Edit-user modal with a status control, and stop hard-filtering list() to ACTIVE only (or add an endpoint including inactive users).

### 9. [LOW] People 'Departments' tab is fabricated from job-title strings and ignores the real Department/DepartmentMember model; labels an arbitrary member as 'Head'
- **module:** users · **category:** ux · **verdict:** CONFIRMED · **auditId:** new
- **files:** `apps/web/app/users/page.tsx:16, apps/web/app/users/page.tsx:17, apps/web/app/users/page.tsx:71, apps/web/app/users/page.tsx:195, packages/db/prisma/seed.ts:171`
- **what:** The Departments view groups users by bucketing designation strings through a hardcoded departmentOf() map into fictional buckets, ignoring the real seeded Department/DepartmentMember model (exposed by GET /departments / :id/members, api.departments.list, but never fetched). Each card renders Head: fullName(members[0]) — whoever sorts first by lastName — falsely presented as department head. Unmatched designations fall into 'Other'.
- **repro:** Open /users -> Departments. Departments shown are derived from job titles not seeded departments (Prosecution/Trademarks/Operations absent); each 'Head' is just the alphabetically-first member.
- **impact:** Fabricated departments and department heads contradict real records; real department assignments are invisible; displayed Head is misleading.
- **fix:** Fetch real departments and members via api.departments.list / /departments/:id/members; drop the designation heuristic and the members[0] Head label (or source a real lead field).

### 10. [LOW] Adding a user already in a department returns HTTP 500 (unhandled Prisma P2002) instead of 409
- **module:** departments · **category:** crash · **verdict:** CONFIRMED · **auditId:** new
- **files:** `apps/api/src/modules/departments/departments.module.ts:85, packages/db/prisma/schema.prisma:189`
- **what:** DepartmentsService.addMember guards only for missing department and wrong-org user, then does departmentMember.create. DepartmentMember has @@unique([departmentId,userId]), so re-adding throws P2002. There is no global exception filter, so it bubbles as a generic 500 rather than 409.
- **repro:** POST /api/v1/departments/<deptId>/members {userId:<already-member>} -> 500 (unique constraint violation).
- **impact:** Confusing 500 for a benign duplicate; any UI/integration gets an opaque error instead of a conflict.
- **fix:** Catch P2002 and throw ConflictException (mirror users.create), or pre-check membership; add a global Prisma exception filter mapping P2002->409.

### 11. [LOW] No way to add or remove project members — no endpoint, no client method, no UI; the creator is the sole permanent member of every project
- **module:** projects · **category:** broken-workflow · **verdict:** CONFIRMED · **auditId:** new
- **files:** `apps/api/src/modules/projects/projects.controller.ts:1, apps/api/src/modules/projects/projects.controller.ts:6, apps/api/src/modules/projects/projects.service.ts:50, apps/web/lib/api.ts:325, apps/web/app/projects/[id]/ProjectDetailClient.tsx:539`
- **what:** The only ProjectMember ever written is the creator auto-added as MANAGER in create(). ProjectsController exposes only create/list/get/update/approve/reject/delete — no members sub-route; grep finds no projectMember.create/addMember/removeMember; api.ts projects client has no addMember/removeMember; the Overview renders members read-only. A project is only ever visible to its creator (list filters projects by members.some).
- **repro:** Open any project -> Overview -> Team Members: only the creator, no add/remove control (UI or API). A teammate can only appear via task assignment, never as a member.
- **impact:** A core PM capability (staffing/reassigning a team) is absent; ProjectMember.projectRole/isActive are write-once dead data; QA: 'I can't add my teammate to the project'.
- **fix:** Add POST/DELETE /projects/:id/members (+ role update) gated on project.update, validating same-org, with matching api.ts methods and an add/remove members UI that invalidates ['project',id].

### 12. [LOW] Tasks can be created against a soft-deleted (archived) project because softDelete does not cascade taskLists/milestones
- **module:** projects · **category:** data-integrity · **verdict:** CONFIRMED · **auditId:** new
- **files:** `apps/api/src/modules/projects/projects.service.ts:209, apps/api/src/modules/tasks/tasks.service.ts:22`
- **what:** softDelete() sets Project.deletedAt + phase ARCHIVED and cascades issues/tasks but never soft-deletes the project's taskLists or milestones. tasks.service.create validates the taskList only by {id,projectId,deletedAt:null} and never checks the parent project's deletedAt, so the archived project's still-live taskListId accepts new tasks (and still-live milestones via milestoneId).
- **repro:** DELETE /projects/:id (archives). Read a still-live taskList id from the General list. POST /api/v1/tasks with it -> 201; a task is created and ProjectTask-linked to a deleted project.
- **impact:** Orphan tasks accumulate under archived projects and can perturb cross-project ProjectTask counts; deleted projects keep receiving work with no UI to see it.
- **fix:** In softDelete also set deletedAt on the project's taskLists and milestones inside the transaction, and/or have tasks.create verify the project is not deletedAt.

### 13. [LOW] No cross-field date validation: dueDate can be earlier than startDate, and NewProjectModal never captures startDate
- **module:** projects · **category:** correctness · **verdict:** CONFIRMED · **auditId:** new
- **files:** `apps/api/src/modules/projects/dto.ts:32, apps/api/src/modules/projects/projects.service.ts:142, apps/web/components/projects/NewProjectModal.tsx:19`
- **what:** CreateProjectDto/UpdateProjectDto validate startDate and dueDate individually (@IsDateString) but enforce no dueDate>=startDate invariant, and update() writes them verbatim. NewProjectModal collects only a dueDate (never a startDate), so startDate is always null on creation.
- **repro:** PATCH /projects/:id {startDate:'2026-08-01',dueDate:'2026-07-01'} -> 200, persisted with end before start. Or create via modal: startDate never set.
- **impact:** Invalid date ranges corrupt Gantt/timeline rendering and duration math; UI-created projects have no start date.
- **fix:** Add a cross-field validator (or service guard) rejecting dueDate<startDate, and add a startDate field to NewProjectModal.

### 14. [LOW] Project decide() allows self-approval — no segregation of duties between requester and approver
- **module:** projects · **category:** security · **verdict:** CONFIRMED · **auditId:** new
- **files:** `apps/api/src/modules/projects/projects.service.ts:154, packages/db/prisma/permissions-catalog.ts:86`
- **what:** decide() checks only that a PENDING approval exists and that the actor holds project.approve; it never compares actorId to approval.requestedBy. Every role that can create a project also holds project.approve, so the creator can always approve their own project.
- **repro:** As a Manager, create a project (you become requestedBy) then POST /projects/:id/approve -> succeeds, self-approving.
- **impact:** Latent today (no approve UI), but if wired up, any project can be self-approved, defeating the review gate.
- **fix:** In decide() throw ForbiddenException when getActorId()===approval.requestedBy unless the actor is a designated admin.

### 15. [INFO] User email has no format validation — arbitrary non-email strings become login identifiers
- **module:** users · **category:** data-integrity · **verdict:** CONFIRMED · **auditId:** new
- **files:** `apps/api/src/modules/users/users.module.ts:31`
- **what:** CreateUserDto.email is validated only as @IsString @MinLength(3) @MaxLength(160) with no @IsEmail(). create lowercases and stores whatever is passed, and that value becomes the sole login handle.
- **repro:** POST /api/v1/users {email:'abc',...} succeeds; the account's login identifier is 'abc'.
- **impact:** Garbage email addresses persist as identities, breaking any email-dependent flow (invites, reset delivery) and polluting the directory.
- **fix:** Add @IsEmail() to CreateUserDto.email.

### 16. [INFO] UserManager reporting-hierarchy model and relations are entirely dead — never set or read anywhere
- **module:** users · **category:** dead-code · **verdict:** CONFIRMED · **auditId:** new
- **files:** `packages/db/prisma/schema.prisma:147, packages/db/prisma/schema.prisma:79`
- **what:** UserManager plus User.managedBy/manages relations are modeled but no code creates, updates, reads, or reports on them; grep across api and seed returns nothing. No endpoint assigns a manager and no consumer reads the relation.
- **repro:** grep -rn 'managerId|UserManager|managedBy' apps/api/src seed.ts -> no matches; the hierarchy is unset and unused.
- **impact:** A modeled core org concept (reporting lines) is unimplemented; any report assuming a manager has nothing to read and admins cannot define reporting lines.
- **fix:** Either implement manager assignment (endpoint + UI with cycle prevention) and consume it in reports, or remove the unused model/relations.

## Plausible (needs human judgment) (1)

### 1. [LOW] User-list projection ships every user's full base64 profile photo (up to 900KB each) and is fetched app-wide on every page
- **module:** users · **category:** performance · **verdict:** PLAUSIBLE · **auditId:** new
- **files:** `apps/api/src/modules/users/users.module.ts:123, apps/web/lib/org-context.tsx:32, apps/api/src/modules/users/users.module.ts:62`
- **what:** UsersService.list selects profilePhoto:true, a full data:image base64 string capped only at 900,000 chars. The list is loaded app-wide by org-context (keyed ['users',orgId], used to derive currentUser) plus People/admin/user-detail/assignee resolution — essentially every authenticated page. No lazy photo endpoint, so every fetch transfers all photos for all users.
- **repro:** Open any page; ['users',orgId] returns the roster with each inline base64 photo. At the 900KB max, a 28-user org ships ~25MB per fetch, re-fetched as the 30s staleTime lapses.
- **impact:** Large repeated payloads on the app's hottest query, inflating load time/bandwidth; scales linearly with user count and photo size.
- **fix:** Remove profilePhoto from the list projection; serve photos via a dedicated per-user endpoint (or thumbnail/URL column) with a much smaller server-side cap.

## Refuted (verifiers rejected) (1)

### 1. [?] Refresh-token reuse detection destroys a valid session if a rotation response is lost in transit (false-positive theft beyond the 15s grace)
- **module:** auth · **category:**  · **verdict:**  · **auditId:** -

## Regressions — prior findings re-checked (48)

- **[PARTIALLY-FIXED]** C1 — Privilege escalation: any user.manage_access holder (seeded HR) can grant themselves Super Admin
- **[PARTIALLY-FIXED]** M2 — GET /activity is unguarded — any Employee can read the org-wide audit/event feed
- **[PARTIALLY-FIXED]** M12 — Settings → General shows hardcoded "Acme Corp", Save persists nothing
- **[STILL-PRESENT]** L4 — GET /users (list) is unguarded — any authenticated Employee can enumerate all org users
- **[PARTIALLY-FIXED]** L6 — List/get endpoints have no actor org/membership scoping; missing scope param degenerates to 'return everything'
- **[PARTIALLY-FIXED]** L7 — Task status transitions bypass the WorkflowEngine
- **[STILL-PRESENT]** L12 — AddPermissionsWizard direct/copy grant preservation is lossy (sources-shadowing flaw)

_41 of 48 prior findings verified fixed; the 2 still-present + 5 partial are listed above._