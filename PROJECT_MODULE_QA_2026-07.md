# Project/Task Module — QA findings (5-agent sweep, 2026-07-22)

Deduped & prioritized. ✅ = fixed, ⏳ = pending, 🚩 = design decision (not silently changed).

## The two reported bugs
- **[R1] Assign fails: "you can only assign people who are members of the project"** — picker lists all org users; API requires active `ProjectMember`; a fresh project has only 1–2 members. Same wall breaks the Capacity board's "assign to a free person". → auto-add the assignee as a member on assign (guarded), + scope/annotate the picker.
- **[R2] Tasks disappear** — (a) `KanbanBoard` drops any task whose status matches no column (no catch-all) — vanishes while `statuses` load (uses FALLBACK cols); (b) tasks query missing `placeholderData: keepPreviousData` → empty flash on project switch. (Proven NOT caused by closing the panel.)

## Security / authz
- **[S1][HIGH] IDOR** `GET /tasks/:id/subtasks` has no access check — any user reads any task's subtasks. (only route missing the guard)
- **[S2][MED-HIGH] clientId leak** — `get()` strips top-level client but `patents[].patent.clientId` still ships; `patent.view` is held by all → client redaction bypassed. (introduced this session)
- **[S3][MED] Cross-tenant read** `GET /projects?organizationId=` trusts client org for oversight actors instead of the session.
- **[S4][LOW] `DELETE /projects/:id`** skips `assertProjectAccess` its siblings have.

## Data integrity
- **[D1][MED] removeMember orphans assignments** — hard-deletes membership, never clears `TaskAssignee`; stale non-member then 400s every future assignee edit on those tasks. Also inconsistent with soft-delete-style addMember.
- **[D2][MED] Reopen task leaves subtasks closed** — reopening a completed task doesn't reopen its subtasks → subtask bar 100% while task 0%/Open.
- **[D3][MED] Delete task list collides sequence / orphans tasks** — moves tasks to General without renumbering; writes `taskListId=null` when no default; create-sequence counts soft-deleted rows.
- **[D4][LOW-MED] Multi-client patents** → `derivedClientId=null` silently (client-less matter). (this session)
- **[D5][LOW] Membership check ignores user status** — deactivated user with lingering membership stays assignable.
- **[D6][LOW] assignedById overwritten** on every assignee edit.

## Task-list / UI
- **[U1][HIGH] Template tasks shown under "General"** — detail page renders one list with ALL tasks; the auto-created type list (e.g. "HML Workflow") is invisible; no add/rename/delete-list UI. → at least group tasks by their list.
- **[U2][LOW] Optimistic status move snaps back** — patch omits `currentWorkflowStatusId`/`completionPercentage`.
- 🚩[U3] Task reordering not implemented (feature gap; `sequence` written, never read).

## Project detail / lifecycle
- **[P1][MED] PID not on the projects list / unsearchable** — `list()` omits `code`; cards/search don't use it.
- **[P2][MED] Edit-project phase dropdown** exposes ARCHIVED/CANCELLED + bypasses lifecycle guards (ARCHIVED without deletedAt).
- **[P3][LOW] create() returns incomplete/unredacted object** (clientId raw). → return get().
- **[P4][LOW] removeMember hard vs addMember soft** mismatch; stale comment.
- **[P5][LOW] misleading comments** claiming patents are Super-Admin-gated (patent.view is in VIEW_BASICS = everyone).
- 🚩[P6] Employee "project request → nominate manager" ceremony is dead (project goes live ACTIVE, employee can't manage it, manager never notified) — product decision.

## Validation / cosmetic
- **[V1][LOW] Title/description validation** — whitespace-only title, empty on update, unbounded description.
- **[V2][LOW] misleading flush-on-unmount comment** in TaskDetailPanel.
