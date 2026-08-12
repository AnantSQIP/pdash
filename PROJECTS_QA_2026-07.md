# Projects module — 28-tester QA (Round 1 of 5)

Multi-module QA sweep (plan: Projects → Patents → Tasks → Timesheets → Team Capacity). This is
**Round 1 = Projects**. 28 testers (27 real roster members + 1 boundary/edge tester), each adopting
their real identity + role + effective permissions and tearing down the **Projects module** through a
distinct lens. Method = deep code-level persona teardown of `apps/web/app/projects/*` +
`apps/web/components/projects/*` + `apps/api/src/modules/projects/*`, backed by a **live Playwright
visual pass** and a **multi-actor PID-handshake scenario**, then **adversarial verification** before a
finding is recorded.

## Roster & PID authority (verified from DB 2026-07-25)
- **Super Admin (2):** Mohit Kalra (VP), Yash Bhargava (AVP) — authorities, `'*'`.
- **Manager (1):** Nitin Goel — authority.
- **Senior Consultant (1):** Neha Shukla — authority (+ has `project.approve` → **oversight**).
- **Senior Research Associate (4):** Amritpal Kaur, Basant Goyal, Ketan Dagar, Khushi Gupta — authorities.
- **Consultant (3):** Ajay Sharma, Meetu Singh, Vijay Mishra — **requesters** (`project.create` only).
- **Employee (15):** Aman, Anant, Ankit, Arjun, Divyanshu, Drishti, Geetesh, Poorvi, Ragini, Rajesh,
  Ritik (Sr BD Exec), Ronak, Sugandh, Tanisha, Vandana — **requesters**.
- **HR (1):** Shaveta Sharma — **no project perms** (can't create *or* request).

`project.generate_pid` holders = SA/Admin/Manager/Sr Consultant/SRA. Oversight (sees/acts on ALL
matters) = Super Admin OR `project.approve` holder.

## Surface map (condensed)
**Web routes:** `/projects` (`ProjectsClient.tsx` — grid/list toggle, phase filter tabs, search
autocomplete, stats bar, **Generate PID** + **PID Requests** + **New Project** buttons, mounts
`NewProjectModal` + `PidRequestsModal`); `/projects/[id]` (`ProjectDetailClient.tsx` — header w/ PID
chip + type/client/phase/priority badges + patents, lifecycle buttons, stats, **client-state tab bar**
of 9–10 tabs `Overview·Task List·Timesheets·Board·Gantt·Files·Issues·Activity·Discussions` + `Capacity`
if `capacity.view`).
**Create flow (2 paths):** authority (`project.generate_pid`) → "Generate PID" → project created ACTIVE
w/ real PID, creator=MANAGER. Non-authority → **required "Request PID from" authority picker** →
project created ACTIVE w/ `code=null` (PID pending) + a `PidRequest` PENDING routed to that authority
(added MANAGER), requester=MEMBER; authority fulfils via `PidRequestsModal`.
**Key endpoints:** `POST /projects` (`project.create`), `POST /projects/generate-pid` +
`GET /projects/pid-requests` + `POST /projects/pid-requests/:id/fulfill` (`project.generate_pid`),
`GET /projects/pid-authorities` (`project.create`), `GET /projects` + `GET /projects/:id`
(**no `@RequirePermission`** — object-scoped via `ProjectAccessService` only), `PATCH /projects/:id` +
members + complete/close/reopen (`project.update`), approve/reject (`project.approve`, can't approve own
unless SA), `DELETE /projects/:id` (`project.delete` → ARCHIVED).
**PID mechanics:** `mintPid`/`claimPid` via `SequenceService` scoped by org + financial year →
`SQ_26_27_001`; `claimPid` validates shape, zero-pads, rejects clashes; `fulfillPidRequest` is race-safe
(atomic PENDING→FULFILLED). Auto-task templates per project type (`project-templates.ts`).
**Redaction:** `clientDueDate` hidden w/o `deadline.view.client`; `patents` stripped w/o `patent.view`;
`client`/`clientId` stripped w/o `patent.manage`. Org always from session.
**UI hotspots:** header button row + PID-count badge; `font-mono` PID chip / "PID pending"; **untruncated
detail `<h1>`** beside `shrink-0` action buttons; 9–10-tab `overflow-x-auto` bar; kanban fallback columns
+ index-0 catch-all; `NewProjectModal` 2-path branching + template preview; `window.confirm`/`alert()`
vs Toast inconsistency; AvatarStack; search autocomplete `z-50` panel.

## Tester → persona → lens
| # | Person | Role | Lens / focus |
|---|---|---|---|
| 1 | Mohit Kalra | Super Admin | Authority PID mint (NewProjectModal auth path + Generate PID) + full oversight surface |
| 2 | Yash Bhargava | Super Admin | Lifecycle (complete/close/reopen) + delete/archive + approve/reject SoD |
| 3 | Nitin Goel | Manager | PID Requests fulfil queue end-to-end + eligible-managers + manager detail actions |
| 4 | Neha Shukla | Senior Consultant | Oversight scoping (project.approve) — sees ALL? conflict-wall + list scoping |
| 5 | Ketan Dagar | Sr Research Assoc | Authority generate + create-with-PID + PID requests routed to an SRA |
| 6 | Amritpal Kaur | Sr Research Assoc | claimPid validation (shape/zero-pad/clash) + paste-vs-generate PID |
| 7 | Basant Goyal | Sr Research Assoc | Auto-task template generation (types→task lists, GENERAL, MONETIZATION coming-soon) |
| 8 | Khushi Gupta | Sr Research Assoc | Permission-matrix for Projects (button visibility vs server gate, per role) |
| 9 | Meetu Singh | Consultant | REQUESTER PID flow (request path, required assignee, PID-pending + PidRequest routed) |
| 10 | Vijay Mishra | Consultant | Membership scoping / conflict-wall + client/patent/deadline redaction on detail |
| 11 | Ajay Sharma | Consultant | Detail tabs as a member — which render, which 403 |
| 12 | Anant Gupta | Employee (intern) | Empty-DB / no-projects states (post-wipe) + first-run create |
| 13 | Aman Sharma | Employee (intern) | Loading + error states across list/detail/tabs (isError, silent failures) |
| 14 | Arjun Ghosh | Employee | Responsive / mobile (list grid→cards, tab-bar overflow, kanban 85vw, modal 390px) |
| 15 | Ankit Verma | Employee | Accessibility (modal focus-trap/aria, tabs, kanban DnD, icon buttons, contrast) |
| 16 | Divyanshu Saxena | Employee | Links / navigation (tab client-state, project links, deep-links, 404/deleted project) |
| 17 | Drishti Jain | Employee | Data correctness (progress rollup, avgCompletion, PID format/FY seq, counts, dates) |
| 18 | Geetesh Rathore | Employee (intern) | **UI/CSS-conflict + visual** (untruncated h1 vs shrink-0 btns, PID chip/badge overflow) |
| 19 | Poorvi Gupta | Employee (intern) | Render / perf (query fan-out, N+1 members/tasks, cache keys, kanban re-renders) |
| 20 | Ragini Kumari | Employee (intern) | Cross-card consistency (PID chip vs pending vs card vs detail; confirm/alert vs Toast) |
| 21 | Rajesh Joshi | Employee (intern) | Copy / microcopy (buttons, empty states, modal headings, errors, PID/type wording) |
| 22 | Ritik Sharma | Employee (Sr BD) | Non-delivery persona view of Projects (relevance; can a BD employee request a PID) |
| 23 | Ronak Khandelwal | Employee | Interaction / feedback (submit-disabled logic, optimistic kanban move+rollback, confirms) |
| 24 | Sugandh Raghav | Employee | Visual polish (spacing/alignment/icons/theme; badge/pill consistency) |
| 25 | Tanisha Jain | Employee (intern) | Edge / malformed data (6-digit PID, 120-char title, long client, 50 members, null client) |
| 26 | Vandana Boora | Employee | Suggestions / UX (what's missing: bulk, sort, requester PID-request status, search) |
| 27 | Shaveta Sharma | HR | **NO-ACCESS persona** — Projects properly hidden/gated? "HR can't create" question; leaks |
| 28 | (boundary) | — | Authz/IDOR (GET /projects no @RequirePermission, cross-tenant id, closed-write lock, SoD) |

## Progress log
- 2026-07-25: Round 1 (Projects) started. Roster verified. Surface mapped. Launching 28 tracing agents in cap-sized waves; visual pass + PID-handshake scenario to follow.

---
# FINDINGS
Severity: HIGH (broken/leak) · MED · LOW · UI (visual/UX) · SUGG. Each marked CONFIRMED (traced) or PLAUSIBLE.

## ⭐ Cross-agent convergent themes (headline)
1. **Dead approval surface + stale docs** (Mohit·Yash·Nitin·Khushi·Meetu·Anant) — CONFIRMED. `create()` always writes `ACTIVE` and never inserts an `Approval`; so `approve`/`reject`/`pendingApprovals`/`decide` are unreachable dead code, `eligibleManagers`/`managerId` are dead, and catalog + service comments still claim a "PENDING approval (D2)" gate that no longer exists. Remove the dead surface + fix comments. (Also: SoD carve-out would let a Super Admin self-approve if ever revived.)
2. **`PATCH …/projectPhase` is a side-door around the lifecycle state-machine AND the writability lock** (Yash) — **HIGH** CONFIRMED (`dto.ts:124`, `projects.service.ts:551-595`). `UpdateProjectDto.projectPhase` accepts all 8 phases incl. ARCHIVED/CANCELLED; `update()` writes it directly, leaving `deletedAt=null` → the project stays in `list()` AND `assertProjectWritable` only locks COMPLETED/CLOSED, so a "Cancelled/Archived" matter still accepts tasks/issues/**billable time**. Also bypasses PLANNING→COMPLETED guard + canonical events.
3. **Oversight detail/write path has NO org check (list does)** (Neha) — **HIGH** CONFIRMED (`project-access.module.ts:30-52` vs `projects.service.ts` by-id paths). `hasOversight` returns true for any `projectId` with no org param; every by-id get/mutate trusts only it → latent cross-org read+write IDOR (the controller already guards this for `list` only). Also: oversight = org-wide **write**, not just read (a Sr Consultant can close/re-staff any matter).
4. **Silent-failure + misleading error copy** (Aman·Divyanshu·Anant) — **HIGH** CONFIRMED. Detail tasks query ignores `isError` → a failed load looks like an empty project ("Add the first task"); the detail/list error branch shows **"Make sure the API server is running on port 4000"** for 403/404/deleted-project; Discussions/Capacity/Timesheets/Issues mutations + Generate-PID fail silently (no Toast; some `catch{}`/`alert()`).
5. **PID serial integrity** (Amritpal·Mohit·Nitin·Ketan) — **HIGH** (paste path) CONFIRMED. Pasted PID with a big serial (`SQ_26_27_999999`) permanently poisons the FY counter via `GREATEST` `ensureAtLeast` (no cap, runs outside the tx); serial `0` accepted (`SQ_26_27_000`); arbitrary/non-consecutive FY accepted; `create()` lacks the P2002 catch `fulfillPidRequest` has. **MED**: every Generate/Regenerate/toolbar click commits+burns a real serial → permanent gaps in formal client PIDs; toolbar-minted PID is unusable in the create flow (display-only) → guaranteed orphan.
6. **Two real CSS-conflict bugs invisible to logic tracing** (Geetesh·Arjun) — **HIGH/MED** CONFIRMED. (a) Project **search autocomplete is clipped away** — its `absolute` dropdown lives inside a `overflow-x-auto` row whose y-overflow computes to `auto`, clipping the panel; `z-50` can't escape (`ProjectsClient.tsx:218,322,334`). (b) Detail **`<h1>` has no `truncate` and its flex parent no `min-w-0`** → a long patent title collides with/ejects the `shrink-0` action buttons (clipped by `overflow-hidden` root) (`ProjectDetailClient.tsx:233,234,260,278`); also no `flex-wrap` on the action row (clips Complete/Edit/Add-Task for managers on phones).
7. **PID-request lifecycle has no correction path** (Meetu·Nitin) — CONFIRMED. Requester can't see their own pending request; no cancel/re-route (schema has `CANCELLED` but nothing sets it); a request is permanently orphaned if the nominated authority is deactivated (hard-bound `assigneeId`, no admin-sees-all, manager can't be removed); soft-deleted project leaves a PENDING request inflating the authority's badge + "fulfillable" onto a dead project.
8. **`project.view` is a vestigial permission** (Khushi·Neha·Vijay) — CONFIRMED. Neither `GET /projects` nor `/:id` enforces it (object-scoped only); it's checked solely in global search. Toggling it off doesn't stop a member reading. Defense-in-depth gap (no RBAC backstop if `assertProjectAccess` is ever dropped).
9. **Redaction is structured-only; unstructured identity leaks** (Vijay) — CONFIRMED. `title`/`description` are never redacted (a title naming the client/patent defeats the whole scheme); the **client code is baked into every patent handle** (`Pat_MLK_001`) and handles survive for any `patent.view` holder → cross-matter client correlation.
10. **Feedback/consistency fragmentation** (Ragini·Aman) — CONFIRMED. 5 feedback patterns (Toast / window.confirm / alert() / inline-`<p>` / nothing); 3 disagreeing priority color maps (HIGH is blue at project level, orange at task level); phase badge color ≠ row status-bar color (Active = blue badge next to red-orange bar); 3 PID-chip treatments (row omits it); canonical `Modal`/`Toast`/`PHASE_META`/`PRIORITY_META` exist but are only partially adopted.
11. **"Invalid Date" on project cards** (Anant·Aman) — **MED/UI** CONFIRMED. `ProjectCard.tsx:103` does `new Date(project.dueDate)` unguarded; no due date (common at creation) → renders literal "Invalid Date". Detail header guards it correctly with `formatDate`.
12. **Zero-projects shows a misleading "filter" empty state** (Anant) — **HIGH/UI** CONFIRMED. Only a `filtered.length===0` branch; a wiped workspace shows "No projects match your filter / try a different phase" + hides the create CTA (`ProjectsClient.tsx:251-259`). No first-run experience.
13. **Perf: heavy permission re-resolve + invalidation storm** (Poorvi) — **HIGH** CONFIRMED. `project.get()` re-runs the 4-join `getEffectivePermissions` ~4× per request (no request-scoped memo); every task move/checkbox fires a 6-key invalidation (incl. global `['tasks']`/`['projects']`/`['analytics-dashboard']`) forcing a full heavy `project.get`.

## Per-agent findings

### #1 Mohit (SA) — authority PID mint + oversight
- **MED** Generate/Regenerate/toolbar "Generate PID" each commit+burn a real serial (`sequence.service.ts:21-27`, `NewProjectModal.tsx:180`, `ProjectsClient.tsx:184`) → permanent gaps in formal PIDs; toolbar PID is unusable (modal PID box display-only) → guaranteed orphan. CONFIRMED.
- **MED** dead approval/oversight surface (see theme 1). CONFIRMED.
- **LOW** authority create not P2002-safe (unlike `fulfillPidRequest`); a project whose only member is offboarded drops off even SA's list (`list` scope has no fallback); UI requires projectType but DTO `@IsOptional`; no "clear PID" (only Regenerate, burns another); clipboard-copy failure swallowed (`catch{}`), toolbar flips to "copied" even on failure. `createdBy` sent as email then ignored; `GET /projects/next-pid` (non-committing peek) exists but modal never uses it (would fix the burn).

### #2 Yash (SA) — lifecycle + approve SoD
- **HIGH** PATCH projectPhase bypass (theme 2). CONFIRMED.
- **MED** closed/completed projects still accept new MEMBERS — `addMember`/`removeMember` never call `assertProjectWritable` (`projects.service.ts:760-800`). CONFIRMED.
- **MED** writability lock covers create only, not task edits/status moves/subtasks — you can still move cards on a "locked" project. CONFIRMED(create)/PLAUSIBLE(update).
- **MED** approve/reject dead + SA-self-approve SoD carve-out (theme 1). CONFIRMED.
- **LOW** soft-delete cascade incomplete (members/tasklists/timesheets/PENDING PidRequest left dangling); delete unrestricted by phase + irreversible (no restore route); complete()/close() guards miss IDEA/CANCELLED/ARCHIVED. DELETE endpoint has no UI trigger at all.

### #3 Nitin (Manager) — PID fulfil queue
- ✅ VERIFIED SOLID: queue scoping tight (`assigneeId`+PENDING, org from session); fulfil race genuinely safe (atomic `updateMany` + count guard + `code @unique` + P2002 map); requester→MEMBER + notify + clash handling correct.
- **MED** soft-deleted project's PID request lingers in queue + inflates badge + still "fulfillable" onto a dead project (`pidRequestsFor` has no `deletedAt` filter). CONFIRMED.
- **MED** request to inactive authority permanently stranded — no admin-sees-all, no re-route, `CANCELLED` never set. CONFIRMED.
- **LOW** serials burned outside the atomic guard; `claimPid` accepts any FY (`SQ_40_41_001`); Enter-to-submit ignores pending → double-fulfil spurious error; no polling on badge (30s stale); request `note` is dead both directions; `eligibleManagers` orphaned endpoint.

### #4 Neha (Sr Consultant) — oversight scoping
- **HIGH** oversight detail/write has no org check → latent cross-org read+write IDOR (theme 3). CONFIRMED asymmetry.
- **MED** oversight = org-wide WRITE (close/reopen/re-staff any matter), not just read — governance decision needed. CONFIRMED.
- **MED** patent handles survive client-name redaction for oversight viewers → cross-matter correlation; conflict-wall is all-or-nothing (no per-matter ethical screen). PLAUSIBLE/design-gap.
- **LOW** read routes have no `@RequirePermission` (no defense-in-depth); oversight list branch omits `isActive`.
- ✅ non-oversight actor cannot enumerate via `GET /:id` (assertProjectAccess before getRaw; no 403-vs-404 oracle).

### #5 Ketan (SRA authority)
- **MED** nominating an SRA as PID authority mints a MANAGER who **can't manage** the project (SRA lacks `project.update`/oversight) → project stuck; `removeMember` won't unseat the manager. SRA-unique. CONFIRMED.
- **SUGG** SRA's withheld `project.approve` is moot — projects go straight to ACTIVE, so a junior mints official matters with a real PID unchecked. CONFIRMED.
- ✅ authority wiring permission-consistent client↔server; fulfilment correctly scoped to assignee; no payload injection.

### #6 Amritpal (SRA) — claimPid/mintPid
- **HIGH** pasted big serial poisons FY sequence via `GREATEST` `ensureAtLeast`, outside the tx, irreversible (`projects.service.ts:261,272`, `sequence.service.ts:37-41`). CONFIRMED.
- **MED** paste path has zero client/DTO shape validation (no `@Matches`); serial `0` → `SQ_26_27_000`; arbitrary/non-consecutive/future FY accepted → orphan sequence scopes; `create()` lacks P2002 catch → raw 500 on TOCTOU. CONFIRMED.
- **LOW** orgCode interpolated into RegExp unescaped; global-unique code vs per-org scope + 'SQ' fallback (latent multi-org); `GET /projects/next-pid` ungated.
- ✅ generate path sound (atomic, IST-correct FY via `Asia/Kolkata`, canonicalising/zero-pad, lowercase/whitespace handled, cross-org-code rejected).

### #7 Basant (SRA) — auto-task templates
- **MED** MONETIZATION (coming-soon) is API-creatable (DTO `@IsIn` includes it) → live project with no tasks; validate against selectable-only. CONFIRMED.
- **MED** no GLOBAL workflow → generated tasks created with null `workflowId` AND null status (no crash, but status-less + unmovable). CONFIRMED.
- **LOW** GLOBAL workflow with no OPEN status → tasks born in `statuses[0]` (maybe a CLOSED column); zero statuses → workflowId set but null status; >1 GLOBAL workflow non-deterministic pick (no org filter).
- **SUGG** every typed project also gets an empty "General" list the preview never mentions; projectType required-in-UI but `@IsOptional`.
- ✅ templates correct for all 8 buildable types; ordering correct; preview can't drift (single `PROJECT_TYPES`); atomic, no missing-workflow crash.

### #8 Khushi (SRA) — permission matrix
- Full role×action matrix captured (SA/Admin full; Manager/SrC full minus delete; Consultant/Employee create+view only; **SRA = create+view+generate_pid, NO update**; HR none).
- **MED** `project.view` vestigial — enforced only in search (theme 8); approve/reject dead + stale comments (theme 1); SRA create+generate_pid-without-update strands owner (theme, dup #5); Delete has server capability but no client affordance.
- **LOW** client `can('project.update')` is global while server also needs `assertProjectAccess` — safe for seeded roles, breaks under custom grants; HR-can't-create/request is **intended** but member-vs-nav split is inconsistent; "Add Task" gated by phase not `task.create`.
- ✅ server soundly gated (every mutation pairs @RequirePermission + assertProjectAccess); no cross-role escalation/tenant leak in seeded matrix.

### #9 Meetu (Consultant) — requester PID path
- ✅ VERIFIED SOLID: no self-mint (single ternary gate), no non-authority/self/cross-org nomination (server re-validated).
- **MED** requester has NO view of their own pending request; request permanently orphaned if authority deactivated; no cancel/re-route (`CANCELLED` never set); nominated authority becomes MANAGER with no acceptance + can't be removed. CONFIRMED.
- **LOW** zero active authorities → requester can't create ANY project (single point of failure); PID-pending project is fully ACTIVE/usable (not a gate); stale `create()` JSDoc + dead `managerId`. Add server-side `pidAssigneeId !== creator.id` for defense-in-depth.

### #10 Vijay (Consultant) — redaction/conflict-wall
- **MED** free-text `title`/`description` bypass ALL redaction (theme 9); patent handle embeds raw client code exposed to every `patent.view` holder (theme 9). CONFIRMED/PLAUSIBLE.
- **LOW** `GET /:id` no `@RequirePermission` (safe today via assertProjectAccess); member emails exposed to co-members via `get()` (list omits them); `patent.manage` without `patent.view` → `client:null` (fails-closed).
- ✅ structured fields (client/clientId/clientDueDate) correctly stripped for a Consultant member in get() AND list(); membership scoping solid.

### #11 Ajay (Consultant) — detail tabs as member
- (report pending write-up; covered by Aman's silent-failure findings on tabs — Ajay's tab-by-tab gating results to be appended when reviewed.)

### #12 Anant (intern) — empty/first-run
- **HIGH** zero-projects → misleading "filter" empty state, hides create CTA (theme 12). CONFIRMED.
- **MED** ProjectCard "Invalid Date" on no-due-date projects (theme 11). CONFIRMED.
- **LOW** "PID pending" on card gives requester no next-step hint; requester dropdown silent dead-end if no authority; no first-run onboarding. Stale EMPLOYEE_CODES comment ("starts PENDING").
- ✅ all per-tab empty states inside a project are genuinely good (no NaN/crash); list stats render 0 cleanly.

### #13 Aman (intern) — loading/error
- **HIGH** tasks query ignores isError → failed load = empty project ("Add the first task"); detail/list error copy = "start API on port 4000" for 403/404/deleted; Discussions comments error = "No discussion yet". CONFIRMED (theme 4).
- **MED** org-list failure → "No projects match your filter"; Capacity tab reports any error as a permissions problem; Generate-PID silent unhandled rejection; Discussions post/delete + Issue/Timesheet delete swallow failures (`catch{}`); stat tiles render real-looking zeros during load/error.
- **LOW** Overview member add/remove uses `alert()`; Timesheets secondary queries unguarded; secondary queries swallow errors.
- **SUGG** branch error copy by HTTP status + don't retry deterministic 4xx; add isError branch everywhere; route every mutation catch through useToast.

### #14 Arjun (Employee) — responsive
- **UI/MED** detail action-button row has no `flex-wrap` → clips Complete/Edit/Add-Task for managers/admins at ≤360px; h1 no truncate + parent no min-w-0 (theme 6). CONFIRMED.
- **UI/MED** 9–10 tab bar scrolls but no affordance + `px-6` vs header `px-4 sm:px-6` misalignment on mobile; Gantt left pane fixed `w-60` eats 2/3 of a phone. CONFIRMED.
- **LOW** modal date fields stay 2-col on smallest screens; stats/filter pills lack shrink-0; header inner group no wrap at ≤320px for authorities.
- ✅ no horizontal body scroll; Kanban + modals (dvh) are model responsive; ProjectCard grid collapses correctly.

### #15 Ankit (Employee) — accessibility
- **HIGH** all 3 modals are non-dialogs — no `role=dialog`/`aria-modal`/`aria-labelledby`, no focus trap, no Escape, no focus return (`NewProjectModal:127`, `PidRequestsModal:21`, `EditProjectModal:73`). CONFIRMED.
- **MED** grid/list view toggles have NO accessible name; modal close + member-remove (opacity-0 until hover) title-only; tab bar no tab semantics; kanban DnD no keyboard path; form labels not associated (`htmlFor`) systemically; add-member/patent-search inputs unlabeled; search autocomplete missing combobox ARIA; pervasive `text-gray-400` fails AA contrast.
- **LOW** errors/busy states no `role=alert`/`aria-live`; donut/backdrop non-semantic; focus-ring 45%-alpha may fail 3:1.
- ✅ color-only meaning NOT found (phase/priority/status paired with text); ProjectRow is a real `<a>`; progress bars beside numeric %.

### #16 Divyanshu (Employee) — links/nav
- **MED** 403/404/deleted-project all render "Make sure the API server is running on port 4000" (theme 4); detail tabs are `useState` not routed → refresh/back/deep-link lose tab; List view uses raw `<a href>` (full reload) while grid/search use soft nav. CONFIRMED.
- **LOW** invalid id has no not-found boundary; modals add no history entry (Back exits page); Files tab `<a target=_blank>` can't silent-refresh/passcode on expired session.
- ✅ all in-app links resolve; back-to-list works; search includes CLOSED projects (findable).

### #17 Geetesh (intern) — UI/CSS-conflict
- **HIGH** search autocomplete clipped by `overflow-x-auto` parent (y→auto) (theme 6); detail h1 no truncate + parent no min-w-0 → collides/ejects buttons (theme 6). CONFIRMED.
- **MED** Kanban card title no clamp/break-words (grows/clips); tab bar `px-6` vs header `px-4` mobile misalignment; many-tab scroll bars no affordance. CONFIRMED.
- **LOW** badge cluster + font-mono code chip compound the h1 overflow; PID count badge ~2px into gap; AvatarStack block-in-inline nesting. PLAUSIBLE.
- ✅ avatar-bug class NOT reproduced here (Avatar used without layout className; wrappers use `hidden sm:flex`).

### #18 Poorvi (intern) — render/perf
- **HIGH** `project.get()` re-runs 4-join `getEffectivePermissions` ~4×/request (no memo), `list()` ~2×; every task move fires a 6-key invalidation storm incl. global keys → forces heavy `project.get` (theme 13). CONFIRMED.
- **MED** shared `['project',id]`/`['tasks',id]` keys re-declared per tab with mismatched staleTime → surprise background refetch of the heavy get; TimesheetsTab pulls the full `tasks.list` for a `{id,title}` dropdown; ProjectsClient recomputes map + 5 stat passes on every keystroke (no memo); KanbanBoard O(cols²×tasks) + full re-render on drag-over.
- **LOW** get() does an extra `patent.findMany` to re-derive client already included; handlers not memoized, tab children not React.memo.
- ✅ tabs conditionally mounted (no eager waterfall); list includes lean (members take:5); tasks query keepPreviousData.

### #17b Drishti (Employee) — data correctness
- **HIGH** list cards/rows **undercount members** — `list()` selects `members take:5` and `_count` omits `members`, so `memberCount` falls to `members.length` (≤5); a 10-member project shows 5 + "+1" instead of "+6" (`projects.service.ts:433-441`, `ProjectCard.tsx:88`). CONFIRMED.
- **MED** ProjectCard due date bypasses UTC-safe `formatDate` → "Invalid Date" (null due) + off-by-one in negative-offset zones (`ProjectCard.tsx:103`). CONFIRMED. (dup theme 11.)
- **LOW** detail "X members" uses unfiltered `_count.members` (latent if soft-deactivate added); CLOSED-type status = 100% regardless of terminal reason (a "Cancelled" column seeded CLOSED inflates progress); `UpdateProjectDto.completionPercentage` accepted but ignored.
- ✅ VERIFIED CORRECT: M2M rollup averages each parent independently + clamped 0–100 (DTO `@Min0@Max100`); date-order validation fires on create AND edit; lifecycle stamps consistent; PID/FY IST-bucketed; avgCompletion NaN-guarded; donut math correct. (Note: list has no "avg completion" pill — that's analytics only.)

### #23 Ritik (Sr BD Exec) — non-delivery persona
- **MED** BD lands on a permanently empty list with the misleading "filter" empty-state (dup theme 12); requesting a project **conscripts a delivery lead as MANAGER** of a BD record + demotes BD to member (`projects.service.ts:107-108`); **confidential patent/client picker visible to every Employee** incl. BD (`patent.view` in VIEW_BASICS) → enumerate coded client roster via "New Project" (real numbers stay hidden, handles+client-code prefixes don't). CONFIRMED.
- **SUGG** no BD/pipeline/lead concept — module is delivery-only; projectType required forces BD to mis-file under a delivery taxonomy. Stale "starts PENDING approval" comment vs actual ACTIVE.
- **CONFIRMED** the create/request boundary: BD(Employee) CAN create; HR CANNOT — but BD is mis-scoped as a junior delivery requester.

### #24 Ronak (Employee) — interaction/feedback
- **HIGH** top-bar **Generate PID swallows all errors** (`try/finally` no catch, no global RQ error handler) → click does nothing visibly on failure + unhandled rejection (`ProjectsClient.tsx:101-111`). CONFIRMED.
- **MED** Kanban optimistic move has **no true rollback** (only a refetch in `finally`; if that also fails the card is stuck in the wrong column); PID-request Assign **double-submits via Enter** (button guarded, `onKeyDown` not); add/remove member uses `alert()` + no success toast; no per-task pending lock (spam status → overlapping `setStatus`). CONFIRMED/PLAUSIBLE.
- **LOW** create/request + Assign-PID show no success toast; Cancel/✕ not disabled during in-flight (mutates unmounted component); optimistic move patches `currentStatus` not `currentWorkflowStatusId` (list select snaps back); failed add-member can't retry same person (uncontrolled select).
- ✅ heavy mutations (edit, lifecycle) are model citizens (disable-on-pending + confirm + dual toasts).

### #25 Sugandh (Employee) — visual polish
- **UI** the `accent` orange token `#fe841f` is used **zero** times; a rogue `#E8533A` red-orange is hardcoded 5× doing 4 unrelated jobs + mislabeled "ACCENT" (`ProjectsClient.tsx:29`, `ProjectDetailClient.tsx:366,663`, `GanttView.tsx:14`, `KanbanBoard.tsx:23`). CONFIRMED.
- **UI** phase badge color ≠ status-dot color (Active = blue pill + red-orange rail; Planning = yellow badge + generic-blue dot, not brand); 3 disagreeing priority maps (HIGH blue vs orange); progress drawn 4 ways (gradient card / flat-red detail / blue kanban / none in row); On-Hold amber-vs-orange. CONFIRMED (dup theme 10).
- **UI** 3 modals inconsistent (radius 2xl vs xl, backdrop /40+blur vs /30, header px/title-size/case, close-button hit-area, 3 focus-ring widths); 4 empty-state treatments; no icon-size scale (13/14/15 interchangeably); dead `.replace('bg-','bg-')` no-op.

### #27 Vandana (Employee) — suggestions (top 10)
- **SUGG (high)** filter by type/client/priority (only phase today); sort options (none — can't sort by due date); project health/at-risk signals (overdue/near-deadline badges — costliest KPO event, unflagged); **"My projects" vs "All" toggle** (list shows entire org book to an Employee).
- **SUGG (med-high)** requester-side PID-request status view (dup); show client + group-by-client on list/card (client only on detail); export CSV; bulk actions (multi-select); clickable stat pills + persisted filters; first-run onboarding + title-hover + tab-overflow polish.
- **Verdict:** functionally past-MVP (lifecycle, 10 tabs, PID workflow, templates) but built to open ONE project, not triage a hundred — sorting/faceted-filter/at-risk/my-vs-all are the maturity jumps.

### #21 Rajesh (intern) — copy/microcopy
- **BUG** hardcoded plurals ("1 tasks/members/projects/active") — `plural()` helper exists but unused (`ProjectsClient.tsx:152,376`, `ProjectDetailClient.tsx:338,342`); PID-request row prints **raw type enum** ("REVERSE_ENGINEERING" not "Reverse Engineering", `PidRequestsModal.tsx:78`); card date uses `en-US` + "Invalid Date" (dup); dev-facing "Make sure the API server is running on port 4000" shown to users (`ProjectsClient.tsx:248`, `ProjectDetailClient.tsx:209`); API-internals jargon in Edit help text. CONFIRMED.
- **SUGG** terminology drift "PID" vs "Project ID" (mixed in one sentence); Title-vs-sentence case across New/Edit modals; "Add task" has 4 variants; ellipsis "…" vs "..."; American vs British spelling in templates ("Monetization"/"programme"); patent "Patent ID" vs "Patent" noun drift.
- ✅ nouns consistent (project/client, no "matter/customer" mixups); type labels render friendly everywhere except the one raw PID-queue spot.

### #26 Tanisha (intern) — edge/malformed data
- **MED** ProjectCard "Invalid Date" on no-due-date (dup theme 11); `description` has **no `@MaxLength`** → multi-KB blob renders untruncated in the detail header (`max-w-xl` no line-clamp) pushing content down; an **outlier task date detonates the Gantt** — `totalDays` uncapped → `9999-12-31` task = ~millions of px + ~100k-iter month loop + ~400k weekLines array → browser freeze/OOM. CONFIRMED.
- **LOW** no client-side `maxLength` on title/description inputs (raw 400 after typing 120 chars); donut `strokeDasharray` + %-labels not clamped (defended by DTO+rollup, defense-in-depth only); long client name can overflow the badge cluster (no truncate); Kanban card progress width not clamped; 7-digit PID serial latent inconsistency.
- ✅ VERIFIED DEFENDED: empty/whitespace title (MinLength+trim+disabled), null lastName (null-safe everywhere), null client/patents (guarded + server-stripped), phase/priority `@IsIn`. Note ProjectCard/Row/Search have no PHASE_META fallback (safe only because all 8 phases map).

### #11 Ajay (Consultant) — detail tabs as member
- **HIGH** **Files tab list endpoint is NOT membership-gated → cross-matter file-list IDOR** — `documents.service.ts:246` `listForProject()` only checks the project exists, never `assertProjectAccess`; controller gates only `document.view` (held org-wide). A Consultant can `GET /projects/:anyId/documents` for a matter they're NOT on and enumerate every file's **name, task title, uploader, size** (bytes stay protected via `getContent`→`assertMayRead`, but for a patent firm the **filenames/task-titles ARE the conflict-wall breach** — and a patent doc's filename can itself be a confidential real number). Sibling lists (timesheets/issues/comments/activity) all enforce membership — Files is the lone outlier. Fix: `assertProjectAccess` at the top of `listForProject`. CONFIRMED.
- **MED** Timesheets tab shows a Delete button on **every** row incl. others' — server correctly 403s (owner-or-SA) but `deleteEntry` swallows it (`catch{}`) → silent no-op (`TimesheetsTab.tsx:190,53`). Gate the button on ownership + surface the error.
- **LOW** "Log Time" button ungated (works for Consultant, 403s a view-only role); a Consultant can't delete even their own Discussion message (lacks `comment.delete`); 403 = "server down" copy (dup theme 4).
- ✅ VERIFIED: every tab renders for a member, none wrongly 403/crash; **Capacity tab correctly double-gated** (client `capacity.view` + endpoint); Overview member/lifecycle actions gated; clientDueDate/client redacted; tab-switch has no stale/refetch bug. PLAUSIBLE cross-persona: `comments.softDelete` checks perm but not authorship (a `comment.delete` holder can delete anyone's message).

### #27b Shaveta (HR) — no-access persona
- ✅ **VERIFIED LEAK-TIGHT**: sidebar hides Projects; `GET /projects`→`[]` (membership scope, no crash); `GET /projects/:id`→403; Home cards all self-gate to null; global search 0 hits; analytics object-scoped→0; capacity 403; notifications route only to authority/requester/members. HR sees NO project data anywhere. CONFIRMED clean.
- **MED** 403 on a shared link shows "server down" copy (dup theme 4); reads gated by **membership not `project.view`** — so if a manager `addMember`s HR, HR silently gains full read of that matter despite zero project perms (RBAC-vs-real-gate divergence). CONFIRMED.
- **LOW** HR can load `/projects` directly to a dead "No projects match your filter" page (nav hidden, URL works); `GET /projects/next-pid` ungated → any user reads the FY serial counter.
- **SUGG/product** HR is the ONLY non-admin role that can't even **request** a project (interns can) — deliberate per HR_CODES comment, but a real policy call (HR may need internal people-ops projects). Escalate.

### #28 boundary — API-layer authz / IDOR
- **HIGH** oversight object-gate is **org-blind on every single-object path** (`get`/`update`/complete/close/reopen/members/`decide`) — `hasOversight` + `getRaw` have no org filter, so an oversight actor (SA / any `project.approve` holder) can read+mutate another org's project by id; `list` IS scoped (the asymmetry). `decide()` skips `assertProjectAccess` entirely. Bounded by single-org deploy today, but zero tenant boundary in code. CONFIRMED (code) / PLAUSIBLE (exploit).
- **MED** closed/completed **write-lock incomplete** — `assertProjectWritable` guards only create paths; ABSENT from task `update`/`setStatus`/`setAssignees` (auto-adds members!)/`softDelete`, issue `update`, project `addMember`/`removeMember`. Cards can be moved, tasks reassigned/deleted, staff added on a "locked" matter. CONFIRMED.
- **MED** `GET /projects` + `/:id` never check `project.view` (opt-in guard, no decorator) — a member whose role has `project.view` revoked still reads via the API. CONFIRMED.
- ✅ VERIFIED BLOCKED (good): no 403-vs-404 oracle for regular users; org always from session (client `?organizationId` ignored); mutating soft-deleted/ARCHIVED → 404; cross-org member add validated.

## ROUND 1 (Projects) — 28/28 tracing agents COMPLETE (2026-07-25)
Adversarial cross-corroboration already high (e.g. the org-blind oversight IDOR independently found by Neha #4 + boundary #28; the dead-approval surface by 6 agents; "Invalid Date" by 4; the h1/search-autocomplete CSS bugs by Geetesh #17 + Arjun #14). Live Playwright pass: logged in as Super Admin, confirmed app renders (empty DB). Next: fix the confirmed root-cause defects (priority order below) + re-verify + web/api typecheck.

### Fix priority (confirmed, root-cause)
**P0 (confidentiality/integrity, patent-KPO critical):**
1. Files list IDOR — add `assertProjectAccess` in `documents.service.ts listForProject` (Ajay #11).
2. Oversight org-blind object gate — pass session org into `assertProjectAccess`/`getRaw`, require project.org == session org even for oversight (Neha #4, boundary #28).
3. `PATCH …/projectPhase` state-machine + writability bypass — restrict phase-set to the lifecycle methods (or reject terminal phases via PATCH) + soft-delete on ARCHIVE/CANCEL (Yash #2).
4. Paste-PID sequence poisoning + serial-0 + arbitrary-FY + missing P2002 catch — cap serial proximity, `serial>=1`, consecutive-FY check, `@Matches` DTO + mirror `fulfillPidRequest` P2002 catch (Amritpal #6).
5. Close the write-lock gaps — `assertProjectWritable` on task update/setStatus/setAssignees/softDelete, issue update, member add/remove (boundary #28, Yash #2).

**P1 (broken/silent-failure UX):**
6. Detail error copy: branch 403/404/network instead of "port 4000"; don't retry deterministic 4xx (Aman #13, Divyanshu #16, Ajay, Shaveta).
7. Add `isError` branches (tasks/discussions/org-list) + route every mutation catch through `useToast` (kill `alert()`/`catch{}`/silent Generate-PID) (Aman #13, Ronak #24).
8. "Invalid Date" + member undercount on cards — use `formatDate` + fix `list()` `_count.members` (Drishti #17b, Anant #12, Tanisha #26).
9. Zero-projects first-run state (vs "filter") + create CTA (Anant #12, Ritik #23, Vandana #27).
10. The two CSS bugs — detail `<h1>` `truncate`+`min-w-0`+`flex-wrap` on the action row; search autocomplete `overflow` clip (Geetesh #17, Arjun #14).
11. Remove dead approval surface + fix stale comments (6 agents); PID-request lifecycle (requester status view / cancel / re-route / offboarded-authority) (Meetu #9, Nitin #3).

**P2 (polish/consistency/perf/a11y/suggestions):** modal dialog semantics + focus trap (Ankit #15); unify feedback/priority-color/modal/PID-chip (Ragini #20, Sugandh #25); perf memo + narrow invalidation (Poorvi #18); pluralization/terminology/enum-label copy (Rajesh #21); Gantt date-span + description `@MaxLength` clamp (Tanisha #26); product decisions flagged (HR-can't-request, oversight=org-write, SRA-manager-can't-manage, patent.view in VIEW_BASICS for BD).

## FIXES APPLIED (2026-07-25) — verified (API + web `tsc --noEmit` clean)
**P0 confidentiality/integrity (backend):**
- Files-list IDOR closed — `assertProjectAccess` at the top of `documents.service.listForProject`.
- Oversight org-blind object gate — `withinTenant` tenant boundary added to `canAccessProject`/`canAccessTask`/`assertIssueAccess` (oversight now bounded to the actor's own org).
- `PATCH …/projectPhase` bypass — `update()` rejects moving to COMPLETED/CLOSED/ARCHIVED/CANCELLED (must use the lifecycle actions / delete).
- Paste-PID hardening — `claimPid` now enforces serial ≥ 1, consecutive FY, a proximity cap (≤ current+1000), escaped org-code regex; `@Matches` on the PID DTO(s); `create()` catches P2002 like `fulfillPidRequest`.
- Closed-matter write-lock — new `assertTaskWritable` on task update/setStatus/setAssignees/softDelete + `assertProjectWritable` on issue update + project addMember.
- Coming-soon type guard (MONETIZATION rejected server-side); member-undercount `_count.members`; `description` `@MaxLength(2000)`; accurate `create()` doc.

**P1 silent-failure/UX (web):**
- ProjectCard "Invalid Date" → `formatDate` (+ title hover); member count now real (backend `_count`).
- Detail + list error copy: honest "moved / no access" / "refresh" instead of "port 4000".
- Detail header overflow — h1 `truncate` + parent `min-w-0 flex-1` + row `flex-wrap`; description `line-clamp-2`; tab-bar `px-4 sm:px-6`.
- Search autocomplete clip — filter row `overflow-x-auto` → `flex-wrap` (no more y-clip).
- First-run empty state (`projects.length===0`) with a **New Project** CTA, distinct from the filter-mismatch state.
- Mutation feedback via toast: Generate-PID (was silent), member add/remove (was `alert()`), discussion post/delete, issue delete, timesheet delete (were `catch{}`); Timesheets delete button now owner-only; PID-request Enter double-submit guarded; Gantt date-span clamped (~10y) to stop the runaway.

**Deferred (larger refactors / features — identified, NOT shipped this pass):** remove the dead approval endpoints (inert, non-breaking); modal dialog a11y (focus-trap/aria); design-system unification (one priority-color map, one modal, PID-chip, avatars); perf (request-scoped permission memo + narrower task invalidation); sort/filter/at-risk/export/bulk features; requester-side PID-request status view.

**Product decisions (flagged, behavior UNCHANGED pending sign-off):** HR can't create/request a project; oversight = org-wide *write*; SRA-as-PID-authority becomes a MANAGER who can't manage; `patent.view` in VIEW_BASICS exposes the coded client roster to every Employee.
