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
  - ☐ Batch 2 — Patents (portal, client codes, register, upload-to-create, reveal, passcode, docs, confidentiality) — P1 + non-super-admin
  - ☐ Batch 3 — Performance (metric correctness, per-user vs org-wide, formulas, authz, empty-data, working-hours impact)
- **Phase 2 — Full system**
  - ☐ Batch 4 — Attendance + Leave + Comp-off + WFH + Timesheets(new PID/buffer) + Capacity(offices/pending leaves)
  - ☐ Batch 5 — Discuss + Calendar + Channels + Notifications + HR (announcements/policies/appraisals/org chart)
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

_(next batches append below)_
