# Tasks module — 28-tester QA (Round 3 of 5)

**Round 3 = Tasks.** Method = deep code-level persona teardown of `apps/web/app/tasks/page.tsx` +
`apps/web/components/tasks/*` + the per-project Kanban/TaskList + `apps/api/src/modules/tasks/*`,
backed by a **live browser check** and **adversarial verification** before any finding is recorded.

## ⚠️ Already fixed in Round 1 (do NOT re-flag as new):
- `GET /tasks` now has `@RequirePermission('task.view')`.
- `assertTaskWritable` guards task update / setStatus / setAssignees / softDelete (no edits/moves on a completed/closed matter).
- `listForUser` scoped to tasks in projects the user is STILL an active member of (stale-membership leak closed).

## Surface map (condensed)
**Web:** `/tasks` (`app/tasks/page.tsx` — cross-project "My Tasks", status-bucket tabs All/Open/In-Progress/
Closed/Overdue with counts, priority filter, search; desktop table + mobile cards; inline status dropdown +
progress dropdown + complete toggle). `components/tasks/TaskDetailPanel.tsx` (right-side drawer dialog; tabs
Details/Assignees/Subtasks/Comments/Activity; status pill+menu, editable title/desc, progress slider, editable
Plan (priority/est-hours/start/deadline), assignee search, subtask checklist, delete/save-close footer).
`components/projects/KanbanBoard.tsx` (per-project board; native HTML5 drag-drop; cards; FALLBACK columns until
statuses load; index-0 catch-all for no/foreign status). `components/tasks/AddTaskModal.tsx` (new task; reused by
Capacity assign flow w/ prefills). `app/projects/[id]/ProjectDetailClient.tsx` (`TaskListView` + `handleMove`).
`lib/tasks.ts` (`OPEN_TYPE`/`CLOSED_TYPE`, `isTaskClosed` = `currentStatus.type==='CLOSED'`, `taskAssigneeUsers/Ids`).
**API:** `modules/tasks/{tasks.controller,tasks.service,dto}.ts`. Status model: every task → a `WorkflowStatus`
(`type` OPEN|CLOSED); "closed" = `currentStatus.type==='CLOSED'`. **Workflow transitions** (`setStatus`): target must
belong to the task's `workflowId` (else 400); if the workflow has `WorkflowTransition` rows, a move must follow a
defined edge; workflows with no transitions allow any move (backward-compat). **Progress coupling**: →CLOSED forces
completion 100% + cascades subtasks CLOSED; reopen resets 0% + reopens subtasks; an open 100% task moving to another
open status keeps 100% (reset keys on prior status not %). **Assignees**: `ensureAssigneesAreMembers` auto-adds a
non-member as MEMBER only if the actor has oversight (else 400 "ask a manager"); runs on create/setAssignees/subtask-
create; `assignedById` set when assignees present. **Subtasks**: flat one-level; close parent cascades subtasks;
reopen cascades. **ProjectTask M2M**: create wraps Task+ProjectTask in a tx, computes sequence; delete soft;
`recomputeForTask` re-averages progress across ALL parent projects. **Gates**: `task.create` POST; `task.view` GET list;
**`GET /tasks/:id` has NO @RequirePermission** (service `assertTaskAccess` only); `task.update` PATCH/status/subtasks;
`task.assign` PUT assignees; `task.delete` DELETE. No `task.transition` perm (rides task.update).
**UI hotspots:** kanban native DnD (no touch DnD; drag disabled until statuses load); TaskDetailPanel z-index (backdrop
z-40/panel z-50/status-menu z-30 above sticky z-10 tab bar — regression-prone) + sticky tab bar overflow; My Tasks
9-col table→cards swap; the decoy "checkbox" div; overdue UTC vs IST; assignee flush race (optimistic single-in-flight).

## Roster & task access (verified 2026-07-25)
- **Everyone has `task.view`/`create`/`update`** except HR (HR_CODES has no task perms → walled out).
- `task.assign`: Consultant/SrConsultant/SRA/Manager/Admin/SA (via presets). `task.delete`: Manager+.
- Oversight (auto-add non-member assignees) = Super Admin OR `project.approve` holder.

## Tester → persona → lens
| # | Person | Role | Lens / focus |
|---|---|---|---|
| 1 | Mohit Kalra | Super Admin | TaskDetailPanel full teardown (status menu, Plan, save/delete footer) |
| 2 | Yash Bhargava | Super Admin | Workflow transitions (modeled vs unmodeled) + progress↔status coupling |
| 3 | Nitin Goel | Manager | Assignee auto-add-member (oversight) + assign flow + assignedById |
| 4 | Neha Shukla | Senior Consultant | Oversight task access + cross-project M2M progress rollup |
| 5 | Ketan Dagar | Sr Research Assoc | Subtasks (create/close/reopen/cascade/delete, IDOR) |
| 6 | Amritpal Kaur | Sr Research Assoc | Task-time logging + 24h cap + issue-time interplay on tasks |
| 7 | Basant Goyal | Sr Research Assoc | Kanban drag-drop (fallback columns, no/foreign-status catch-all, optimistic move) |
| 8 | Khushi Gupta | Sr Research Assoc | Permission matrix (role × task action; GET /:id no-perm gate) |
| 9 | Meetu Singh | Consultant | My Tasks page (cross-project list, tabs+counts, filters, search) |
| 10 | Vijay Mishra | Consultant | Task detail as a member (editable fields, any leak, closed-project lock) |
| 11 | Ajay Sharma | Consultant | AddTaskModal (create, validation, prefills, status/date) |
| 12 | Anant Gupta | Employee (intern) | Empty / no-data states (My Tasks, kanban, panel, subtasks) |
| 13 | Aman Sharma | Employee (intern) | Loading + error states (silent failures, error copy) |
| 14 | Arjun Ghosh | Employee | Responsive / mobile (kanban 85vw, panel drawer, tab overflow, table→cards) |
| 15 | Ankit Verma | Employee | Accessibility (kanban DnD keyboard, panel dialog/focus, status menu, decoy checkbox) |
| 16 | Divyanshu Saxena | Employee | Links / navigation (no /tasks/[id] route, task→project chip, deep-link, panel state) |
| 17 | Drishti Jain | Employee | Data correctness (progress rollup across parents, completion clamp, due UTC/IST, counts) |
| 18 | Geetesh Rathore | Employee (intern) | **UI/CSS-conflict + visual** (panel z-index/sticky tabs, kanban overflow, avatar class-bug) |
| 19 | Poorvi Gupta | Employee (intern) | Render / perf (invalidation storm on move, N+1, cache keys, re-renders) |
| 20 | Ragini Kumari | Employee (intern) | Cross-component consistency (status pill/priority color across panel/kanban/list) |
| 21 | Rajesh Joshi | Employee (intern) | Copy / microcopy (tabs, empty states, buttons, status names, errors) |
| 22 | Ritik Sharma | Employee (Sr BD) | Non-delivery persona (are tasks relevant/usable for BD; empty list) |
| 23 | Ronak Khandelwal | Employee | Interaction / feedback (optimistic move rollback, double-submit, assignee flush race, toast) |
| 24 | Sugandh Raghav | Employee | Visual polish (spacing/icons/colors/theme; status/priority treatment) |
| 25 | Tanisha Jain | Employee (intern) | Edge / malformed data (120-char title, 200 tasks, null due, deep subtasks, >100%) |
| 26 | Vandana Boora | Employee | Suggestions / UX (what's missing: bulk, sort, my-vs-all, subtask depth, dependencies) |
| 27 | Shaveta Sharma | HR | **No-access persona** — Tasks hidden/blocked for HR? leaks via home/search/notifications |
| 28 | (boundary) | — | Authz/IDOR (GET /:id no-perm, cross-project task access, closed-write lock, assignee injection, transition bypass) |

## Progress log
- 2026-07-26: Round 3 (Tasks) started. Surface mapped (+ Round-1 task fixes noted). Launching 28 tracing agents in cap-sized waves; live check + adversarial verification to follow.

---
# FINDINGS
Severity: HIGH (broken/leak) · MED · LOW · UI · SUGG. Each CONFIRMED (traced) or PLAUSIBLE.

### #28 boundary — API authz / IDOR
- **MED** **`GET /tasks/:id` + `GET /tasks/:id/subtasks` have NO `@RequirePermission`** (only the object gate `assertTaskAccess`) → a project member who LACKS `task.view` (e.g. HR added to a project, or any role with task.view revoked) is 403'd on the list but can read **full task detail + all subtasks** by id. The Round-1 fix added `task.view` to the LIST only; the single-read + subtask-read still disagree. Cross-project/tenant is NOT leaked (membership still required). Fix: add `@RequirePermission('task.view')` to `get` + `listSubtasks`. CONFIRMED.
- **MED** **closed/completed-project write-lock bypass on ALL FOUR subtask mutations** — `assertTaskWritable` is missing from `createSubtask`/`closeSubtask`/`reopenSubtask`/`softDeleteSubtask` (parent-task writes all have it). You can add/close/reopen/delete subtasks against a closed client matter. Fix: `assertTaskWritable(taskId)` in those four. CONFIRMED.
- **LOW/MED** subtask mutation on a **soft-deleted parent task** allowed — `getSubtaskOfParent` never checks the parent's `deletedAt` (ProjectTask links survive soft-delete); close/reopen/delete a subtask of a tombstoned task. Fix: load parent via `getRaw`. CONFIRMED.
- **LOW** oversight `GET /tasks/:id` existence oracle — a **linkless** task (no ProjectTask row) is readable cross-tenant by oversight (`canAccessTask` returns `links.length===0`→true); nonexistent→404 vs cross-tenant-existing→403 distinction. Data-dependent. PLAUSIBLE.
- **LOW** assignee org-scoping is skipped for a **memberless primary project** (`orgId` from the project anchor is undefined → org filter dropped) → an oversight actor could inject any ACTIVE user regardless of org. Unusual (needs a zero-member project). PLAUSIBLE.
- ✅ VERIFIED STILL HOLDING: list `task.view` gate, `assertTaskWritable` on parent writes, subtask IDOR (parent-id match), org always server-derived, soft-deleted TASK writes 404, assignee injection blocked (non-member behind oversight + org/active validation), transition guards for API-created tasks (workflowId always resolved on create). Residual: a `workflowId==null` task skips BOTH transition guards (legacy/other-path, data-dependent).

### #2 Yash (SA) — workflow transitions + progress↔status coupling
- **HIGH** **null `workflowId` bypasses BOTH the cross-workflow guard AND transition enforcement** (`tasks.service.ts:292,301` — both `if (task.workflowId && …)`). A task with `workflowId===null` can be moved to ANY WorkflowStatus row in the DB (incl. another matter's PROJECT_SPECIFIC workflow), with no edge enforcement. Reachable: legacy rows (create comment says "previously left null"), template tasks when no GLOBAL workflow exists, and `TasksService.create` with no GLOBAL + no chosen status. Kanban `colOf` then parks the mis-statused card in column-0 while `isTaskClosed` says done. CONFIRMED.
- **MED** **reopen cascade force-opens EVERY subtask, clobbering ones closed before the parent closed** (`tasks.service.ts:335-338`) — close records nothing about which it flipped, so reopen can't distinguish cascade-closed from independently-closed → a manually-completed subtask is silently reopened. Data-state loss. CONFIRMED.
- **LOW** first status set (null current status) skips the transition graph (can jump straight to CLOSED even in a modeled Open→InProgress→Done); Open@100% rolls into project progress so a project can read "100% complete" with ZERO closed tasks (design decision, but the % vs "done" meaning diverges; `saveProgress` sets % with no status coupling). Latent: board columns key off `project.workflowId` while task moves validate against `task.workflowId` — aligned only because projects never get a workflowId today.
- ✅ the transition-edge logic itself is correct once both workflowId + currentStatusId are set (zero-transition workflow = any move by design; with edges, allowed iff `(from==current OR from==null)→target`).

### Partial findings salvaged from spend-limited agents (confirmed by main-thread trace)
- **MED** **kanban optimistic-field mismatch** (Basant) — `handleMove` patches only `currentStatus` (`ProjectDetailClient.tsx:138`) but the Task-List `<select>` reads `currentWorkflowStatusId` (`:571`, unpatched) → after a drag the Task-List dropdown snaps back to the old status until the refetch lands. CONFIRMED. (Same class as the Home optimistic-field bug.)
- **LOW** **subtask `_count` includes soft-deleted** (Ketan) — `_count: { select: { subtasks: true } }` (`tasks.service.ts:512,534`) has no `deletedAt` filter, so the subtask badge counts deleted subtasks while the embedded `subtasks:` array filters them out → count vs list disagree. CONFIRMED (Prisma `_count` ignores the relation's where).

### #9 Meetu / #13 Aman / #12 Anant (My Tasks page — main-thread trace, `app/tasks/page.tsx`)
- ✅ VERIFIED GOOD (well-hardened already): `statusCategory` is the **single source of truth for both the filter and the tab counts** (`:25-31`) so badges can't disagree with rows; In-Progress keys on the status NAME containing "progress" (not the %>0 heuristic); Overdue = `isPastDue && !closed` and `isPastDue` is **IST-correct** (Round-1 date fix); proper error state + Retry (`:204-215`); empty state distinguishes `tasks.length===0` from filter-mismatch (`:220-222`); optimistic patch + error toast on status/progress (`:80-110`); the complete-toggle is a REAL workflow toggle (not a decoy).
- **LOW** the list is **uncapped** (`filtered.map`, `:246` — 200 tasks render 200 rows, no pagination; acceptable on a dedicated page w/ its own scroll, unlike a dashboard card); stray whitespace/blank lines inside the count-badge span (`:154-157`, cosmetic).

### #3 Nitin (Manager) — assignee auto-add ⭐
- **HIGH** **assigning a non-member to a confidential-matter task silently enrolls them as an active project MEMBER** — once the actor passes `hasOversight`, `ensureAssigneesAreMembers` creates a live `projectMember` row (`tasks.service.ts:63-67`), flipping `canAccessProject`/`canAccessTask` true for the WHOLE matter (title="{Type} - {Client}" **never redacted**, members, tasks, discussions, Files, timesheets — only the patent *handles* stay gated behind patent.view). No step-up (the portal demands a passcode; task-assign demands nothing), **no membership audit event** (only TASK_ASSIGNED emitted), and the picker shows a flat 28-person roster with **no member/non-member distinction + no warning**. The ProjectAccessService docstring itself calls this "a conflict-wall breach." CONFIRMED.
- **MED** enrollment is **STICKY** — unassigning the person never removes the membership (`setAssignees` never touches `projectMember`) → access granted as a side-effect can't be revoked by reversing it; the enrolled person is **never told they gained a matter** (only a muteable `task.assigned` notice — mute it and there's zero signal). CONFIRMED.
- **LOW** null-org anchor edge (`findFirst` no isActive/orderBy → if null, org clause dropped → cross-org add; practically unreachable); M2M outsider added to non-deterministic `projectIds[0]`; `assignedById` drifts to "last editor" not the delegator. 
- ✅ VERIFIED SOUND: non-oversight assigning a non-member → clear 400; org+ACTIVE+not-deleted validated; assignedById set/cleared correctly; only newly-added ids notified. **The plumbing is right — the defect is governance** (needs an enrollment notice + membership audit event + a UI non-member warning).

### #4 Neha (Sr Consultant) — oversight + M2M rollup
- **KEY FACT** M2M is NOT reachable today — only two paths create a `ProjectTask` (task-create + template), each ONE link; no route adds an existing task to a 2nd project. So **every task is effectively single-project** and the multi-parent leaks below are latent (would go live if links are ever seeded/exposed).
- **MED (latent)** `listForUser` gates task VISIBILITY on membership but the `projectTasks` **include is unfiltered** → a task shared across project A (member) + B (non-member) would leak **B's title + id** on My Tasks (conflict-wall breach) (`tasks.service.ts:195-216`). `get()` similarly returns all links' projectIds. Fix: filter the include to the actor's memberships (or drop the dead M2M surface + enforce single-project). `DeadlineVisibilityService` injected but never used (no redaction pass on task reads).
- **LOW** recompute overwrites a COMPLETED/CLOSED parent's stored progress when a shared task is edited (unconditional `project.update`); GET /tasks/:id no perm gate (dup #28).
- ✅ VERIFIED CORRECT: `recomputeForTask` dedupes + re-averages across ALL parents on close/move/delete (no double-count) — the rollup logic itself is right.

### #6 Amritpal (SRA) — task time / actualHours / 24h cap
- **MED** `timesheets.update()` + `softDelete()` **skip the completed/closed-project write-lock** — `create`/`assign`/`issues.create` all call `assertProjectWritable`, but `update` gates only ownership + 24h cap → the owner can PATCH hours/billable/notes on a task whose project is now CLOSED (and it re-pushes into `Task.actualHours`). Billing-integrity gap on the task path. Fix: `assertProjectWritable` in update+softDelete (`timesheets.service.ts:226-266`). CONFIRMED.
- **LOW-MED** the 24h/day cap is **TOCTOU** (aggregate-then-write, no tx/lock) → two concurrent task logs (20h+20h) both pass → 40h/day; same in `issues.create`. PLAUSIBLE (needs a race).
- ✅ VERIFIED CORRECT: `actualHours` fully derived (`SUM WHERE taskId, deletedAt:null`), decreases correctly on delete (deletedAt set before recompute); 24h cap enforced on create + update-when-hours-change (date normalized, no time-component bypass — prior fix holds); issue non-billable time (taskId:null) never rolls into a Task's actualHours (clean task-XOR-issue separation).

### #5 Ketan (SRA) — subtask integrity
- **HIGH** **new subtask on a CLOSED/completed parent → OPEN-child-under-CLOSED-parent inconsistency** — `createSubtask` never checks the parent's workflow status; the Subtasks-tab input is NOT gated by `closed` (unlike the progress slider) → add subtasks to a 100%/CLOSED task; the bar reads 3/4 while the parent shows Complete. The known `assertTaskWritable` gap does NOT fix this (that keys on PROJECT phase, not the task's own CLOSED status). CONFIRMED.
- **MED-HIGH** **parent→child cascade is destructive** — close then reopen a task with subtasks [A=done, B=open] → both come back OPEN (reopen does a blind `updateMany status:'OPEN'` for ALL); per-subtask done state silently lost. CONFIRMED.
- **MED** closing subtasks **never rolls up to the parent** (one-way only; `recomputeProjectProgress` ignores subtasks) → complete every subtask, parent % + project progress unchanged (bar 100% while task shows 20%); `SUBTASK_CLOSED` event defined but **never emitted** + no reopen/delete event → subtask lifecycle has **zero audit trail** (compliance gap). CONFIRMED.
- **LOW-MED** createSubtask assignee validation is **bypassed for a link-less task** (`ensureAssigneesAreMembers` early-returns when projectIds empty; oversight grants access to link-less tasks) → arbitrary/cross-org user IDs attachable as SubtaskAssignee (edge); no notify to subtask assignees.
- **LOW** `_count.subtasks` includes soft-deleted (dup) but currently **has no consumer** (latent). ✅ cross-parent subtask IDOR properly rejected (parent-match 404 + assertTaskAccess).

### #16 Divyanshu (Employee) — links/nav
- **MED** **My Tasks rows can't open a task** — the title is an inert `<span>` (`app/tasks/page.tsx:263`), TaskDetailPanel is rendered ONLY inside ProjectDetailClient; from the primary task list you can't see description/subtasks/comments/activity (only toggle + inline status/progress). Same task IS clickable inside the project → inconsistent affordance. CONFIRMED.
- **MED** **no `/tasks/[id]` route** — a task can't be deep-linked/shared/bookmarked; the panel is pure client state; even notifications can only point at `/projects/:id`. Browser **Back while the panel is open exits the project** (no popstate integration) instead of closing the panel. CONFIRMED.
- **LOW** refresh loses the open task + active tab (both useState); project chip lands on the default tab with no trace of which task; "Add in Project" CTA dumps you at the projects LIST not a task-create; chip only links `projectTasks[0]`; a chip can 403 if you were removed from the project but keep the assignment (graceful error page). CONFIRMED.
- **Verdict:** no task-level routing at all — nothing is a crash/data-loss, every issue is a missing/one-way link or lost-on-refresh state.

### #7 Basant (SRA) — kanban drag-and-drop
- **HIGH** **optimistic move has NO snapshot/rollback** — `handleMove` does `setQueryData` with no `onMutate` snapshot and no `catch` restore (only an error toast); recovery relies entirely on the `finally` refetch. If setStatus AND the refetch both fail (offline), React Query keeps the optimistic value → the card **stays visually moved while an error toast fired** (phantom success) (`ProjectDetailClient.tsx:136-147`). CONFIRMED.
- **MED** no `cancelQueries` before the optimistic write → an in-flight background refetch (from focus/prior invalidate) can clobber the move and snap the card back, then `invalidateTasks` re-corrects → visible flip-flop; **kanban is non-interactive on touch** (native HTML5 DnD, no polyfill) AND the phone fallbacks are hidden — kanban cards have no inline status control, the Task-List inline `<select>` is `hidden sm:block`, so on a phone the only status path is the undiscoverable detail-panel pill (or the open/closed checkbox, can't reach intermediate statuses). CONFIRMED.
- **LOW** the no-op guard uses id-equality but `colOf` also places by NAME → dropping a renamed/foreign-status card back on its own column still fires a redundant setStatus; no in-flight lock on `handleMove` (rapid drops → overlapping calls, self-heals). PLAUSIBLE.
- ✅ VERIFIED SAFE: drag-into-fallback impossible (`ready` gates draggable + onDragStart + onDragOver preventDefault + handleDrop re-check).

### #25 Tanisha (edge/malformed data)
- **MED** **`UpdateTaskDto.title` can be blanked/whitespaced** via PATCH — has `@MaxLength(200)` but NO `@MinLength`/trim (unlike CreateTaskDto) → `{title:""}` stored → empty `<h2>`/table cell/kanban card/a11y label. **Workflow status name has NO `@MaxLength`** → a 40-char name breaks every inline pill `<select>` (balloons the Status column → horizontal scroll), the panel header pill, and the `w-48` status menu. CONFIRMED.
- **LOW** subtask title not trimmed server-side; no absolute bounds on start/due dates (year-9999 accepted, feeds capacity/overdue); AddTaskModal est-hours has no client `max` (panel has 1000); long unbroken titles overflow all 3 surfaces (no truncate/break-words — table→h-scroll, kanban clips, panel overflows 480px); completion >100 clamped only by `overflow-hidden` (labels show "150%"); a null % would render "null%" + mangle `progressOptions`; multi-KB no-space description overflows the panel; uncapped render (200 status-less tasks pile into column-0).
- ✅ VERIFIED HANDLED: absent data is well-defended everywhere (null-coalescing: no-status→catch-all/`?? 'Open'`, no-assignee→"Unassigned", no-due→"—", null-priority→gray/LOW, est-hours negative/huge gated by server). Weakness is *oversized/blank*, not *absent*.

## ROUND 3 (Tasks) — 28/28 tracing agents COMPLETE (2026-07-27)
Live browser check earlier this session (Super Admin login, app renders on wiped DB). Overall severity notably LOWER than Rounds 1–2 (Tasks was hardened in Round-1's P0 batch) — most findings are consistency/UX, but several real HIGH/MED integrity + governance gaps remain.

### ⭐ Convergent themes / fix priority (confirmed, root-cause)
**P0 (integrity / governance / confidentiality):**
1. **Silent confidential-project enrollment** (Nitin) — assigning a non-member to a task auto-adds them as a project MEMBER (full matter access) with no notice / no membership audit event, and it's sticky (unassign doesn't revoke). Fix: emit a membership event, notify the enrolled person "added to project X", + a UI non-member warning; consider requiring an explicit add for confidential matters.
2. **Null-workflowId bypasses both transition guards** (Yash) — a task with null workflowId is moveable to ANY status with no edge enforcement. Fix: guard on the status's workflow membership even when `task.workflowId` is null (or backfill workflowId on every task).
3. **Subtask closed/writable + coherence** (Ketan, boundary, Yash) — `assertTaskWritable` missing on all 4 subtask mutations; OPEN subtask addable under a CLOSED parent; reopen destroys independently-closed subtask state; no subtask audit events. Fix: gate the 4 subtask writes + guard parent-status on create + record which subtasks the cascade flipped (or don't blind-reopen).
4. **`timesheets.update()`/`softDelete()` skip the closed-project write-lock** (Amritpal) — task hours mutable after a matter closes. Fix: `assertProjectWritable` in both.
5. **Ungated detail reads** (boundary, Khushi, Neha, Vijay, Shaveta) — `GET /tasks/:id` + `:id/subtasks` have no `@RequirePermission('task.view')` → an HR-as-member reads task detail despite zero task perms. Fix: add the decorator to both.

**P1 (broken/silent-failure UX):**
6. Panel **on-blur-edit-then-close re-opens the panel** (Mohit) — extend the mount/identity guard to all `onUpdated` callers.
7. **Panel has zero `can()` gates** (Khushi) — Delete + Assignee controls 403 for roles that lack them; gate them; also make the closed-project lock visible (panel is blind to project phase).
8. **Silent-failure queries** (Aman) — Comments/Subtasks/statuses ignore `isError` (masquerade as empty / degrade the board); add `isError` branches (Activity tab is the correct model).
9. **Optimistic move has no rollback + patches wrong field** (Basant, Ronak, Aman) — snapshot+restore in `handleMove`'s catch; also patch `currentWorkflowStatusId` (not just `currentStatus`).
10. **Client(IST) vs server(UTC) overdue** (Drishti) — align the overdue-alerter + capacity flag to IST.
11. Double-submit guards (subtask-add dupes, delete double-click 404, create/comment held-Enter) (Ronak); DTO `@MinLength`/trim on UpdateTaskDto.title + `@MaxLength` on workflow status name (Tanisha).

**P2 (perf/consistency/a11y/polish/product):** base64 photos in the task payload + narrow the 6-key invalidation (Poorvi — biggest perf win); shared `PRIORITY_META`/`<StatusPill>`/`<CompleteToggle>`/`<ProgressBar>` (Ragini/Sugandh — 4 disagreeing priority maps, flat bars ignore `progressColor`); kanban title clamp + `colorHex+'22'` contrast + portal the fixed panel (Geetesh); a11y (keyboard-inaccessible editors, no focus trap, `text-gray-300/400`) (Ankit); copy drift (4 "add task" labels, en-US timestamps, ALL-CAPS priority filter) (Rajesh); `_count.subtasks` deleted-inclusive (Drishti); AddTaskModal `grid-cols-1 sm:grid-cols-2` (Arjun); scroll affordances; empty-state polish (Anant).

**Product decisions (flagged, behavior UNCHANGED):** no `/tasks/[id]` route → tasks aren't deep-linkable/shareable + My Tasks rows can't open a task (Divyanshu/Vandana); Tasks is delivery-only so BD gets a dead surface + a phantom `task.create` (Ritik); assignee pickers list the whole org not project members (Ajay/Nitin); status-change rides `task.update` with no `task.transition` perm (Khushi); the M2M task→project include leaks (latent — no 2nd-link path today) (Neha/Vijay); feature suggestions (dependencies, recurrence, deep-link, comment @mentions, bulk, sort) (Vandana).

### #27 Shaveta (HR no-access)
- ✅ **HR WALL OTHERWISE SOLID**: sidebar + home quick-link hide /tasks (task.view); direct /tasks URL 403s gracefully (no crash/leak); MyTasksCard + QuickStatsCard self-gate to null; global search gates the tasks category → `[]`; notifications only to assignees. CONFIRMED clean.
- **MED** the two ungated detail reads (`GET /tasks/:id` + `:id/subtasks`) let an HR-as-project-member read full task+subtask detail (read-only — mutations stay gated) despite zero task perms — membership silently substitutes for the missing task.view (dup #28/#8/#10; the service docstring even assumes "the decorator still gates," but it's absent on exactly these two reads).
- **LOW/SUGG** /tasks page has no client-side gate (HR briefly sees chrome before the error); the 403 is shown as **"Couldn't load your tasks / check your connection" + Retry** — a permission denial misrepresented as a connectivity error (Retry always re-fails). Consider a distinct "no access" state.

### #11 Ajay (AddTaskModal) & #22 Ritik (BD non-delivery)
- **Ajay MED** assignee picker lists **ALL org users, not project members** → a Consultant mis-pick 400s post-submit ("ask a manager"), an oversight actor's pick **silently auto-adds them as a project MEMBER** (dup Nitin — task-create becomes an unscoped membership grant); all beyond-required validation is **server-only** (no client date-order/`maxLength`/`max` → raw 400 banner); create with null status possible (transition-bypass, low trigger); capacity prefill applies+editable but BUSY/LEAVE_PENDING days are still clickable (contradicts "free window"); no success toast + thin double-submit guard.
- **Ritik MED** Tasks is a **delivery-only surface, permanently EMPTY for BD** (My Tasks membership-scoped → always `[]`); the empty state's only CTA is "Add in Project"→/projects (delivery); `task.create` is a **phantom permission** for BD (every task must live in a project+task-list, no standalone/personal task concept); BD can be handed technical delivery tasks via the unscoped picker with no guardrail. **LOW** sidebar shows "My Tasks" to BD (has task.view) → nav to a dead page; in-project "Add Task" not gated on `task.create`.

### #8 Khushi (permission matrix)
- Full role×action table captured: `task.view/create/update` = all except HR; `task.assign` adds from SRA up (NOT Employee); `task.delete` = Manager/SrConsultant/Admin/SA only.
- **HIGH** the **TaskDetailPanel has ZERO `can()` gates** (no `usePermissions` import) → the **Delete** button shows to everyone (Consultant/SRA/Employee/HR lack `task.delete` → 403 on click); the **Assignees add/remove editor** shows to Employees who lack `task.assign` → 403 on save. CONFIRMED.
- **MED** `GET /tasks/:id` + `GET /tasks/:id/subtasks` have **no RBAC gate** (only assertTaskAccess) → punches a hole in the HR/task.view wall — HR (the only role without task.view) can read a task + subtasks if they hold a ProjectMember row (dup #28/#10; blast radius small). **LOW** status-change rides `task.update` (no `task.transition` perm) so any editor incl. Employee can drive workflow → CLOSED/reopen.
- ✅ VERIFIED: non-member `task.update` holders ARE blocked by assertTaskAccess (conflict-wall holds — task.update ≠ org-wide mutation); HR fully walled on all RBAC-gated endpoints (My Tasks 403s); capacity reassign/extend gates correct. **Fix: gate the panel's Delete + Assignee controls on can(); add task.view to get + listSubtasks.**

### #23 Ronak (interaction/feedback)
- **MED** kanban + My Tasks moves have **no snapshot/rollback** (patch-then-refetch; card stuck on double-failure — dup Basant/Aman); **subtask add double-fires → duplicate subtasks** (no in-flight guard, clears after await, `onKeyDown` on every Enter); **delete has no re-entry guard + no success toast** (double-click → 404 spurious "Action failed" on a delete that worked); create-task + postComment can double-submit via held-Enter (only the disabled attr guards, no `if(loading)return`). CONFIRMED/PLAUSIBLE.
- **LOW** subtask toggle non-optimistic (feels dead until refetch) + stale-read race; footer buttons never disable during in-flight; "Save & close" early-returns if a save is mid-flight (edit NOT lost — drained post-unmount — but late failure toasts after the panel is gone); assignee failure toast not scoped to the visible task.
- ✅ no-op guards solid across status/progress/title/desc/est-hours; the assignee coalescing/drain (single in-flight + queued dirty + mount-guarded) is genuinely well-built. **Fix: rollback snapshot on moves + re-entry guards on subtask-add/delete/create/comment.**

### #17 Drishti (data correctness)
- **MED** **client "overdue" is IST but server alerts + capacity board are UTC-day** — the panel/list use `isPastDue` (IST calendar day) but the overdue-alerter + capacity flag use `startOfUtcDay`; so for the ~5.5h window 00:00–05:30 IST a task shows red "(overdue)" + lands in the Overdue tab count while the capacity flag + overdue email are silent (the org runs IST; the server half is structurally 5.5h late). CONFIRMED. (Client half is the Round-1 fix; this is the server half disagreeing.)
- **LOW** progress *display* unclamped (bar width/label render raw % — >100 seed data shows "150%", writes are clamped); est-hours chip hidden at 0 + rendered raw (bypasses `fmtHours`); actualHours never surfaced on the panel (fetched, unused); panel slider step-5 vs list dropdown quartiles (different granularity for one field); `_count.subtasks` deleted-inclusive (latent — projects service filters it, tasks is the odd one out).
- ✅ VERIFIED CORRECT: % clamped both sides (slider + DTO `@Min0@Max100`); rollup `Math.round(avg)` bounded 0–100; panel due-date UTC-drift-free; `progressOptions` always includes current+0/100 (no select desync); panel subtask count is deleted-EXCLUDED (from the live listSubtasks query, not `_count`).

### #18 Geetesh (UI/CSS-conflict)
- **MED** kanban long titles have **no clamp/break-words** inside the `overflow-hidden` column → an unbreakable token is hard-clipped mid-word (no ellipsis), a long multi-word title grows the card unbounded (Task List truncates — board is the inconsistent one; `KanbanBoard.tsx:124`). CONFIRMED.
- **MED** the inline status `<select>` tint `colorHex+'22'` (13% bg) with **text = same hex at 100%** fails contrast on light/pastel admin-configurable statuses (the panel header avoids it with gray-100+dot; 3 call sites). Fix: fixed dark text or luminance-picked. CONFIRMED.
- **MED (latent, high blast radius)** the `fixed` panel is clean TODAY but sits under TWO `overflow-hidden` ancestors (AppShell + ProjectDetailClient) → a future `transform`/`will-change` on either would CLIP it (not just shift) + collapse the z-40/z-50 overlay. Fix: **portal the panel+overlay to `document.body`**. **LOW** Avatar display-override clean today (wrapper-div pattern) but unguarded; AddTaskModal `grid-cols-2` can force a horizontal scrollbar in the modal body at ~320px.

### #12 Anant (empty states), #24 Sugandh (visual polish), #14 Arjun (responsive)
- **Anant:** ✅ fallback kanban column NAMES match the seeded statuses (wipe keeps workflows/statuses) + zero-data is NaN/crash-safe (DB defaults + guarded math). **MED** Board tab has no loading state (flashes empty; Task List has one). **LOW/UI** fallback column COLORS don't match real statuses (dots flash wrong then flip; "In Progress" fallback is red-orange = reads as error); Subtasks tab is the one panel tab missing empty text; assignee search shows `No people match ""` on empty list; board "Add task" buttons not gated on task-list availability (silent no-op edge).
- **Sugandh:** **UI** three divergent priority maps (dup Ragini) + **`accent` #fe841f used 0×** (HIGH reaches for generic orange); title editor uses generic `blue-300` not `brand-300` (desc editor beside it is correct); **task progress bars are flat `bg-brand-500`** ignoring the app-wide `progressColor()` red→green health scale (ProjectCard/home use it) — bars convey zero health signal; status pill 3 ways (dup); AddTaskModal focus-ring only on text inputs not the selects/dates; brand-500 vs brand-600 bar shade; focus-ring alpha /20 vs /30 vs /40. **Fix: shared `PRIORITY_META`/`<StatusPill>` + adopt `progressColor()` for task bars.**
- **Arjun:** ✅ genuinely responsive-hardened — table/kanban/both tab rows/panel each own an internal scroller + shell `overflow-x-hidden`, so NO horizontal body scroll + no unreachable control at 360–390px/tablet. **UI/MED** AddTaskModal date/field rows are hard `grid-cols-2` (no `sm:` collapse) → native date inputs squeeze on phones, and it contradicts the panel's own `grid-cols-1 sm:grid-cols-2`. **LOW** the 2 scroll-only tab rows work but lack a scroll affordance.

### #13 Aman (loading/error)
- **HIGH** panel **Comments + Subtasks queries fail SILENTLY as "empty"** (no isError/isLoading) — the Activity tab 3 lines away does it right; a 403/500 on comments → "Be the first to comment" → duplicate re-post; the shared **workflow-statuses query failure silently degrades the whole board** (fallback columns that aren't the real workflow, drag disabled, wrong counts look authoritative) + makes "Mark Complete" toast a misleading "No closed status configured". CONFIRMED.
- **MED** failed drag-move: error toasted but **card NOT rolled back** (dup Basant); Board has no loading skeleton (Task List does); AddTaskModal swallows a statuses-fetch failure → status-less task created silently.
- ✅ panel mutations are well-covered (all try/catch→toast + optimistic revert); AddTaskModal create path good (inline error + spinner + disable). **Fix: consume isError on statuses/subtasks/comments; explicit rollback in handleMove.**

### #19 Poorvi (render/perf)
- **HIGH** **`taskInclude` ships inline base64 profile photos (≤900KB each), duplicated across every task + every assignee** (`tasks.service.ts:500,502`) — a 25-task list with photo'd assignees = tens of MB of mostly-duplicated base64, re-downloaded on every drag + every per-field panel edit. Biggest payload cost. Fix: photo URLs, not embedded blobs.
- **HIGH** every per-field panel edit (title/desc/status/progress/plan) → `onUpdated`→`invalidateTasks` fires the **full 6-key storm** re-pulling the heavy board; **MED** `invalidateTasks` over-invalidates 6 keys incl. global `['tasks']`(all projects)/`['analytics-dashboard']`/`['activity']` (immediate blast bounded to mounted observers, but breadth wrong + guarantees stale Home); `savePlan` double-invalidates `['tasks']` + always `['capacity']` even for priority; `listForUser` over-fetches subtasks+`_count` the list never renders. CONFIRMED.
- **LOW** My Tasks filtered+counts unmemoized (recompute per keystroke); KanbanBoard O(cols²×tasks) unmemoized (saved from churn by a state-equality bailout). **Fix: photo URLs + narrow invalidation to `['tasks',projectId]`+`['project',projectId]` first.**

### #15 Ankit (accessibility)
- **HIGH** inline **title + description editors are keyboard-unreachable** (bare `<h2 onClick>`/`<div onClick>`, no tabIndex/role/onKeyDown); **kanban card MOVE has no keyboard path** (native DnD, grip `opacity-0`; only path = focus card→Enter→status menu, and no inline `<select>` fallback on the board); **dialogs claim `aria-modal` but have NO focus trap + NO focus return** (Tab escapes, focus dropped to body on close — no trap utility exists anywhere). CONFIRMED.
- **MED** status `role=menu` missing arrow-roving/first-item-focus/outside-click-dismiss + Escape closes the whole panel not the menu; form labels not associated (`htmlFor`); subtask/comment inputs placeholder-only; tablist incomplete (no `aria-controls`/`tabpanel`); the mark-complete circle is `text-gray-300` ≈1.6:1 (fails 3:1).
- **LOW** pervasive `text-gray-400` ≈2.5:1 fails AA; panel doesn't lock background scroll. ✅ priority is NOT color-only (Flag+text — genuine pass); dialog/tab/expanded roles + most icon labels present.

### #10 Vijay (Consultant) — detail as member
- **MED** the panel is **blind to the project's closed phase** — `closed` is derived only from the task's own status, so on a COMPLETED/CLOSED matter every edit control (title/desc/plan/status/assignees/complete/delete) stays live and 403s on click (generic error toast). Also **not permission-aware** — Delete always renders (a Consultant/Employee lacks `task.delete` → 403), the full assignee editor renders for an Employee lacking `task.assign`. CONFIRMED (gating/UX, not a leak).
- **MED (latent)** cross-matter exposure on a multi-project task — `canAccessTask` grants via ANY linked project + unfiltered `projectTasks` include returns other matters' id/title/staff on the wire (`listForUser` leaks the other matter's NAME to Home). Latent (no 2nd-link path today; dup Neha).
- ✅ CLEAN on member-visible fields: assignee rows carry no email (only id/name/photo); panel never shows project name or actualHours; Comments + Activity gated by assertEntityAccess/assertTaskAccess.

### #21 Rajesh (copy/text)
- **UI** priority filter shows RAW ALL-CAPS enum (`CRITICAL/HIGH/…`) while every other surface is Title Case (`page.tsx:170`); the Round-1 **four-way "add task" label drift persists** ("Add in Project"/"Add task"/"New Task"/"Create Task"); "Add in Project" is ungrammatical + mislabels (it navigates, doesn't add). CONFIRMED.
- **UI/LOW** overdue suffix "(overdue)" vs "· overdue"; header "Due" vs "Deadline" everywhere else; footer "Mark Complete" (Title) next to "Save & close" (sentence); "Est. Hours" vs "Estimated Hours"; ellipsis "…" vs "..." mixed; **two en-US timestamps** in an otherwise en-IN app (`toLocaleString('en-US')` — `formatTimeIST` already exists); off-domain placeholder "e.g. Implement login page" for a patent KPO.
- ✅ no pluralization bugs; empty/error copy reads well (curly apostrophes).

### #20 Ragini (consistency)
- **UI** Round-1 priority-map divergence STILL live + now **FOUR task maps** disagree — CRITICAL red-600 vs kanban red-500; HIGH orange-600(MyTasks) vs orange-500; MEDIUM amber-600 vs project-list amber-500; only LOW agrees. Priority also switches form (filled pill in MyTasks vs Flag icon in 3 others). A 5th map (project priority, HIGH=blue) is a unify-trap. CONFIRMED.
- **UI** status pill tinted-`colorHex+22` in lists vs flat gray-100+dot in the panel; complete-toggle is Circle vs square-checkbox vs labeled-button across 3 surfaces; progress is bar+select vs slider vs %-text vs ABSENT (project list shows none); AvatarStack size/max/empty drift + subtasks hand-roll `userInitials()` instead of `<Avatar>`; status change toasts success on the board but is silent on My Tasks; delete uses native `window.confirm`. 
- **Fix:** shared `PRIORITY_META`/`<StatusPill>`/`<CompleteToggle>`/`<ProgressBar>` in `lib/tasks.ts`. All UI/LOW.

### #1 Mohit (SA) — TaskDetailPanel teardown
- **HIGH** **closing the panel right after an on-blur edit RE-OPENS it** — `flushAssignees` is the ONLY save path guarded by `mountedRef`/`currentTaskId`; `saveTitle`/`saveDesc`/`saveProgress`/`savePlan`/`changeStatus` call `onUpdated(updated)` after `await` with NO mount check → parent `setSelectedTask(updated)` re-opens the panel the user just closed. Repro: edit title → click X → panel pops back. Fix: extend the mount/identity guard to every `onUpdated` caller (`TaskDetailPanel.tsx:230-303`). CONFIRMED.
- **MED** per-field date autosave + server order-check makes shifting a task's window **later** fail (editing Start first sends new start vs old earlier due → 400; must edit deadline first); error-rollback snaps the form to a **stale `task` prop** (same-id → `useEffect` never re-syncs, a late failed save reverts to neither the edit nor newest state); status dropdown has **no outside-click dismiss** (clicking a tab leaves it floating). CONFIRMED/PLAUSIBLE.
- **LOW** `savePlan` fires an uncoalesced PUT per field (4 quick edits → 4 overlapping updates, out-of-order possible; unlike the coalesced assignee path); keyboard progress save may persist the pre-keystroke value + one PUT per arrow (storm on key-hold); native `window.confirm` for delete; "Save & close" only flushes assignees not title/desc.
- **SUGG** the z-30 status-menu vs z-10 tab-bar layering is correct TODAY but fragile — any `transform`/`opacity<1`/`filter` on the header/body wrapper would spawn a stacking context and resurrect the "menu behind tabs" bug (add a guard-comment); subtask toggle is non-optimistic (round-trip + refetch, visible lag).

---

## ✅ FIXES APPLIED (2026-07-27) — root-cause, typecheck-clean (API + web `tsc --noEmit` both pass)

### P0 — integrity / governance
1. **Silent confidential-project enrolment** (Nitin) — `tasks.service.ts ensureAssigneesAreMembers` now, when it auto-adds an outsider as a project MEMBER, emits a `project.member_added` audit event and notifies the enrolled person ("added to project X because you were assigned work"). New canonical event `PROJECT_MEMBER_ADDED`. Fires only when someone is actually added; notify/emit are best-effort (won't fail the assignment). *(The whole-org assignee picker + "require explicit add for confidential matters" remain FLAGGED product decisions.)*
2. **Null-workflowId transition bypass** (Yash) — `setStatus` now computes `effectiveWorkflowId = task.workflowId ?? status.workflowId`, enforces the cross-workflow + transition-graph guards against it, and **backfills** the task's `workflowId` on the move, so a legacy null-workflow task can no longer jump to any status unchecked, and every subsequent move is edge-enforced.
3. **Subtask coherence** (Ketan, boundary, Yash) — `assertTaskWritable(parent)` added to all four subtask writes; `createSubtask` blocks when the parent task is CLOSED; `getSubtaskOfParent` rejects a soft-deleted parent; close/reopen/delete now emit audit events (`subtask.closed/reopened/deleted`). The **destructive blind-reopen cascade is removed** — closing a task closes only still-open subtasks; reopening a task no longer resurrects independently-completed subtasks.
4. **Timesheets skip the closed-project write-lock** (Amritpal) — `update()` and `softDelete()` now call `assertProjectWritable(entry.projectId)` (matches `create()`); a closed matter's ledger is frozen. Buffer entries (no project) are correctly skipped.
5. **Ungated detail reads** (boundary/Khushi/Neha/Vijay/Shaveta) — `GET /tasks/:id` and `GET /tasks/:id/subtasks` now carry `@RequirePermission('task.view')`, closing the HR-as-member read hole.

### P1 — silent-failure / UX breakers
6. **On-blur-edit-then-close re-opens the panel** (Mohit) — new `emitUpdated(taskId, updated)` guards **every** `onUpdated` caller (title/desc/status/progress/plan) with `mountedRef` + `currentTaskId`, so a save returning after the panel closed/switched no longer re-opens it.
7. **Panel had zero permission gates** (Khushi/Vijay) — Delete renders only with `task.delete`; the assignee add/remove editor only with `task.assign`. A new `projectClosed` prop drives a `readOnly` state that disables title/desc/status/progress/plan/subtask/complete/delete on a COMPLETED/CLOSED matter, with an amber "read-only" banner (panel is no longer blind to project phase → no more generic 403 toasts).
8. **Silent-failure queries** (Aman) — Comments, Subtasks, and workflow-statuses queries now surface `isError`/`isLoading`: a failed load shows an error + Retry (not the empty state), and `toggleComplete` no longer misreports a statuses-load failure as "no closed status configured".
9. **Optimistic move: no rollback + wrong field** (Basant/Ronak/Aman) — `handleMove` now snapshots the cache, patches **both** `currentStatus` and `currentWorkflowStatusId` (the Task List `<select>` no longer snaps back), invalidates only on success, and restores the snapshot on failure.
10. **Client(IST) vs server(UTC) overdue** (Drishti) — new `startOfIstDay()` helper; the overdue-alerter and capacity board now derive "today" from the IST calendar day (matching the client's `isPastDue`), closing the ~5.5h 00:00–05:30 IST disagreement. Stored-date normalisation still uses `startOfUtcDay` (unchanged).
11. **Double-submit + DTO validation** (Ronak/Tanisha) — in-flight guards on subtask-add, delete, and comment-post (held-Enter/double-click no longer duplicate or 404); `UpdateTaskDto.title` gets trim + `@MinLength(1)` (no blanking a title via PATCH); workflow status `name` gets trim + `@MaxLength(32)` (no pill-breaking names), workflow name `@MaxLength(60)`.

### P2 — cheap wins taken
- Two `en-US` timestamps in the panel (comments + activity) replaced with a shared `formatDateTimeIST` (en-IN/IST) — the rest is the app's convention.
- Subtasks tab now has an empty-state line ("No subtasks yet…") it was missing.

### FLAGGED — deliberately NOT changed (product/design decisions or larger refactors)
- No `/tasks/[id]` deep-link route; Tasks is delivery-only (BD dead surface + phantom `task.create`); assignee pickers list the whole org not project members; status-change rides `task.update` (no `task.transition` perm); latent M2M task→project include leak (no 2nd-link path today); feature suggestions (dependencies, recurrence, deep-link, @mentions, bulk, sort).
- P2 shared-component refactor (`PRIORITY_META`/`<StatusPill>`/`<CompleteToggle>`/`<ProgressBar>` + adopt `progressColor()` for task bars), base64-photo → URL payload change, and the broad `invalidateTasks` 6-key narrowing — larger refactors, flagged for a dedicated pass.
- Prisma schema↔DB `@@unique` PARTIAL drift (from Round 2) still pending.
