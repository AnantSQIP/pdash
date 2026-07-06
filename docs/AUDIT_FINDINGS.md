# pdash Consolidated Bug Report

Deduped from 47 candidate findings (40 distinct after merging duplicates). 30 CONFIRMED defects below, grouped by final (adjusted) severity. 10 rejected/false-positive findings listed at the end.

Two pairs were merged: the `GET /users/:id` passwordHash leak (reported twice, high+critical) and the `user.manage_access` privilege escalation (reported twice, high+critical).

---

## CRITICAL

### C1 — Privilege escalation: any `user.manage_access` holder (seeded HR) can grant themselves Super Admin
- **Root cause:** The three account-access setters are gated only by the single coarse `@RequirePermission('user.manage_access')` and do NO validation of *what* is being granted. Controller guards at `apps/api/src/modules/users/users.module.ts:169` (PUT `:id/roles`), `:172` (permissions), `:175` (overrides); service methods `setRoles` (114-122), `setPermissions` (124-136), `setOverrides` (138-149) do `deleteMany`+`createMany` with caller-supplied IDs. `PermissionGuard` (`apps/api/src/common/guards/permission.guard.ts:29-32`) only checks the actor holds the code. HR is seeded with `user.manage_access` (`packages/db/prisma/permissions-catalog.ts:177`, wired at `:194`) but lacks `role.*`; the resolver elevates any holder of role name "Super Admin" (`apps/api/src/modules/permissions/permission.service.ts:38-44`). Net: HR can `PUT /users/<self>/roles {roleIds:['role-superadmin']}` and resolve as Super Admin on the next request. Same flaw in `rbac.service.ts` `setRolePermissions`/`setGroupPermissions`.
- **Fix:** In all setters enforce: (a) reject self-target unless actor is Super Admin; (b) require Super Admin to assign the Super Admin role or grant `role.*`/`user.manage_access`; (c) reject granting any code the actor does not itself hold ("grant subset of own"); (d) org-scope the role/permission IDs. Consider removing `user.manage_access` from the HR preset.

### C2 — Entire delivery surface (projects/tasks/issues/comments/milestones/tasklists/workflows) has zero authorization
- **Root cause:** `PermissionGuard` is opt-in — `apps/api/src/common/guards/permission.guard.ts:24` `if (!required || required.length === 0) return true;` — and NONE of the delivery controllers carry `@RequirePermission`, so only `AuthGuard` (authentication) protects their POST/PATCH/PUT/DELETE routes. An Employee whose effective permissions explicitly exclude `project.create/update/delete`, `task.delete`, etc. can still mutate everything. Confirmed comment at `projects.service.ts:145` ("until the PermissionGuard is wired (M5)"). Controllers: `projects.controller.ts:9-42`, `tasks.controller.ts:9-71`, `issues.controller.ts:19-32`, `comments.module.ts:76-94`, `milestones.module.ts:143-176`, `tasklists.module.ts:92-120`, `workflows.module.ts:126-157`.
- **Fix:** Add `@RequirePermission` to every mutating delivery route using the already-seeded codes (`project.create` on POST `/projects`, `project.delete` on DELETE, `task.delete` on DELETE `/tasks/:id`, etc.), or flip `PermissionGuard` to deny-by-default and whitelist read codes.

### C3 — `GET /users/:id` leaks argon2 `passwordHash` and account-security fields to any authenticated user
*(Severity split across auditors: high vs critical — classified critical here because every account's offline-crackable credential hash, including Super Admins', is exposed to the lowest-privilege role.)*
- **Root cause:** `UsersService.get()` at `apps/api/src/modules/users/users.module.ts:65-75` queries with Prisma `include` (relations) and no `select`, so every User scalar is serialized — `passwordHash`, `securityVersion`, `failedLoginCount`, `lockedUntil`, `mustResetPassword`, `passwordChangedAt`, `lastLoginAt`. The route `@Get(':id')` at `:160-161` has no `@RequirePermission` (comment line 156 "Read endpoints stay open"), and `main.ts:11-13` registers only a `ValidationPipe` (no `ClassSerializerInterceptor`/`@Exclude`). Verified live: Employee arjun read super-admin mohit's `$argon2id$...` hash.
- **Fix:** Replace the `include` with an explicit `select` mirroring the safe `list()` projection (`:57-61`) that omits the credential/security columns (keep `userRoles`/`departmentMemberships` via nested select). Add a `@RequirePermission('user.view')` or self-scope on the route.

---

## HIGH

### H1 — Project approve/reject trusts body-supplied `actingUserId` instead of the verified actor (confused deputy)
- **Root cause:** `projects.service.ts` `decide()` calls `assertHasProjectApprovePermission(dto.actingUserId)` → `permissions.check(dto.actingUserId, 'project.approve')` (`:157`, `:201-206`); the verified `getActorId()` is never consulted. The spoofed id is also written to `ApprovalAction.userId` (`:165`) and the audit event `actorId` (`:187`), forging attribution. `ApprovalDto.actingUserId` is a required client body field (`projects/dto.ts:72-73`); routes (`projects.controller.ts:29-37`) have no `@RequirePermission`. User ids are trivially obtainable via `GET /users`.
- **Fix:** Drop `actingUserId` from the DTO; use `getActorId()`/`@Actor()` for the permission check and `ApprovalAction.userId`. Add `@RequirePermission('project.approve')` as defense in depth.

### H2 — Authorship and audit attribution trust client-supplied user ids (`createdBy`/`reportedBy`/`userId`) — spoofable
- **Root cause:** Create services persist and audit client-claimed identity instead of `getActorId()`. `projects.service.ts:42,44,59,71` (createdBy + member.userId + Approval.requestedBy + event actorId); `tasks.service.ts:40` (column only); `issues.service.ts:46,59`; `comments.module.ts:45,59`. `EventService.emit` prefers the passed value (`event.service.ts:37` `opts.actorId ?? getActorId()`), so AuditLog/Activity/AnalyticsEvent rows are attributed to the spoofed user. Breaks non-repudiation and can poison per-user Performance metrics.
- **Fix:** Remove `createdBy`/`reportedBy`/`userId` from the create DTOs and derive from `getActorId()`; stop passing the client value as the EventService `actorId`.

### H3 — Overrides tab never loads existing overrides and Save replaces the full set — wipes pre-existing (incl. invisible DENY) overrides
- **Root cause:** `OverridesTab` inits `useState<Override[]>([])` (`apps/web/app/admin/users/[id]/page.tsx:358`) and never fetches current overrides — no read API exists (`UsersService.get` includes only `userRoles`+`departmentMemberships`, `users.module.ts:65-75`; no GET `/users/:id/overrides`). `save()` calls `setOverrides`, which is `deleteMany`+`createMany` over ALL of the user's overrides (`users.module.ts:138-149`). DENY overrides are additionally undiscoverable because `getEffectivePermissions` does `delete sources[code]` on DENY (`permission.service.ts:63-64`). Adding one ALLOW override and saving destroys every previously-saved override (including security-relevant DENYs).
- **Fix:** Add a backend GET `/users/:id/overrides` (returning `permissionId`+`effect`), preload it into `OverridesTab` initial state, and/or change `setOverrides` to merge semantics. Surface DENY overrides in effective-permissions.

### H4 — New Project creation is broken: `createdBy` is sent as the user's email, backend requires a user id
- **Root cause:** `apps/web/app/projects/ProjectsClient.tsx:216` renders `createdBy={currentUser?.email ?? 'system'}`; `NewProjectModal.tsx:27-33` forwards it; `api.ts:282-283` POSTs it. Backend `projects.service.ts:28-31` does `findFirst({ where: { id: dto.createdBy, ... } })` and throws `BadRequestException('User ${dto.createdBy} not in organization')`. Since ids are cuids and never equal emails, project creation fails for every user. (Downgraded from critical: surfaces a clear error, no data loss/security exposure, but a core feature is fully broken.)
- **Fix:** `ProjectsClient.tsx:216` → `createdBy={currentUser?.id}`. Ideally drop client-supplied `createdBy` and derive from the verified cookie actor server-side.

---

## MEDIUM

### M1 — Access-token `securityVersion` (`sav`) claim is signed but never verified — logout-all and password-change do not revoke live access tokens
- **Root cause:** `sav` is embedded at `apps/api/src/modules/auth/auth.service.ts:34` and incremented on logout-all (`:100`) and password change (`:118`), but no request path checks it. `current-actor.middleware.ts:26` does `jwt.verify<{ sub?: string }>` reading only `payload.sub`. Refresh tokens ARE revoked, but an already-issued access JWT stays valid until its 15m exp.
- **Fix:** In the middleware (or a guard), after JWT verify, load the user's `securityVersion` and reject when `payload.sav !== user.securityVersion` (cache per-request).

### M2 — `GET /activity` is unguarded — any Employee can read the org-wide audit/event feed
- **Root cause:** `@Get('activity')` at `apps/api/src/modules/audit/audit.module.ts:10-19` has no `@RequirePermission`, while sibling `/audit-logs` requires `audit.view` and `/audit-logs/export` requires `audit.export`. `AuditService.listActivity` (`audit.service.ts:28-40`) applies no actor scoping and trusts client-supplied `organizationId`/`entityId`. Live: Employee read `permission.changed` events on User entities performed by a Super Admin.
- **Fix:** Add `@RequirePermission('audit.view')` to the activity route and/or scope results to entities/projects the actor can access; do not trust client-supplied `organizationId`.

### M3 — Channel messages can be posted/joined as an arbitrary user (identity spoofing); all channel mutations ungated
- **Root cause:** `createMessage` takes the author from `dto.userId` (`channels.controller.ts:39-42` → `channels.service.ts:74-87`) and `join` from `@Body('userId')` (`:49-51` → service `:93-98`) rather than `@Actor`. `deleteMessage` (`channels.service.ts:89-91`) does `deleteMany` by id+channelId with no ownership/permission check. No channel route carries `@RequirePermission`.
- **Fix:** Inject `@Actor()` for `createMessage`/`join`; enforce author/permission checks on `deleteMessage`/`deleteChannel`/`updateChannel`; add appropriate `@RequirePermission`/membership guards.

### M4 — Department create / add-member / remove-member are completely ungated
- **Root cause:** `@Post() create`, `@Post(':id/members') addMember`, `@Delete(':id/members/:userId') removeMember` at `apps/api/src/modules/departments/departments.module.ts:111-129` carry no `@RequirePermission` (PermissionGuard is opt-in). `DepartmentsService.addMember`/`create` (lines 42-88) also never verify the target user shares the department's organization. Departments is the only admin/org-structure mutation surface left unguarded.
- **Fix:** Add `@RequirePermission` (e.g. `department.manage`/`org.manage`) to all three routes and validate `dto.userId`/`organizationId` membership.

### M5 — Leave day counting includes weekends/holidays — inflates balances and ON_LEAVE attendance
- **Root cause:** `LeaveService.create()` numDays = `round((end-start)/86400000)+1` raw calendar days (`apps/api/src/modules/attendance/attendance.module.ts:252`); `approve()` writes ON_LEAVE rows for every day in `[startDate,endDate]` with no weekend/holiday skip (`:267-268`); `getMonth()` day-cell precedence puts explicit/onLeave before holiday/weekend checks (`:139-145`) so weekend days inside a leave render ON_LEAVE and join `workingDays` (`:157`); `orgSummary()` increments `onLeave` before the weekend skip (`:206-208`); `balances()` sums the inflated numDays. Contradicts the performance capacity model which excludes weekends/holidays (`performance.service.ts:494-512`). Live: a Tue–Sat leave billed 5 days instead of 4, quota over-depleted.
- **Fix:** Compute numDays and ON_LEAVE rows over business days only (skip Sat/Sun and Holiday rows), consistent with `performance.service.ts` business-day handling.

### M6 — Leave approve/reject allow self-approval (no segregation of duties)
- **Root cause:** `LeaveService.approve()` (`attendance.module.ts:260-276`) and `reject()` (`:278-286`) check only `req.status==='PENDING'`; neither compares `req.userId` to `actorId`. Controller gates only on `@RequirePermission('leave.approve')` (`:421-431`). `cancel()` (`:291`) already has the ownership guard but it wasn't applied here. A Manager who holds `leave.approve` + `leave.request` can file and self-approve their own leave (also writing ON_LEAVE rows).
- **Fix:** In `approve()`/`reject()` add `if (req.userId === actorId) throw new ForbiddenException('cannot review your own leave request')`.

### M7 — RolesTab derives current roles from lossy effective-permission `sources` instead of `eff.roles` — silently drops roles on save
- **Root cause:** `apps/web/app/admin/users/[id]/page.tsx:246-249` and `AddPermissionsWizard.tsx:35-39` reconstruct role membership by scanning `eff.sources` for `role:<name>`. `getEffectivePermissions` records last-write-wins per code (`permission.service.ts:50-57`), so a role whose codes are all shadowed by a higher-precedence grant (or an empty role) leaves no `role:` entry. `setRoles` is REPLACE (`users.module.ts:114-122`), so save deletes the invisible role. Live: arjun has `['Employee','Consultant']` but only `Consultant` survives in sources → toggling+Save drops Employee.
- **Fix:** Derive `currentRoleIds` from `eff.roles` mapped to ids via the roles list (`roles.filter(r => eff.roles.includes(r.name)).map(r => r.id)`), in both `page.tsx:246-249` and `AddPermissionsWizard.tsx:35-39` (and the copy branch `:57-58`).

### M8 — Group Members modal starts empty and `setMembers` replaces the whole roster — adding one member removes all existing members
- **Root cause:** `MembersModal` inits `useState<string[]>([])` (`apps/web/app/admin/page.tsx:359`) and never preloads current members; checkboxes use `checked={ids.includes(u.id)}` (`:367`) so a populated group renders all-unchecked. `save()` (`:360`) calls `setMembers` → `rbac.service.ts:154-165` `deleteMany`+`createMany` (full replace). No read path exists for member ids (`listGroups` returns only `memberCount`, `rbac.service.ts:112-116`; no GET `:id/members`). A careful admin cannot preserve members because they are never displayed.
- **Fix:** Expose member `userIds` from `listGroups` (or add GET `/permission-groups/:id/members`) and seed `MembersModal` with current members so edits are diff-based.

### M9 — No UI to assign or reassign tasks anywhere — `api.tasks.setAssignees` is dead code
- **Root cause:** `setAssignees` is only defined (`apps/web/lib/api.ts:316-317`) and never called. `AddTaskModal.tsx` has no assignee field and omits `assigneeIds` on create (`:37-47`); `TaskDetailPanel.tsx` renders the assignee read-only (`:317-326`, `:394`). Backend supports it (PUT `/tasks/:id/assignees`, `tasks.controller.ts:41`). Task assignment — a core PM operation — is unreachable from the UI.
- **Fix:** Add an assignee multi-select to `AddTaskModal` (pass `assigneeIds` on create) and an editable assignee picker in `TaskDetailPanel` calling `api.tasks.setAssignees`, then invalidate `['tasks', projectId]`.

### M10 — TaskDetailPanel Checklist and Tags are local-only and silently lose data on close
- **Root cause:** Checklist (`apps/web/components/tasks/TaskDetailPanel.tsx:217-228`, UI `:406-445`) and Tags (`:229-234`, UI `:447-475`) are pure React state with no API call; no persistence endpoint exists (no checklist controller — only a `_count` select at `tasks.service.ts:261,282`; the `Tag` model has no Task relation). The panel unmounts on close (returns null when `!task`), destroying entered items/tags with no save indication, while the controls look fully functional.
- **Fix:** Wire checklist to an API backed by the existing `Checklist` model and add a real task-tag relation+endpoints, or remove/label the controls as non-persistent.

### M11 — Settings → Members & Roles tab is a 100% fake mock while a real RBAC API exists at /admin
- **Root cause:** `apps/web/app/settings/page.tsx` MembersTab (176-339): `INITIAL_MEMBERS` hardcoded with fake `@acme.com` users (186-193), Send Invite fakes success via `alert('Invite sent!')` (248), `updateRole` (201-203) and `removeMember` (205-209) mutate only local state, Permission Groups Edit button has no handler (330). Zero API calls in the file. The real wired RBAC surface is `apps/web/app/admin/page.tsx`. Reachable via `Sidebar.tsx:184` and `UserMenu.tsx`.
- **Fix:** Remove the tab/redirect to `/admin`, or wire it to `api.users`/`api.roles`. Do not present editable member tables and an invite flow that discard input.

### M12 — Settings → General shows hardcoded "Acme Corp", Save persists nothing; it is the target of UserMenu "My Profile"/"Account Settings"
- **Root cause:** `apps/web/app/settings/page.tsx:49` `useState('Acme Corp')`, `:88` hardcoded code `pdash-001`, `:63-66` `handleSave` only flips a transient "Saved!" label (no API), `:134`/`:165` Logo/Archive are `alert('... coming soon')`. The real org is "Squark IP"/"pdash-demo" via `api.orgs.list()` (`apps/web/lib/api.ts:256`). `UserMenu.tsx:30,32` route both "My Profile" and "Account Settings" to `/settings`; no profile route exists.
- **Fix:** Bind name/code/timezone/status to the real org via `api.orgs.list()`/org-context, add an org-update endpoint behind Save, and build a real profile page or relabel/re-point the UserMenu items.

### M13 — `api.attendance.today()` throws on the normal empty-body 200 ("not clocked in")
- **Root cause:** `apps/web/lib/api.ts:29` calls `return res.json()` unconditionally. `getToday` returns `null` (`apps/api/src/modules/attendance/attendance.module.ts:27-30`, controller `:345-349`), which Nest serializes as a 200 with `Content-Length: 0`; `JSON.parse('')` throws `SyntaxError`. Typed `Attendance | null` (`api.ts:482`) but can never resolve to null. Both callers (`attendance/page.tsx:56`, `home/sections.tsx:305`) error per query mount (react-query retries once); UI degrades gracefully so impact is console errors + wasted requests on a common daily path. Affects any null/204 endpoint.
- **Fix:** In `req()` guard the parse: `const t = await res.text(); return (t ? JSON.parse(t) : undefined) as T;` (and handle 204).

### M14 — 401→refresh retry is skipped for ALL `/auth/*` paths, so `/auth/me` with an expired access token never refreshes
- **Root cause:** `apps/web/lib/api.ts:19` guard `!path.startsWith('/auth/')` excludes every `/auth/*` path; the exclusion is only needed to avoid recursing on `/auth/refresh`. `/auth/me` is not `@Public` and requires the 15m access JWT (`auth.controller.ts:72`); when it expires but the 14-day refresh cookie is valid, `/auth/me` 401s and `req()` does NOT refresh. `auth-context.tsx` sets `user=null`, and `org-context`/`permissions-context` gate the whole tree on it, so a valid session renders as logged-out after 15 minutes with no self-heal.
- **Fix:** Narrow the guard to skip refresh only for `/auth/refresh` (and optionally `/auth/login`, `/auth/logout`), letting `/auth/me` trigger one silent refresh+retry.

---

## LOW

### L1 — CORS reflects any Origin with credentials enabled
`apps/api/src/main.ts:9` `app.enableCors({ origin: true, credentials: true })` reflects the caller's Origin verbatim (verified live with `evil.example.com`). Mitigated today by `SameSite=Lax` auth cookies (`auth.controller.ts:12`). **Fix:** pin `origin` to an env-config allow-list, keep `credentials:true` only for those.

### L2 — PermissionService wildcard branch bypasses DENY overrides (precedence violation)
`apps/api/src/modules/permissions/permission.service.ts` `check()` wildcard branches (76-78) evaluate `'*'`/`${module}.*` against the post-override allow set; `getEffectivePermissions` (63-65) only removes the specific DENY-overridden code, not the wildcard, so a wildcard ALLOW beats an explicit DENY. Latent (no `*` codes seeded; `module.*` reachable via `permission.create`). **Fix:** expand wildcards inside `getEffectivePermissions` and subtract DENY codes after expansion.

### L3 — Refresh-token rotation has a read-then-write race (no transaction)
`apps/api/src/modules/auth/auth.service.ts`: validity read (`:73` `findUnique`, no lock) and the revoke write (`:86` unconditional `update where:{id}`) are separate with no transaction. Two concurrent requests with the same token both pass `:76` and both mint live tokens, evading reuse-detection. **Fix:** `updateMany({ where: { id, revokedAt: null, replacedById: null }, data: {...} })` and proceed only if `count===1` (or serializable `$transaction`).

### L4 — `GET /users` (list) is unguarded — any authenticated Employee can enumerate all org users
`apps/api/src/modules/users/users.module.ts:157-158` `@Get()` list has no `@RequirePermission`; select is safe (no hash) but no authorization. **Fix:** add `@RequirePermission('user.view')` (consistent with the sibling effective-permissions route). *(Note: a separate candidate claimed these reads were "unauthenticated" — false; see rejected list.)*

### L5 — PermissionOverride lacks a uniqueness constraint and `setOverrides` omits `skipDuplicates`
`packages/db/prisma/schema.prisma:337-349` model `PermissionOverride` has no `@@unique([userId, permissionId])` (unlike every sibling join table); `setOverrides` `createMany` (`users.module.ts:143-145`) doesn't dedupe. Duplicate/contradictory rows can persist (resolution stays deterministic). **Fix:** add `@@unique([userId, permissionId])` AND dedupe the input array (last-write-wins); both are needed.

### L6 — List/get endpoints have no actor org/membership scoping; missing scope param degenerates to "return everything"
`issues.service.ts:16-18` drops the `projectId` filter when undefined; `projects.service.ts:77-83` scopes by client-supplied `organizationId` with no actor check (undefined → match all). Get-by-id paths (`projects.service.ts:106-124`, `issues.service.ts:27-37`, `tasks.service.ts:111-118`, `comments.module.ts:30-38`) fetch purely by id. Latent cross-tenant leak; single-org today. **Fix:** derive `organizationId` from the actor; make `projectId`/`entityId` required; never let an absent filter return all rows.

### L7 — Task status transitions bypass the WorkflowEngine
`apps/api/src/modules/tasks/tasks.service.ts:141-167` `setStatus` does `workflowStatus.findUnique({ where:{ id: dto.statusId } })` and writes it directly — no check that the target belongs to the task's workflow, no `WorkflowTransition(from,to)` lookup, no `allowedRoles`/`conditions` evaluation. Engine (`schema.prisma:392-405`; `workflows.module.ts createTransition`) is write-only/never consumed. **Fix:** before update, require a transition from current→target in the task's workflow and evaluate roles/conditions; at minimum validate the target status's `workflowId` matches the task's.

### L8 — Soft-deleting a task orphans its ProjectTask join rows; project/tasklist/milestone counts overcount deleted tasks
`tasks.service.ts:193-206` `softDelete` sets only `Task.deletedAt`; `ProjectTask` has no `deletedAt` and cascade only fires on hard delete. Unfiltered `_count:{projectTasks:true}` at `projects.service.ts:101,119`, `tasklists.module.ts:56,63`, `milestones.module.ts:87,99` overcounts while `task.list` filters `deletedAt:null`. **Fix:** remove/flag ProjectTask rows on soft-delete, or use a filtered count (`_count: { select: { projectTasks: { where: { task: { is: { deletedAt: null } } } } } }`).

### L9 — POST /projects takes `organizationId` from the body and an intersection-typed `@Body()` defeats DTO validation
`apps/api/src/modules/projects/projects.controller.ts:10-11` `create(@Body() dto: CreateProjectDto & { organizationId: string })`. The intersection emits runtime metatype `Object`, which the global `ValidationPipe` skips, so `CreateProjectDto` constraints (title length) and whitelist aren't enforced; `organizationId` is read from the client body. **Fix:** give `@Body()` a concrete DTO class (add `organizationId` to it or derive org from the actor) so class-validator metadata is emitted.

### L10 — Task creation does not validate that `milestoneId` belongs to the project
`tasks.service.ts:20-25` validates the taskList belongs to `dto.projectId`, but `milestoneId` is written unguarded at `:54`. A task can be linked to a milestone from a different project (the FK enforces existence, not project membership). **Fix:** when `milestoneId` is provided, verify `prisma.milestone.findFirst({ where: { id: dto.milestoneId, projectId: dto.projectId, deletedAt: null } })` and throw otherwise.

### L11 — Permission Simulator verdict ignores wildcard resolution (`*` and `module.*`)
`apps/web/app/admin/page.tsx:560` computes `allowed = eff.isSuperAdmin || eff.codes.includes(code)` (exact match); the real guard `permission.service.ts:71-79` also matches `'*'` and `${module}.*`, so a wildcard grant produces opposite verdicts. Latent (no wildcard codes seeded); fail-safe direction. **Fix:** mirror the wildcard branches, or add a backend `/simulate` endpoint delegating to `PermissionService.check`.

### L12 — AddPermissionsWizard direct/copy grant preservation is lossy (same sources-shadowing flaw)
`AddPermissionsWizard.tsx:40` derives `currentDirectCodes` from `sources==='direct'`; a direct grant overlapping an override is relabeled `override:ALLOW` (`permission.service.ts:61`) or deleted on DENY (`:64`), so it's dropped on `setPermissions` replace (`users.module.ts:128-132`). Latent/rare. **Fix:** expose the user's actual direct permission ids and use that as the union base.

### L13 — Create/Edit admin modals leave the submit button permanently disabled with no error on failed mutation
`apps/web/app/admin/page.tsx`: `CreateRoleModal.submit` (293-298), `CreateNamedModal` onClick (384), `EditNamedModal` onClick (397) `setBusy(true)` then `await` with no try/catch; on rejection `busy` stays true and no error shows. **Fix:** wrap each in try/catch, reset `busy`, render an error (mirror `CreateUserModal` at 189-193).

### L14 — AddTaskModal stores the wrong creator: `createdBy` is the user's email instead of id
`apps/web/components/tasks/AddTaskModal.tsx:45` sends `createdBy: currentUser?.email`. `tasks.service.ts:40` writes it with no validation; `schema.prisma:504` `Task.createdBy String` has no FK, so the email persists as garbage. (Latent — column is write-only today.) **Fix:** send `currentUser?.id`; add server-side validation or derive from the authenticated actor.

### L15 — Multiple no-op icon buttons (dead controls) across the projects UI
Buttons with hover styles but no handler: `ProjectsClient.tsx:134-137` (Filter), `ProjectDetailClient.tsx:175-177` (overflow menu), `TaskDetailPanel.tsx:280-282` (Maximize2), `KanbanBoard.tsx:73-75` (column menu). **Fix:** implement intended behavior or remove the buttons.

### L16 — Settings → Workflows, Integrations, Billing tabs are entirely hardcoded with `alert()` stubs
`apps/web/app/settings/page.tsx`: WORKFLOWS array (418-421) + alert (435) + dead Edit/Duplicate (465-466); INITIAL_INTEGRATIONS GitHub fake-connected (495-502) + Connect alert (533); BILLING_HISTORY "$232" (557-561) + Upgrade/Manage/Download alerts (583/589/634); NotificationsTab Save has no handler (410). No backend modules exist. **Fix:** hide unimplemented tabs or gate behind an explicit "coming soon" state instead of fake data + toggles implying persistence.

### L17 — Sidebar notifications badge is a hardcoded "3"
`apps/web/components/layout/Sidebar.tsx:177-179` renders the badge with a literal `3`, unconditionally; the real `unreadCount` lives in `NotificationsPanel.tsx:86`. **Fix:** lift the count (or a lightweight query) into the Sidebar and render conditionally (hide when 0), or remove the badge.

### L18 — People (Users) page action buttons are dead
`apps/web/app/users/page.tsx`: "Invite Member" (102-105), per-row "View" (178-180), "+ Add Member" (212-214) have no handlers; only `api.users.list`/`api.projects.list` are used. **Fix:** wire to `api.users.create`/navigate to `/admin/users/[id]`, or remove the buttons.

### L19 — Attendance Holidays tab is read-only despite the "manage holidays" promise and existing API/permission
`apps/web/app/attendance/page.tsx:152-174` only lists holidays; subtitle (`:89`) promises "manage holidays". `api.ts:511-513` `createHoliday`/`removeHoliday` are never called; backend POST/DELETE `/leave/holidays` gated on `holiday.manage` exist (`attendance.module.ts:457-467`). **Fix:** add a `can('holiday.manage')`-gated add form + per-row delete, or soften the subtitle.

### L20 — GlobalSearch component is dead code with fabricated demo data and links to non-existent routes
`apps/web/components/layout/GlobalSearch.tsx` is never imported; `ALL_ITEMS` (14-26) are hardcoded fakes pointing to dead `/projects/p1` etc. **Fix:** delete the component or rebuild against real projects/tasks/users APIs before wiring it.

### L21 — TopBar component is unused dead code (non-functional search box, hardcoded notification dot)
`apps/web/components/layout/TopBar.tsx` is never imported (`AppShell.tsx:7,50` uses only Sidebar); search input (19-23) has no handlers; bell dot (27) is static. **Fix:** delete `TopBar.tsx`. (Note: numerous stray `*.bak` files also litter `apps/web/`; consider pruning.)

### L22 — UserMenu has dead menu items ("Keyboard Shortcuts", "Help & Support")
`apps/web/components/layout/UserMenu.tsx:33-34` define neither `href` nor `action`; the button branch (74-82) only runs `onClose()`. **Fix:** remove the entries or give them real actions (shortcuts modal / help URL).

### L23 — Reports CSV export does not escape embedded double-quotes in project titles
`apps/web/app/reports/page.tsx:27` wraps title as `"${p.title}"` without doubling internal `"`; fields joined by naive `,`/`\n` (24-35). A title containing `"` corrupts row alignment. (Commas are safe inside quotes; embedded `"` is the real vector.) **Fix:** wrap every field in quotes and replace internal `"` with `""`.

### L24 — `projects.approve`/`projects.reject` client send wrong body param (`actorId`) — ApprovalDto requires `actingUserId`
`apps/web/lib/api.ts:287-290` POSTs `{ actorId }`; controller binds `ApprovalDto` requiring `actingUserId` (`projects/dto.ts:72-73`); with `whitelist`+`forbidNonWhitelisted` (`main.ts:11-13`) the request 400s twice. Latent (no current callers). **Fix:** send `{ actingUserId: actorId, reason }` (or rename the DTO field). *(Pairs with H1 — the real approval workflow route `POST /approvals/:id/actions` has no client at all.)*

### L25 — Duplicate route registration: GET `/workflows/:id/statuses` defined by two controllers; StatusesController.list is shadowed dead code
`workflows.module.ts:145-148` and `statuses.controller.ts:8-11` register the same Express path; `WorkflowsModule` imported first (`app.module.ts:48-49`) wins, so `StatusesController.list` never executes. **Fix:** remove the shadowed `StatusesController.list` (8-11) to preserve current 404-on-missing behavior, or consolidate the controllers.

### L26 — `ApiProject` type over-claims `createdAt`/`updatedAt` (required) which the list endpoint never returns
`apps/web/lib/api.ts:72` types them required, but the list select (`projects.service.ts:85-102`) omits them; `ProjectsClient.tsx:40-58` `toDisplay()` propagates `undefined`. **Fix:** make `createdAt`/`updatedAt` optional, or split `ApiProjectListItem` vs `ApiProject`.

### L27 — `ApiComment.user` shape mismatch — backend returns only `{id,firstName,lastName}`, type promises full `UserSummary`
`apps/web/lib/api.ts:82` types `user` as `UserSummary` (requires `email`+`status`), but `comments.module.ts:34,49` select only `id,firstName,lastName`. Type-only lie (consumers use names). **Fix:** type as `Pick<UserSummary,'id'|'firstName'|'lastName'>` (matching the existing Issue/Message pattern), or widen the select.

---

## REJECTED / FALSE POSITIVES (checked, not defects)

1. **RBAC privilege-change audit events non-atomic / best-effort** — By design. `EventService.emit` is documented best-effort (`event.service.ts:22-27`); the `if (!actorId) return` path is unreachable for the guarded RBAC setters (AuthGuard + PermissionGuard guarantee a non-null actor). Optional hardening only (pass `tx`, record `oldValue`), not a bug.
2. **"User read endpoints are unauthenticated/unguarded"** — The "unauthenticated" claim is false: `GET /users` and `/users/:id` return 401 without a cookie (global AuthGuard). Authenticated-only read is intentional; the residual hardening (add `user.view`) is already captured as L4/C3.
3. **completionPercentage "multiple of 10" invariant not enforced** — The invariant does not exist. Seed and live data use 18/35/55/62/75; `@IsInt @Min(0) @Max(100)` is correct. The suggested `@IsIn` fix would break shipped data.
4. **/analytics/dashboard and /projects expose org-wide aggregates** — Documented intentional (workstream B4); the genuinely sensitive per-user billable endpoint `/analytics/timesheets` IS gated, and `/projects` exposes nothing the existing ungated `/projects` list doesn't. Auth still enforced (401 without cookie). Optional hardening at most.
5. **Org-scoped endpoints trust client `organizationId`** — Accurate observation but zero impact: single-org system (`GET /organizations` → 1), no second tenant's data exists. Valid latent multi-tenant hardening to do *before* a second org is created; not an active defect.
6. **Hardcoded workflow alias / taskList fallback in AddTaskModal** — Unreachable. No DTO field/UI binds a project to a non-GLOBAL workflow; every project uses the seeded GLOBAL workflow and always gets a default "General" task list. Masked code smell.
7. **Subtask add/close does not invalidate the project task list** — Mechanism real but no impact: no list/board/overview UI renders subtask-derived data (`_count.subtasks` is never displayed), and the server doesn't recompute parent completion from subtasks, so nothing goes stale. The only consumer (the panel's own Subtasks tab) refreshes correctly.
8. **Discuss channel "join" has no UI** — Benign. The backend does not gate access on membership: `listChannels`/`listMessages` are org-wide and `createMessage` auto-joins the sender. `join` is a cosmetic duplicate. Unused API wrappers are a deliberate SDK-completeness pattern here.
9. **projects.create can never receive organizationId** — Mechanism real (intersection type erased, client omits it) but claimed harms don't manifest: the audit event resolves the correct org via `EventService.emit`'s `?? resolveOrg(actorId)` fallback, and the `Project` model has no `organizationId` column (single-org). Harmless dead parameter, not a data-integrity defect.
10. **Backend routes with no client coverage** — Self-labeled informational. Working, reachable endpoints the current web client doesn't yet call (milestones CRUD, approvals, logout-all, audit export, etc.). Normal API design, no correctness/security impact.

---

### Cross-cutting note
The dominant root cause behind C1–C2, H1–H2, M2–M4, and M6 is the same: **`PermissionGuard` is opt-in (`permission.guard.ts:24`) and several modules were never annotated**, plus **multiple endpoints bind identity/permission to client-supplied fields instead of the verified `getActorId()` cookie actor**. A single high-leverage remediation — flipping `PermissionGuard` to deny-by-default (whitelisting reads) and removing all client-supplied `createdBy`/`reportedBy`/`userId`/`actingUserId`/`organizationId` in favor of the verified actor — would close the majority of the critical/high findings at once.