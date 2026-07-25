# Home module — 28-tester QA (2026-07)

28 testers, one per person (27 real roster members + 1 boundary/edge-state tester), each adopting
their real identity + role + permissions and tearing down **only the Home module** through a
distinct lens. Method = deep code-level persona teardown of `apps/web/app/home/page.tsx`,
`apps/web/components/home/sections.tsx`, `apps/web/components/home/shared.tsx` + the backend
endpoints the cards call. Findings recorded here per agent as they complete (survives session drops).

## The Home surface (16 self-gating cards)
Top zone: **PersonaBanner** (greeting + **Punch In/Out**), **OrgStatsRow**, **MyPerformanceCard**.
Masonry: ProjectApprovals, TeamAvailability, LeaveApprovals, MyTasks, TeamAttendance, OrgPerformance,
MyProjects, PeopleOps, ProjectStatus, QuickStats, AdminShortcuts, QuickAccess. (MyAttendanceCard is
exported but not in the grid.)
Gates seen: project.view, task.view, attendance.view.own/organization, user.view, role.view,
project.approve, performance.view.own, leave.approve, capacity.view, audit.view, analytics.view.organization.
Data: attendance.today/punch/orgSummary, tasks.listForUser, projects.list/pendingApprovals/approve/reject,
leave.balances/orgRequests/holidays/approve/reject, analytics.dashboard, performance.me/org, users.list,
roles.list, capacity.team.

## Tester → persona → lens
| # | Person | Role | Lens / focus |
|---|---|---|---|
| 1 | Mohit Kalra | Super Admin (VP) | PersonaBanner + Punch button (top zone), full-admin card set |
| 2 | Yash Bhargava | Super Admin (AVP) | AdminShortcutsCard + OrgStatsRow |
| 3 | Nitin Goel | Manager | ProjectApprovalsCard (dead-flow?) + TeamAvailabilityCard |
| 4 | Neha Shukla | Senior Consultant | OrgPerformanceCard + OrgStatsRow |
| 5 | Shaveta Sharma | HR | LeaveApprovals + TeamAttendance + PeopleOps |
| 6 | Meetu Singh | Consultant | MyTasksCard |
| 7 | Vijay Mishra | Consultant | MyProjectsCard + ProjectStatusCard |
| 8 | Ajay Sharma | Consultant | MyPerformanceCard |
| 9 | Ketan Dagar | Sr Research Associate | QuickStatsCard + QuickAccessCard |
| 10 | Amritpal Kaur | Sr Research Associate | Punch/attendance data + flow (banner) |
| 11 | Basant Goyal | Sr Research Associate | MyAttendanceCard (dead/duplicate?) |
| 12 | Khushi Gupta | Sr Research Associate | Permission-gating matrix (cards shown vs hidden) |
| 13 | Anant Gupta | Employee (intern) | Empty-DB / no-data states (post-wipe) |
| 14 | Aman Sharma | Employee (intern) | Loading + error states |
| 15 | Arjun Ghosh | Employee | Responsive / mobile / masonry layout |
| 16 | Ankit Verma | Employee | Accessibility (keyboard, aria, focus, contrast) |
| 17 | Divyanshu Saxena | Employee | Links / navigation correctness |
| 18 | Drishti Jain | Employee | Data correctness + timezone/number/date edges |
| 19 | Geetesh Rathore | Employee (intern) | Greeting banner content (name/role/office/avatar/time) |
| 20 | Poorvi Gupta | Employee (intern) | Render/perf (re-renders, cache keys, N+1 on load) |
| 21 | Ragini Kumari | Employee (intern) | Cross-role visual/behaviour consistency |
| 22 | Rajesh Joshi | Employee (intern) | Copy / text / tooltips / empty-state messages / typos |
| 23 | Ritik Sharma | Employee (Sr BD Exec) | Non-delivery persona view (BD — relevant cards?) |
| 24 | Ronak Khandelwal | Employee | Interaction states (hover/disabled/punch states) |
| 25 | Sugandh Raghav | Employee | Visual polish (spacing/alignment/icons/theme) |
| 26 | Tanisha Jain | Employee (intern) | Edge data (long names, null fields, no office) |
| 27 | Vandana Boora | Employee | Suggestions / UX improvements (what's missing) |
| 28 | (boundary) | — | Unauth redirect, first-login gate, mustReset, error boundaries, session-expiry |

## Progress log
- 2026-07-25: plan created; Home surface mapped; 22 of 28 agents launched (20-concurrent cap hit); remaining 6 launched as slots freed.
- 2026-07-25: **ALL 28 testers COMPLETE.** Per-agent findings + cross-agent SYNTHESIS recorded below.
- 2026-07-25: **FIXES APPLIED (root-level, no patchwork).** See "Fixes applied" below. API + web typecheck clean.

## Fixes applied (2026-07-25)
Root-cause fixes built as shared infrastructure rather than per-card patches.

**New shared infra (fix-once):**
- `lib/date.ts` — IST-pinned helpers (`longDateIST`/`hourIST`/`todayIST`/`formatTimeIST`), `formatDate` now `en-IN` + auto-adds the year for cross-year dates, and formatters `fmtHours`/`fmtNum`/`fmtPct`/`plural`. Kills the whole timezone seam, hydration mismatch, inconsistent hours rounding, year-less dates, "1 days" plural, and US date format.
- `components/home/shared.tsx` — `ErrorState`+`SkeletonRows` (used by every card), `PersonRow` (Avatar+name — Home now shows avatars everywhere), `CardHeader` with `badge`/`actions` slots (no more hand-rolled headers), `ConfirmButton` (2-step confirm, no modal), `CountBadge`, `BADGE` colour tokens, `phaseChip` (unknown-phase-safe, adds CLOSED/CANCELLED), contrast bump `gray-400→500`, priority dot MEDIUM→amber.
- `components/home/keys.ts` — one source for query keys; the `att-org`↔`attn-org` typo is gone (Team Attendance now refreshes after a punch).
- `components/home/usePunch.tsx` — the SINGLE punch impl: loading guard (no accidental punch-out mid-load), optimistic `setQueryData` (double-click race closed), success/error toasts, IST times, overnight-close handled with a clear message, confirm-on-punch-out. Dead `MyAttendanceCard` deleted.
- `app/home/error.tsx` + `loading.tsx` — a render-throw no longer blanks the page; first paint is a skeleton.

**Per-card (all 12 refactored):** every card now has an `isError`→retry branch (no more silent-failure-as-zeros); `MyPerformance`/`ProjectStatus` distinguish "no data yet" from real zeros; `ProjectStatus` counts every phase (reconciles with Total); `MyTasks` capped at 6, red excludes CLOSED, decoy checkbox replaced with a real done-icon, tabs get `aria`; approvals get toasts + per-row (not board-wide) disable + confirm-on-reject + avatars + self-request hidden + friendly leave labels; the dead **ProjectApprovals card is replaced by a live PID-Requests card** (`project.generate_pid`, one-click Generate+Assign) — also the SRA's missing PID affordance; banner uses IST greeting/date + avatar + wired-in persona sub; icons fixed (Flag→CalendarDays, UserCheck→Settings, dedup Shield→KeyRound); QuickAccess gains Timesheets + Expenses; responsive truncation + `md:columns-2` + AppShell `overflow-x-hidden`.

**Persona/RBAC:** `Senior Research Associate` added to `ROLE_PRIORITY` + `ROLE_PERSONA` (no more generic "Team Member"/"Your workspace").

**Backend correctness + authz:**
- `performance.service.ts` — org "Tasks completed" + on-time are now DISTINCT-task aggregates (multi-assignee tasks counted once), and on-time is judged on the **IST calendar day** vs the due date (fixes the systematic late-bias). Applies to Home + `/performance`.
- `analytics.service.ts` — dashboard task counts (total/overdue/due-today) count **distinct tasks**, not ProjectTask join rows (M2M double-count gone; reconciles with the projects list).
- `tasks.controller.ts` — `GET /tasks` now `@RequirePermission('task.view')` (defense-in-depth).
- `tasks.service.ts` — `listForUser` scoped to tasks in projects the user is **still an active member of** (stale-membership leak + 403-on-click gone).

**Redirect-loop:** `AppShell` clears cookies via `logout()` before bouncing to `/login`, so a revoked-but-present 14-day cookie can't cause the `/home`↔`/login` infinite loop (e.g. after an admin password reset). A `WorkspaceErrorBanner` surfaces an org/permissions load failure instead of silently emptying cards.

**Deferred (net-new features, not defects — need product sign-off):** today's-agenda/calendar card, inline "Log time" + missing-timesheet nudge, unread-mentions summary, a "My requests" card (requester side of PID/leave/expense), company-announcements strip, a BD/non-delivery pipeline surface, org-wide holidays card. Backend attendance day left on UTC (not IST) to avoid re-dating live Contabo records; the display seam only bites the pre-06:00 IST window.

---
# FINDINGS
Severity: HIGH (broken/leak) · MED · LOW · UI (visual/UX) · SUGG (suggestion). Recorded per agent below.

### #2 Yash (Super Admin) — AdminShortcutsCard + OrgStatsRow
- **MED** OrgStatsRow **masks API errors as legitimate zeros** — a failed `/analytics/dashboard` leaves `stats` undefined, every tile `?? 0`, `isLoading` false → the KPI strip shows "0 projects/0 active" indistinguishable from a real empty org, no error/retry (sections.tsx:120-131; same in QuickStatsCard, shared key `analytics-dashboard`).
- **MED** AdminShortcutsCard shows a false **"0 roles"** for a delegated admin holding `permission.view`/`user.create` but not `role.view` (roles query disabled → []) (sections.tsx:591-601).
- **LOW** no loading skeleton on the admin sub-label (flash of "0 users · 0 roles"); "0 users" self-contradiction (can't count the reader); no thousand-separators on exec stats.
- **UI** duplicate `Shield` icon (header + first link); OrgStatsRow `px-6` vs masonry `px-4 sm:px-6` → edges don't align on phone; permission-load pop-in / reflow on cold load.
- **SUGG** OrgStatsRow "Total Projects" is membership-scoped, not firm-wide (gate on analytics.view.organization + qualify the label); add Patents/Settings/Company admin shortcuts; add a `links.length===0 → null` guard.
- ✅ gating correct (both panels), empty-DB → zeros not NaN, link targets exist + are guarded.

### #11 Basant (SRA) — dead/duplicate/redundant
- **HIGH** `MyAttendanceCard` (sections.tsx:360-416) is **fully dead code** — exported, never imported/rendered (punch moved to PersonaBanner). Delete it (+ its stale header/comment); no orphaned imports.
- **MED (real live bug)** **cache-key mismatch: `TeamAttendanceCard` reads `['att-org',…]` but the Home punch invalidates `['attn-org',…]`** → team Present/Absent counts on Home **never refresh after punching** (sections.tsx:463 vs :52). Fix the key.
- **MED** the dead MyAttendanceCard is a copy-paste twin of `PunchButton` sharing the same `attn-today` key + punch mutation → if ever re-added, two enabled punch buttons can double-submit (no cross-disable).
- **LOW** same data declared by two cards each — `analytics-dashboard` (OrgStatsRow+QuickStats), `projects` (MyProjects+ProjectStatus), `users` (PeopleOps+AdminShortcuts, **different staleTime 60s vs 120s** → inconsistent refetch). Dedup'd by react-query (not double network) but worth consolidating. Stale M33 comment rot.

### #1 Mohit (Super Admin) — PersonaBanner + Punch top-zone
- **HIGH** banner Punch button **silently swallows ALL errors** — mutation has no `onError`, renders no `punch.isError` (sections.tsx:50-53,75-84). "already clocked out"/"marked on leave"/401/500 all show nothing. The one variant WITH an error line (`MyAttendanceCard` :408) is dead code and not rendered.
- **MED** cache-key typo `att-org` (TeamAttendance :463) vs invalidated `attn-org` (:52) → Present/Headcount never refresh after a punch.
- **MED** double-punch race — `punch.mutate()` not deduped; a fast 2nd click after the 1st commits → backend treats as clock-out (~0h HALF_DAY, "Day complete") (:76-77 + attendance.module.ts:155-161).
- **MED** UTC-day (`utcDay`) vs IST display mismatch: 00:00–05:30 IST the banner date ≠ recorded punch day; times only correct if viewer browser = IST (no fixed org tz).
- **MED** forgotten open shift: first "Punch In" runs overnight-close, does NOT create today's row, refetch returns null → button still "Not clocked in", needs a 2nd click, zero feedback (attendance.module.ts:134-143).
- **UI/LOW** button flashes enabled "Punch In" during load (no `isLoading` guard); persona chip flashes "Member" then real role; `ROLE_PERSONA.sub` defined but never rendered; "0 leave days left" on wiped DB; status/time block `hidden sm:block` (phone shows bare button); `attn-today` double-fetches (`enabled` not gated on `currentUser?.id`).
- **SUGG** consolidate the two drifted punch impls into one `<PunchControl>`; `onSuccess` → `setQueryData` not invalidate; add a mutation guard; render times in fixed IST.
- ✅ SA gating correct (all 16 cards render), empty-DB → clean zeros (no NaN), non-punchers NOT counted absent today.

### #3 Nitin (Manager) — ProjectApprovalsCard + TeamAvailabilityCard
- **HIGH** **ProjectApprovalsCard is structurally DEAD** — `create()` raises a `PidRequest`, never an `Approval`; there is **zero `prisma.approval.create`** in the API, so `pendingApprovals` is always empty and the whole card (sections.tsx:624-682) can never show a row. The project-approval gate was removed earlier (projects create ACTIVE) but the card was left behind.
- **MED** TeamAvailabilityCard "Xh free" is a **7-day-window total** mislabeled as available-now (sections.tsx:705,715) — a Manager reads "24h free" as spare *today*.
- **MED** 7-day Home window vs 14-day capacity-board window → the two disagree.
- (see also Poorvi #20: `capacity.team(7)` is a heavy all-tasks aggregation run just for this 4-tile card.)

### #4 Neha (Senior Consultant) — OrgPerformanceCard + OrgStatsRow
- **MED** org **"Tasks completed" double-counts multi-assignee tasks** — `tasksCompleted++` per assignee then summed across users (performance.service.ts:293-299,344/352) → a 3-assignee task counts 3.
- **MED** "Top performers" sorted by composite `score` but the row prints `{tasksCompleted} done` (sections.tsx:430,443-448) → #1 can show fewer "done" than #2; no legend on Home.
- **MED** neither focus card has an error state → a failed fetch renders "0 tasks · 0h · 0% · 0 projects" indistinguishable from an empty org.
- **LOW-MED** "On-time rate" is an unweighted mean of per-user rates, not a true org ratio (performance.service.ts:345-346); `performance.view.organization` is a **dead permission** (never enforced; org perf gated only on `analytics.view.organization`).
- **LOW** OrgStatsRow "Total Tasks" counts ProjectTask join rows (M2M double-count); hours precision differs (`Math.round` here vs 1-decimal in MyPerformance); org-perf GET fires a **write side-effect** (`maybeAutoRefresh`→rebuildSnapshots) + `catch {}` swallows failures; `activeProjects` doesn't filter `isActive`.
- ✅ wiped/empty DB safe (division-guarded, no NaN); 8h working-day applied consistently.

### #5 Shaveta (HR) — LeaveApprovals + TeamAttendance + PeopleOps
- **MED** TeamAttendance "Absent" tile is **effectively always 0** for the today snapshot — inferred-absent only fires for `k < todayKey` (attendance.module.ts:594); no "not yet clocked in" bucket, so present+leave+absent rarely sums to headcount.
- **MED** all three focus cards render a **fetch error as a happy "0 / all-clear"** state (no `isError`); LeaveApprovals error → cheerful "No pending leave requests. 🎉".
- **MED** approve/reject have no error feedback; HR's OWN leave appears in their approvals list (orgRequests returns all pending incl. self) with buttons that 403 silently.
- **LOW** one pending mutation disables every row; `leaveType` shown as raw code (SL/EL) not label; card gate `leave.approve` ≠ list-query perm `leave.view.organization` (latent 403); PeopleOps "Headcount"==="Active" always (list defaults to ACTIVE, no `includeInactive`); weekend renders all-zero card with no "weekend" label.
- **LOW** MyPerformanceCard is permanent 0/0/0h/0 noise for HR (no task/timesheet perms); HR's `performance.view.organization` surfaces nowhere.
- ✅ card visibility correct — every delivery/capacity/admin card gated off for HR; no PII leak (`/users` select excludes address/DOB/emergency).

### #6 Meetu (Consultant) — MyTasksCard
- **MED** **uncapped list** — `visible.map()` has no `.slice()` (sections.tsx:223); 100+ tasks render 100+ rows + `break-inside-avoid` wrecks masonry (contrast MyProjects caps at 5).
- **MED** flash-of-empty before load (disabled query = `isLoading:false` → "No tasks" before tasks appear); **silent failure** (no `isError` → API error looks empty).
- **MED** overdue red fires on **COMPLETED** tasks — inline `isOverdue` omits the `type!=='CLOSED'` guard the Overdue tab has (:224 vs :181).
- **MED** task rows aren't openable — title is a plain `<span>`, no `/tasks/[id]` route; the leading div **looks like a checkbox but has no onClick** (decoy).
- **MED** `GET /tasks` has **no permission guard** (tasks.controller.ts:15-24; opt-in guard) — any authed user can read their own tasks regardless of `task.view`.
- **MED** stale-membership leak — `listForUser` filters only on assignee, no project-membership check; removed-from-project but still-assigned → task + project chip show on Home, chip links to a project that then 403s.
- **LOW** "In Progress" tab is a heuristic (OPEN && %>0); completion% never shown; no per-tab counts; priority dot color-only (CRITICAL==HIGH red); only first project chip shown; overdue boundary is UTC not IST; null-actor bypasses the cross-user guard.

### #7 Vijay (Consultant) — MyProjectsCard + ProjectStatusCard
- **MED** free-text `title` is the **one unredacted client-leak vector** — list projection omits client/patents (safe) but renders `title` verbatim; a project named "Apple v Samsung – US7,654,321" defeats the coded-handle model (projects.service.ts:422; sections.tsx:289).
- **MED** silent failure — MyProjects destructures only `data`/`isLoading`; API error → "No projects yet."
- **MED** ProjectStatus **drops CLOSED/Cancelled/ARCHIVED buckets** (only counts ACTIVE/PLANNING/ON_HOLD/COMPLETED, :320) → counts don't reconcile with OrgStats "Total Projects" (which counts all non-deleted incl. CLOSED).
- **LOW** PID (`code`) fetched but never displayed; **no "PID pending" state** (a Consultant's created projects start `code:null` until an authority fulfils — invisible on Home); CLOSED/ARCHIVED pollute the newest-5 + render raw "CLOSED" gray badge (no PHASE_COLORS key); empty-state flashes before org resolves; ProjectStatus has no skeleton/empty/error and its "Manage" link over-promises for a `project.view`-only role.
- ✅ confidentiality holds — both cards membership-scoped, list projection omits client/patent fields.

### #8 Ajay (Consultant) — MyPerformanceCard
- **HIGH** 4 tiles **silently mix three time bases** — completionRate is all-time, on-time+hours are last-30-days, tasksOverdue is point-in-time-now; rendered side-by-side, no "last 30 days" label (sections.tsx:147-152; performance.service.ts:89-117).
- **HIGH** empty-window/empty-DB renders **"0%" indistinguishable from failing performance** — `pct(0,0)=0`; no "—"/"N/A"/"no data yet" state; the most misleading thing on a fresh account.
- **MED** on-time systematically biased LOW — compares full `updatedAt` timestamp vs midnight-UTC `dueDate`; any same-day IST close after ~05:30 counts late (performance.service.ts:147).
- **MED** "completed"/"on-time" keyed off `Task.updatedAt` not a real close time — later edits move it, mis-windowing completions.
- **MED** no error state → failed `/performance/me` renders "0%/0%/0h/0".
- **LOW** zeros flash before skeleton; `data?.kpis.X` doesn't optional-chain `kpis` (contract-drift crash); Home leads with "Completion rate" but the /performance glossary has no such row; no ⓘ tooltips; hours not thousand-separated; `trend`/`previous` fetched but no delta shown.

### #9 Ketan (SRA) — QuickStatsCard + QuickAccessCard
- **MED** QuickStats **mixes scopes** — `tasksDueToday`/`overdueCount` are project-wide (all staffed projects, teammates included) while `hoursLoggedThisWeek` is own-only, under one label (sections.tsx:349-354; analytics.service.ts:44-77).
- **MED** QuickStats "Overdue" diverges from MyPerformance "Tasks overdue" and MyTasks Overdue tab — three different overdue numbers on one page.
- **MED** fetch failure renders as legit zeros (no error branch).
- **MED-SUGG** **no PID / "New Project" affordance** anywhere on Home for a `project.generate_pid` holder — the one power that distinguishes an SRA has zero Home surface.
- **MED** "Senior Research Associate" unknown to `ROLE_PERSONA`/`ROLE_PRIORITY` → generic "Your workspace" banner subtitle.
- **LOW** "Active projects" shown twice (OrgStatsRow + QuickStats); QuickAccess omits Timesheets + Expenses (SRA holds those perms); Calendar uses a `Flag` icon; Settings uses `UserCheck` (dup of TeamAvailability header).
- ✅ QuickAccess links are permission-correct (`/users` correctly hidden; all 7 visible routes resolve).

### #10 Amritpal (SRA) — Punch/attendance flow (banner)
- **HIGH** banner punch swallows all errors (dup of #1); **near-IST-midnight** the banner date and the punch day disagree (utcDay vs browser IST); **no loading state** → mid-load click can punch you OUT by accident; **post-success race** → double click flips Punch-In to instant Punch-Out.
- **MED** "Completed for today" permanently locks re-entry — one lunch punch-out or misclick ends the day, unrecoverable from the UI; forgotten-yesterday first click closes yesterday + shows nothing; card never surfaces PRESENT vs HALF_DAY (a 3h day looks identical to a full day); never-punch-out recorded as full PRESENT; no LATE marking (2pm IST clock-in still "PRESENT").
- **LOW** two divergent punch impls; punch query fires before user id; `attn-org`≠`att-org`; punch-out has no confirm; leave-balance fallback sums heterogeneous types incl. comp-off; "Not clocked in" vs "Day complete" dots near-indistinguishable gray.

### #12 Khushi (SRA) — permission-gating matrix
- **Matrix** (cards visible): Super Admin 16, Admin 16, Manager 15, Sr Consultant 13, Consultant 9, SRA 9, HR 7, Employee 9. Full role×card table captured in agent output.
- **MED** **Consultant, SRA and Employee render a BYTE-IDENTICAL Home** — every Home gate keys off VIEW_BASICS (`project.view`/`task.view`/`attendance.view.own`/`performance.view.own`); the perks that define the senior roles (`task.assign`, `issue.update`, `report.export`, `project.generate_pid`) carry no Home card. Promoting Employee→SRA changes nothing on the landing page. Banner also doesn't recognize SRA.
- **LOW** LeaveApprovals card gate (`leave.approve`) ≠ list API gate (`leave.view.organization`) — latent 403 for a custom role; `MyAttendanceCard` orphaned dead code.
- ✅ data-safe — every gate maps to a live role holder; juniors get object-scoped (not firm-wide) analytics; no sensitive team card leaks downward.

### #13 Anant (Employee/intern) — empty / no-data states (post-wipe)
- ✅ No NaN anywhere, no crashes, no infinite spinners — backend `pct()`/`avgCompletion` division-guarded + frontend `?? 0`.
- **MED** MyPerformanceCard has no empty state → shows "Completion 0% / On-time 0%" to a brand-new joiner, reads as a **failing grade** not "no data yet".
- **MED** PunchButton "0 leave days left" on a fresh account (balances `[]` when no LeaveType rows) — alarming + wrong.
- **LOW** ProjectStatus/QuickStats/OrgStatsRow render a "sea of zeros" with no empty hint; MyTasks "All" tab says "No tasks in this category" (implies other tabs have tasks).
- **SUGG** add a first-run onboarding/empty experience (welcome + punch in / view tasks / request a project).

### #14 Aman (Employee/intern) — loading + error states
- **HIGH** **every card ignores `isError`** — a 500/403 masquerades as empty/zero data across the whole module (worst: 🎉 on a failed leave fetch). This is the single most common defect class the whole sweep found.
- **HIGH** no `app/home/error.tsx` or `loading.tsx` — a render-throw in any one card blanks the entire page (no error boundary).
- **MED** 5 cards have no skeleton (ProjectStatus, QuickStats, AdminShortcuts among them) → flash of zeros during load.
- **MED** masonry CLS — cards jump columns as staggered queries resolve at different times.
- **SUGG** add `error.tsx`/`loading.tsx`, an `isError` branch + retry on every card, and reserve skeleton heights.

### #15 Arjun (Employee) — responsive / mobile / masonry
- **UI-HIGH** My Tasks row **overflows horizontally on ≤360px phones** — `flex-1 truncate` title + four `shrink-0` items incl. an uncapped status pill (sections.tsx:227-246); AppShell scroller (`overflow-y-auto` only, AppShell.tsx:81) makes overflow-x reachable → body scrolls sideways.
- **UI-MED** My Projects row `w-28` progress bar forces overflow at ≤320px; My Tasks filter tabs (4 non-wrapping pills) overflow the card header; PersonaBanner greeting can collide with the `shrink-0` punch button (no `min-w-0`/`truncate` on h1); approve/reject touch targets ~27px (below 44px).
- **UI-LOW** no tablet 2-col (jumps 1→lg:2→2xl:3; iPad portrait gets one stretched column) — suggest `md:columns-2`; banner `px-6` vs masonry `px-4 sm:px-6`; StatTile lacks `min-w-0`.
- ✅ `break-inside-avoid` targets correct nodes; OrgStatsRow/MyPerformance/MetricRow collapse cleanly; list rows use `flex-1 min-w-0 truncate` correctly (the pattern MyTasks is missing).

### #16 Ankit (Employee) — accessibility
- **MED** icon-only Approve/Reject buttons have only `title=`, no `aria-label` (sections.tsx:528,532,669,673); Punch button never sets `aria-busy` while pending; banner punch swallows errors with no `role="alert"`; My Tasks filter tabs signal active state by color only (no `aria-pressed`/`aria-selected`); page has **no landmark structure** (banner is a `div` not `<header>`, cards are `div` not `<section>`).
- **MED** pervasive `text-gray-400` body text (#9ca3af ≈ 2.85:1) **fails WCAG AA** on punch times, leave dates, requester names, holiday dates, section labels, EmptyHint; task status badge = raw hex on a 13%-alpha wash of the same hex (no contrast floor).
- **MED** **meaning by color alone** — task priority is a bare colored dot (no label/title); "completed" is a green-filled checkbox-shaped div.
- **LOW** no `focus-visible` ring on solid-fill buttons; disabled "Completed for today" is white-on-gray-300 (~1.5:1); skeletons give SR nothing (`role="status"`); no `prefers-reduced-motion`; progress bar has no `role="progressbar"`.
- ✅ all interactive elements are real `<button>`/`<a>` (no div-onClick); heading hierarchy clean h1→h2.

### #17 Divyanshu (Employee) — links / navigation
- **MED** "All requests →" (LeaveApprovals :508) is a **wrong-target** — lands on `/attendance` Overview; the pending-leave queue lives only in the Team tab and the page never reads a query param. Suggest `/attendance?tab=team` + hydrate tab from query.
- **MED** project-row/chip click shows a **misleading "Make sure the API server is running on port 4000"** on any non-200 (ProjectDetailClient.tsx:205) — a 403 or stale/deleted id surfaces "API down" instead of "not found / no access".
- **LOW** LeaveApprovals card gate ≠ destination queue gate (latent, dup of #12); AdminShortcuts `/admin` link re-adds `user.create` (diverges from Sidebar); `MyAttendanceCard` orphaned dead code; task rows not navigable (no `/tasks/[id]`); approving leave leaves TeamAttendance counts stale.
- ✅ from an Employee view: no 404s, all 13 link targets resolve, no 403 shortcuts, valid project ids, all `next/link` (no raw `<a>`/external).

### #18 Drishti (Employee) — data correctness / timezone / formatting
- **MED** banner date + greeting are **browser-local** but every "today" data window is **UTC-day** → disagree near IST midnight (00:00–05:30 IST); greeting not pinned to IST; punch in/out times render in browser TZ not office IST.
- **MED** **hours formatting inconsistent across the whole dashboard** — MyPerformance shows un-rounded (37.5h), QuickStats/OrgPerf apply extra `Math.round` (38h), Punch/Attendance print 2-decimal raw (8.33h), TeamAvailability mixes rounded label + un-rounded per-person. Shared `fmtHours` exists but Home imports none of it.
- **LOW** per-row overdue red ignores CLOSED (dup of #6); `?? 0` guards null but not NaN (defense-in-depth); counts have no thousands separator; "Leave remaining" hardcoded plural → "1 days"; negative balance sums → "-2 days"; null firstName would print "null"; ProjectStatus drops CLOSED/ARCHIVED/IDEA (dup of #7); `today()` re-implements shared `todayUtc()`/`isPastDue()`.

### #19 Geetesh (intern) — greeting banner content
- **HIGH** greeting + date computed from **browser-local time**, not org/IST (sections.tsx:93-95) — `useOrg().org.timezone` available but unused; wrong greeting/day on a non-IST device.
- **MED** SSR/CSR **hydration mismatch** on greeting + date near the noon/6pm/midnight boundaries (no `suppressHydrationWarning`); banner renders **NO avatar/initials at all** though the shared `Avatar` + `profilePhoto` are used everywhere else — the one surface that greets you by name shows neither photo nor monogram.
- **MED** for an intern the pill says generic "Team Member"; the real designation ("Intern- Research Associate") is de-emphasized gray sub-text; `ROLE_PERSONA`/`ROLE_PRIORITY` omit SRA.
- **MED** "0 leave days left" flashes for a new intern (dup).
- **LOW** greeting is a render-time snapshot (never updates); en-US locale + 12h clock for an Indian firm; firstName `??` doesn't guard `""` (dangling comma); long names not truncated; `persona.sub` dead; designation spacing typo rendered verbatim; total hours unrounded.

### #20 Poorvi (intern) — render / data-fetching / perf
- **HIGH** TeamAvailabilityCard runs `capacity.team(7)` on mount — a **heavy all-tasks aggregation** just to fill a 4-tile card (sections.tsx:689-693); OrgPerformanceCard's `performance.org` is the same "expensive query for a small card" pattern; no lazy/below-the-fold loading (Super Admin fires 14 parallel requests, several heavy).
- **MED** PunchButton can double-fetch attendance/leave (keys on `currentUser?.id` but gates only `enabled: allowed`) — orphan `['attn-today', undefined]` entry; `att-org`≠`attn-org` leaves TeamAttendance stale after punch; masonry reflows all cards as queries resolve (CLS).
- **LOW** `['users']` declared with two staleTimes (60s vs 120s); `analytics-dashboard` key has no date segment (stale across midnight).
- ✅ the 3 obvious overlaps (`analytics-dashboard`/`projects`/`users`) are correctly de-duped by shared keys; contexts memoized; `refetchOnWindowFocus:false` prevents focus storms.

### #21 Ragini (intern) — cross-card / cross-role consistency
- **UI** shared primitives (`CardHeader`/`StatTile`/`MetricRow`/`EmptyHint`) are **under-adopted**: 3 cards hand-roll their own header (MyTasks tabs, Leave/ProjectApprovals badges); header padding drifts `py-3.5` vs `py-4`; some cards have a header icon, some don't (titles start at two left-offsets).
- **UI** view-all affordance inconsistent — `<ArrowRight>` icon vs literal "→"; MyTasks puts its link in a footer, everyone else in the header; **8 different words** for "open the module" ("View details"/"View all"/"Manage"/"Open"/"Directory"/…).
- **UI** every card invents its own skeleton (3 "big number" sizes; rich vs single-bar list skeletons); ProjectStatus + AdminShortcuts have no loading state at all.
- **UI (highest-value)** a **person is rendered as bare text in every Home card** — the shared `Avatar` is used in ~20 places app-wide but **zero** Home cards; name is sometimes server `.name`, sometimes client first+last with different null fallbacks. Suggest a shared `<PersonRow>` primitive.
- **UI** "Overdue" is red in QuickStats but purple in TeamAvailability; "good/present" green vs emerald; MyPerformance hand-rolls a 3rd KPI style next to StatTile.
- ✅ cross-*role* rendering is clean (no role branching; same card is pixel-identical across roles) — all drift is cross-*card*.

### #22 Rajesh (intern) — copy / text / microcopy
- **UI** attendance widget speaks **three verbs** for one action — button "Punch", tooltip "Clock", status "Clocked" (:78-83); "Day complete" vs "Completed for today"; "Spare hours" vs "free".
- **UI** two real **pluralization bugs** — "1 days" (:412) and "1 users · 1 roles" (:601); PunchButton (:72) already guards it correctly, copy that.
- **UI** OrgStatsRow is **Title Case** ("Total Projects") against an otherwise sentence-case page ("Active projects" appears both ways on one screen).
- **UI** US date format `en-US` on the daily banner (:94) for an Indian company → use `en-IN`/`en-GB` ("25 July 2026"); punch times `en-US` too.
- **UI** lone 🎉 emoji on one empty state (:513) while three others are emoji-free; CTA vocabulary sprawl (9 phrasings, two for the same `/performance` link).
- **SUGG** "My Projects" actually lists all org projects (mislabeled); raw leave-type enum may surface; `persona.sub` strings authored but never rendered (dead copy); "Someone" impersonal fallback; American "organization" in role copy.

### #24 Ronak (Employee) — interaction states / feedback
- **HIGH** the **entire Home module imports no toast** though a global `useToast` is used across the app — every mutation fails silently: Leave approve/reject (:497-498), Project approve/reject (:641-642), banner Punch (:50-53) all have `onSuccess` only, no `onError`.
- **MED** two independent Punch mutations with no cross-guard (banner vs MyAttendanceCard) → double-submit; approvals disable is **board-wide not per-row** (`busy = approve.isPending || reject.isPending`) — approving row 1 locks rows 2-5; post-success/pre-refetch re-click window; no spinner on approve/reject (only dim); **Reject fires on a single click, no confirm**, adjacent to Approve.
- **MED** My Tasks decoy checkbox (dup of #6).
- **LOW** icon-only buttons rely on `title` not `aria-label`; no `aria-live`; MyAttendanceCard punch error is sticky (no `punch.reset()`).
- ✅ loading/disabled story is decent (skeletons everywhere; punch buttons handle pending well with spinner + guard) — outcome feedback is the weak spot.

### #28 boundary — unauth redirect / first-login gate / mustReset / session-expiry / error boundaries
- **HIGH** **revoked-but-present cookie → infinite /home↔/login redirect loop.** Edge `middleware.ts:9` treats mere cookie *presence* as authed and bounces `/login→/home`; the `access_token` cookie has a **14-day maxAge** (auth.controller.ts:20) but the JWT lives ~15 min and `securityVersion` is bumped on password-change + **admin reset-password** (revoking the session). Nothing clears the cookie except explicit `logout()`. So after an admin resets your password: cookie present 14d → `auth.me()` null → AppShell `router.replace('/login')` → middleware sees cookie → `/home` → … **ERR_TOO_MANY_REDIRECTS, user hard-locked out.** Fix: on `auth.me()===null` with cookies present, POST `/auth/logout` before redirect; don't bounce `/login→/home` on presence alone.
- **MED** 3-hop auth→org→permissions **waterfall** renders a stripped wrong-persona "Member" dashboard (every gated card null, PunchButton hidden, banner "Your workspace") for several hundred ms before the real one pops in. Fix: hold a unified skeleton until `permissions.loading` false (`home/loading.tsx`).
- **MED** first-load **permission-fetch failure collapses Home to a blank "Member" page** with no error/retry (no previous data for `keepPreviousData`; React Query captures the error so `error.tsx` never fires).
- **MED** **org-fetch failure is indistinguishable from "no data"** — `OrgProvider` captures `isError` but no one consumes it; OrgStatsRow→zeros, MyProjects→"No projects yet." on a backend outage.
- **MED** a **dead session on an already-open Home isn't detected** — `auth-me` has no `refetchInterval`; a card 401 whose refresh fails throws for that card but `isAuthed` stays true (stale user) → zeroed dashboard while "logged in" until a focus event.
- **LOW** presence heartbeat POST **403-spams** behind the mustResetPassword write-block (swallowed, but steady noise); gate screens leave `busy=true` on success and depend entirely on the refetch flipping the flag (no timeout/guard).
- ✅ VERIFIED SOLID: unauth→/login redirect (no flash, edge + client backstop); gate ordering password→profile→Home correctly unmounts Home; all reads render the gate (only heartbeat POST blocked); single-flight token refresh keeps a live session past 15-min expiry; `error.tsx`/`global-error.tsx` exist (they just don't catch RQ errors).

### #23 Ritik (Sr BD Executive / Employee) — non-delivery persona view
- **MED** **Home does not serve a non-delivery employee** — a BD person on zero delivery projects gets 6 of 8 visible cards showing 0/empty (OrgStats, MyPerformance, ProjectStatus, QuickStats all zero; MyTasks/MyProjects empty). Only Punch + QuickAccess carry real content → Home reads as broken/unconfigured.
- **MED** MyPerformance **scores a BD person 0% completion / 0% on-time** (delivery-task-derived) and feeds the Performance ranking → reads as chronic underperformance for someone doing a different job; no "not applicable to your role" treatment.
- **MED** OrgStatsRow org-wide-sounding labels ("Total Projects") but actor-scoped data → four zeros under org labels.
- **SUGG** no BD/sales surface exists anywhere (no CRM module in the catalog at all) — no pipeline/leads/meetings/targets card; root cause is the role model has **no non-delivery distinction** (a BD Employee holds the identical preset to a delivery RA), so gating can't tailor Home. Needs a BD role preset or a per-user non-delivery flag + a pipeline card.
- ✅ no confidential/client leak for this persona (membership-scoped server-side) — it's a relevance problem, not exposure.

### #27 Vandana (Employee) — suggestions / UX improvements (top 10, ranked)
- **SUGG (high)** **"Your day at a glance" / today's agenda is absent** — the app has a full calendar (`api.events.list`, events carry joinUrl/location/attendees) but Home never shows today's meetings, a Join button, or a one-line day summary. Biggest miss for a delivery KPO.
- **SUGG (high)** **no timesheet nudge, no inline "Log time"** — billable hours are the business but Home never prompts ("you haven't logged time today") and has no log-time action (`LogTimeStandaloneModal` exists elsewhere).
- **SUGG (high)** **no empty-first-run / onboarding** — post-wipe every card is a bare "No X yet" wall of dead ends; replace with CTA-bearing empty states + a getting-started checklist.
- **SUGG (high)** **notifications & unread Discuss mentions never surface** — `notifications.unreadCount` + `Channel.unreadCount` exist but only in the global bell; add a "Needs your attention" card so Home is the hub.
- **SUGG (med-high)** holidays are locked inside PeopleOpsCard (`user.view`-gated) so regular employees never see them — promote to an everyone-visible card; no birthdays/anniversaries though `dateOfBirth` exists.
- **SUGG (med-high)** **requester side of every workflow is missing** — only approvers get cards; the person who submitted a project/PID request, leave, or expense sees no status. Add a "My requests" card (incl. `expenses.mine` — the whole expense flow is un-surfaced).
- **SUGG (med-high)** Home is read-only stats with almost no create actions — add a permission-gated action bar (New Project / New Task / Log Time / Request Leave / New Expense).
- **SUGG (med)** company announcements/feed never appear (`company.announcements` exists); a pinned-announcement strip would give the banner zone daily value.
- **SUGG (med)** MyTasks looks actionable but isn't (decoy checkbox); add a "Due this week" forward view; QuickStats labeled generically but pulls org-wide analytics.
- **SUGG (med)** masonry is one hard-coded order — no "Action Required" pinning, no personalization, banner omits office (Gurgaon/Jaipur) + timezone though both exist; no dismiss/reorder.
- **Verdict:** competent permission-gated read-out with genuine inline approve/reject/punch, but a passive status board not a daily cockpit — ignores the app's own calendar/notifications/timesheets/expenses/announcements. Maturity: **mid**.

### #25 Sugandh (Employee) — visual polish
- **MED** **inset/padding drift misaligns the page's left rail** — OrgStatsRow + MyPerformance are fixed `px-6` while the masonry is `px-4 sm:px-6` (steps in/out on mobile); MetricRow body `px-4` vs its CardHeader `px-5` (values start 4px left of the title); stat-row `gap-4` vs card-grid `sm:gap-6` (rhythm changes mid-page). Fix: unify body → `px-5`, gap → `gap-6`.
- **MED** wrong glyphs — `Flag` for Calendar (should be `CalendarDays`, already imported); `UserCheck` for Settings (should be `Settings`/`Cog`, and it's ALSO the TeamAvailability header icon — one glyph, two meanings); duplicate `Shield` in AdminShortcuts header + first row.
- **MED** color system drift — two brand shades in one row (`text-brand-500` vs `text-brand-600`); the **`accent` orange token (#fe841f) is defined but never used** (generic orange/amber stand in); green/emerald/teal all used for adjacent people/availability cards; generic blue-600 next to brand-600 reads off-brand; hardcoded brand hex fallback `#3d8de2`.
- **LOW** three "big number" sizes (`text-2xl`/`text-xl`/`text-lg`) with no hierarchy reason; MetricRow value badge is the only `rounded-md` in a sea of `rounded-full` pills; `text-[11px]` off-scale; icon chips circle vs rounded-square; every Card has border + injected ring (doubled 1px edge); skeleton bars don't match settled layout (`w-32` vs `w-28`, missing dot/badge); 🎉 on only one empty state; 7 verbs for the same "open module" link; `MyAttendanceCard` orphaned; `ROLE_PERSONA.sub` dead data.
- ✅ primitives themselves (Card/CardHeader/StatTile/MetricRow, PHASE_COLORS) are solid — the polish leaks at the seams.

### #26 Tanisha (intern) — edge / malformed / boundary data
- **MED** **unrounded decimals leak everywhere** — OrgStats "Avg Completion" (`67.4444%`), MyPerformance KPIs (`123.456h`, `91.6667%`), Team on-time (:437), TeamAvailability per-person `freeHours` (`3.3333h free` — while the summed "Spare hours" IS rounded → per-row and total disagree), attendance `totalHours` (`8.43333h`). Inconsistent with QuickStats/OrgPerf which `Math.round`.
- **MED** **`formatDate` default drops the year** (date.ts:9 → `{month:'short', day:'numeric'}`) → every Home date shows only "Jul 6"; a 2024 due date and a 2030 due date render identically (overdue-last-year indistinguishable from this week). Affects MyTasks dueDate, Leave start/end, holidays, project-request due, nextFreeDate.
- **MED** **MyTasks list UNCAPPED** (:223, dup of #6/#15) breaks masonry with 200 rows; **status pill can't shrink/truncate** (:242, user-configurable status names overflow); **long leave reason wraps unbounded** (:522-526, no truncate unlike the name line) → inflates card height, unbalances masonry.
- **LOW** MyProjects progress bar breaks on null/out-of-range completion (`null%` + invalid CSS width; `>100` → label "150%" but bar clamped; negative → 0); malformed punch timestamp → literal "Invalid Date" (timeOf has no NaN guard unlike formatDate); "1 days" + negative balance "-2 days"; unknown phase → raw enum pill (shrink-0, no truncate); ProjectStatus omits ARCHIVED/IDEA (rows don't sum to Total); empty-string firstName → blank name (null-user "Someone" handled, empty string isn't); StatTile/MetricRow values no `min-w-0`/truncate + no thousand-separators (100000 overflows tile on mobile).
- **Verdict:** guards *presence* well (null users/dates → "—", empty states) but not *extremity* — raw-precision numbers, year-less dates, and three missing-truncation spots are the ones that actually break layout under real edge data. Top fixes: cap/scroll MyTasks, add year to `formatDate`, round %/hours.

## SWEEP COMPLETE — all 28 testers reported (2026-07-25)
Every persona + lens above is recorded. Synthesis / cross-agent theme roll-up follows below.

## SYNTHESIS — Home-module findings roll-up (28 testers)

**Convergent HIGH-severity themes** (flagged independently by many agents):

1. **Silent failure is systemic — every card treats an API error as "empty/zero data"** (Aman #14, and confirmed by Yash, Neha, Meetu, Vijay, Ajay, Ketan, Shaveta, Ronak, boundary #28). No card destructures `isError`; a 500/403 renders as a legit empty org (worst: 🎉 on a failed leave fetch). There is **no `app/home/error.tsx` / `loading.tsx`**, and React Query captures errors so the existing `error.tsx` boundary never fires. **Fix once, centrally.**

2. **The banner Punch button swallows every error + has no loading guard** (Mohit #1, Amritpal #10, Ronak #24, Ankit #16, Poorvi #20). The live banner `PunchButton` is the *thinner* copy with no error surface; the error-showing `MyAttendanceCard` is **dead code**. Consequences: mid-load / double-click can silently punch you OUT (~0h HALF_DAY, day locked); forgotten-yesterday first click shows nothing.

3. **`att-org` vs `attn-org` cache-key typo** (Mohit #1, Basant #11, Poorvi #20, Divyanshu #17) — Home TeamAttendance never refreshes after a punch. One-character fix (sections.tsx:463).

4. **ProjectApprovalsCard is structurally DEAD** (Nitin #3, plus Ronak/Ankit noticed its buttons) — `create()` raises a `PidRequest`, never an `Approval`; **zero `prisma.approval.create`** in the API. The card can never render a row. Either wire PID-requests into it or delete it.

5. **Timezone seam: banner date/greeting/punch-times are browser-local, every "today" query is UTC-day** (Geetesh #19, Drishti #18, Mohit #1, Amritpal #10, Meetu #6, Shaveta #5). Near IST midnight (00:00–05:30) the header date disagrees with the recorded attendance day; also SSR/CSR hydration mismatch. `org.timezone` exists but is unused.

6. **The whole module never adopted the app-wide `useToast`** (Ronak #24) — all four mutations (leave/project approve+reject, punch) fail silently; approvals disable the whole board not the acted row; Reject has no confirm.

**Convergent MED themes:**
- **Misleading empty vs "0"**: MyPerformance shows "0% on-time / 0% completion" to new joiners → reads as a failing grade, not "no data" (Anant #13, Ajay #8, Ritik #23). "0 leave days left" alarms new hires (Anant, Geetesh, Mohit).
- **Metric correctness/labels**: org "Tasks completed" double-counts multi-assignee tasks; "Top performers" ranks by hidden composite score but labels the row "done"; on-time biased low (UTC-midnight dueDate vs full timestamp); QuickStats mixes project-wide + own-only scopes; "Total Projects" M2M double-count (Neha #4, Ketan #9, Ajay #8, Drishti #18).
- **IC-tier flatness**: Employee, Consultant, and SRA render a byte-identical Home; banner doesn't recognize "Senior Research Associate"; SRA's `project.generate_pid` power has zero Home surface (Khushi #12, Ketan #9, Geetesh #19).
- **Home doesn't serve non-delivery roles** — a BD Employee gets a wall of zeros + a 0% performance score; no CRM/pipeline surface exists (Ritik #23).
- **Responsive overflow on ≤360px** — MyTasks row (uncapped status pill), MyProjects `w-28` bar, MyTasks tab header; AppShell scroller lets overflow-x reach the body (Arjun #15, Tanisha #26).
- **Data hygiene leak vector**: free-text project `title` is unredacted — a title naming a client/patent defeats the coded-handle model (Vijay #7).
- **Confidentiality/authz gap**: `GET /tasks` has no `@RequirePermission`; stale-membership assignee rows surface projects you can no longer open (Meetu #6).

**Convergent LOW/UI themes:** under-adopted shared primitives (3 hand-rolled headers, 3 skeleton styles, 3 KPI "big number" sizes); **no person avatars anywhere on Home** though the shared `Avatar` is used in ~20 places app-wide; inconsistent hours rounding (whole/1-dec/2-dec on one page); `formatDate` drops the year; copy drift ("Punch"/"Clock"/"Clocked", "1 days", "1 users · 1 roles", Title-vs-sentence case, US date format for an Indian firm, 9 CTA verbs, lone 🎉); WCAG AA contrast fails on `text-gray-400`; color-only priority dots; wrong icons (`Flag`→Calendar, `UserCheck`→Settings, dup `Shield`); the `accent` orange brand token is defined but never used.

**Dead code to remove (unanimous):** `MyAttendanceCard` (sections.tsx:360-416) — exported, never rendered, duplicates the banner punch logic; `ROLE_PERSONA.sub` — authored for all roles, never rendered.

**High-value product gaps (suggestions):** today's meetings/agenda, inline "Log time" + missing-timesheet nudge, unread mentions/notifications summary, a "My requests" card (requester side of PID/leave/expense flows), holidays visible to everyone, a first-run onboarding experience, a permission-gated "create" action bar. Home is a passive status board, not a daily cockpit (Vandana #27, Ritik #23).

**Verified SOLID (not bugs):** RBAC self-gating is data-safe (every gate maps to a live role holder; juniors get object-scoped, not firm-wide, analytics; no sensitive team card leaks downward; PII excluded from `/users`); empty/wiped DB is crash-safe (no NaN, division-guarded); all interactive elements are real `<button>`/`<a>`; unauth→login redirect + password/profile gate ordering + token refresh are solid; `refetchOnWindowFocus:false` prevents focus storms; the 3 obvious query overlaps are correctly de-duped by shared keys.

