# Projects / Tasks / Global UX — Bug Inventory & Fix Tracker

Consolidated from a 4-agent deep audit (2026-07). ⭐ = explicitly reported by the user.
Severity: **P0** breaks feature · **P1** major · **P2** polish. Status: ☐ todo · ☑ done.

---

## 1. Global UX (cross-cutting)

- ☑ ⭐ **G1 (P1)** Notifications panel hidden under content. Root: rendered inside `<aside>` whose `transform` (drawer slide) makes it the containing block + `overflow` clips it. Fix: portal to `<body>` (`components/ui/Portal.tsx`).
- ☑ ⭐ **G2 (P1)** Bottom-left profile menu (logout) invisible on desktop — same transform/overflow trap; `lg:left-64` sat past the clipped sidebar. Fix: portal + sidebar-aware left offset.
- ☐ ⭐ **G3 (P1)** Date fields only open the picker on the calendar icon. 11 `type="date"` + 4 `type="time"` inputs, all native. Fix: shared `DateField` calling `showPicker()` on full-field click; swap everywhere.
- ☐ ⭐ **G4 (P2)** Composers: Enter should send, Shift+Enter newline. Only `DiscussionsTab` is actually wrong (Ctrl+Enter). Fix: shared `submitOnEnter()` (IME-safe); apply to discussions + standardize.
- ☐ **G5 (P2)** No shared `AvatarStack` (needed by tasks/issues/etc.) — build one (`+N` overflow).

## 2. Tasks ⭐

- ☐ ⭐ **T1 (P1)** No assignee avatars in My-Tasks table (`app/tasks/page.tsx` computes `assignees` but never renders; no column). Kanban/list show only `assignees[0]`.
- ☐ ⭐ **T2 (P2)** No "3-4 avatars + +N" overflow anywhere → use `AvatarStack`.
- ☐ ⭐ **T3 (P2)** Stray tick: `TaskDetailPanel.tsx:569` `{isClosed ? 'Completed ✓' : …}` — remove the `✓`.
- ☐ ⭐ **T4 (P1)** Status/progress only changeable on Kanban. Add inline status dropdown + progress control to My-Tasks rows and project Task-List rows (backend supports `completionPercentage`).
- ☐ ⭐ **T5 (P1)** Assignees are a flat checkbox list of ALL org users inside Details. Add an **Assignees tab** (after Details/Subtasks/Comments/Activity) with search + removable avatar chips.
- ☐ ⭐ **T6 (P1)** Add-assignee fires a full network PUT per checkbox click (flicker, serialized). Stage locally + save once / optimistic.
- ☐ **T7 (P2)** Backend assignee projection omits `profilePhoto` (`tasks.service.ts:333,352`) → photos never show. Add it.
- ☐ **T8 (P2)** `ApiTask.assignees` type mismatch (`api.ts:89`) vs real `{ user:{id,firstName,lastName} }`.
- ☐ **T9 (P2)** `markComplete` silent-fails (`try{}catch{}`), can't reopen; 100%-via-update leaves status OPEN → views disagree. Kanban "add task" drops column; drag before statuses load 404s.
- ☐ **T10 (P2)** My-Tasks count vs filter mismatch; empty state masks query errors; dead `AVATAR_COLORS` dupe; a11y (no dialog role/esc/focus-trap).

## 3. Project membership ⭐ — **must be BUILT (feature absent at every layer)**

- ☐ ⭐ **PM1 (P0)** Backend: add `GET/PUT/PATCH/DELETE /projects/:id/members` (controller + service `getMembers/addMembers/removeMember/setRole`, **upsert** to dodge the `isActive` unique-constraint trap; owner guard) + member DTOs. Mirror `channels`.
- ☐ ⭐ **PM2 (P0)** Frontend api client: `api.projects.members/addMembers/setMemberRole/removeMember`.
- ☐ ⭐ **PM3 (P0)** UI: "Manage team" on the project Team card — member-picker modal (search org users, exclude existing), role dropdown, per-row remove (×). Optionally member-select in NewProjectModal.
- ☐ **PM4 (P1)** New RBAC perm `project.manage_members` in catalog + presets (regrant).
- ☐ **PM5 (P1)** Membership has no access teeth — `get`/`list` ungated, so remove doesn't revoke. Decide privacy model; gate reads on membership (channels' `assertMember`).
- ☐ **PM6 (P2)** Frontend still sends `createdBy` as email (`ProjectsClient.tsx:212`) — drop it (backend uses cookie actor). Validate task assignees vs membership. Constrain `projectRole`. Dead `ProjectDepartment/Team` relations.

## 4. Issues / Activities / Timesheets / Discussions ⭐

- ☐ **I1 (P1)** Issues: no edit/assign after create (only status). Add issue edit (title/severity/assignee/due, incl. unassign).
- ☐ **I2 (P1)** Issues: status-change & delete fail **silently** (`catch{}`) and are permission-gated (Employee lacks `issue.update`, delete is Admin-only) but buttons always shown → gate with `can()` + toast errors.
- ☐ **I3 (P2)** Issues: assignee avatars photo-less (`issues.service USER_SELECT`); due-date off-by-one; assignee list = all org users; date-icon-only.
- ☐ **A1 (P1)** Activities: 90-day seed history written to `analyticsEvent` but tab reads `activity` table → feed looks empty. Backfill `Activity` (with `metadata.projectId`).
- ☐ **A2 (P2)** Activities: project scope drops events lacking `metadata.projectId` (e.g. time-logged); `task.updated` mapped but never emitted; actor avatars photo-less.
- ☐ **TS1 (P1)** Timesheets: **no permission gating + trusts client `userId`** (`timesheets.service.ts:54`) → log/delete as anyone. Derive from `getActorId()`, add `@RequirePermission`.
- ☐ **TS2 (P2)** Timesheets: no edit UI; summary cards ignore billable filter; silent delete; avatars photo-less; date off-by-one; client allows 0.1h (backend 400s).
- ☐ **D1 (P1)** Discussions: delete leaves a `[deleted]` tombstone (`comments softDelete` keeps row) & own-delete 403s silently (delete is Admin-only). Real soft-delete + owner-authorized delete + toast.
- ☐ **D2 (P2)** Discussions: no realtime refetch; load error looks like empty; avatars photo-less; Ctrl+Enter→Enter; no delete confirm.

---

### Fix order (batches, each committed)
1. ☑ Layout portal (G1, G2).  2. Global primitives applied (G3, G4, G5).  3. Tasks (T1–T10).
4. Project membership build (PM1–PM6).  5. Issues/TS/Discussions/Activity (I/A/TS/D).
