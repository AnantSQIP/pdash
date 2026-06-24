# Architecture — pdash (Zoho-Projects-style Internal Platform)

> Source of truth for engineering decisions. Last revised after comparing
> `ARCHITECTURE.md` (session-derived, Zoho-based) against five frozen spec
> documents in `/performance dashboard final docx/`.
>
> **Decision:** The user's frozen specs govern all domain/data-model decisions.
> The NestJS + Prisma + PostgreSQL + Redis tech stack is unchanged.

---

## 1. Architecture decision record

### What changed vs the previous ARCHITECTURE.md

| Dimension | Old (Zoho-derived) | New (Frozen specs — winner) |
|---|---|---|
| **Tenancy root** | `Portal` (multi-tenant) | `Organization` (single-org) |
| **portalId everywhere** | Every table | Dropped; single-org has no tenant key |
| **Roles** | `UserRole` enum (ADMIN/MANAGER/EMPLOYEE/CONTRACTOR) | `Role` + `Permission` + `PermissionGroup` + `PermissionOverride` (4-layer RBAC) |
| **Permission format** | Hardcoded `role === ADMIN` checks | `resource.action.scope` strings (e.g. `project.approve`, `task.edit`, `analytics.view.department`) |
| **Task ownership** | `task.projectId` FK (1 project) | `ProjectTask` join table (task ∈ many projects) |
| **Subtask model** | Recursive self-join, depth 0–6 | Flat `Subtask` table (1 level, per frozen ERD) |
| **Status/workflow** | `CustomStatus` + hardcoded enums (`ApprovalStatus`, `MilestoneStatus`) | Config-driven `Workflow` + `WorkflowStatus` + `WorkflowTransition` |
| **D2 approval** | `project.approvalStatus` field + hardcoded `assertAdmin()` | Generic `Approval` + `ApprovalAction` entities |
| **D1 milestone rollup** | Hardcoded `RollupService` | `AutomationRule` (trigger: task_completed → check milestone) |
| **Comment** | Task-specific `Comment.taskId` | Polymorphic `Comment(entityType, entityId)` |
| **Soft deletes** | Hard deletes | `deletedAt` on every mutable entity |
| **Audit trail** | None | Immutable `AuditLog` (never deleted per NFR) |
| **Org structure** | `ProjectGroup` (Zoho portal groups) | `Department` + `DepartmentMember` + `Team` + `TeamMember` |
| **Extra modules** | Zoho scope only | Attendance, LeaveRequest, Timesheet (per DRS v1) |

### What stayed the same

- **Tech stack**: TypeScript, NestJS, Prisma + raw SQL, PostgreSQL 16+, Redis, BullMQ, Socket.IO, S3/MinIO
- **Prompt.md UI features**: All 40 requirements from prompt.md remain in scope
- **D3**: Status-only colors — now on `WorkflowStatus.colorHex`
- **D6**: Waterfall WBS only (no sprints)
- **"General" task list invariant**: Auto-created on project creation, cannot be deleted
- **Milestone + TaskList**: Added to schema (not in frozen ERD, but required by prompt.md UI spec)

---

## 2. Stack

| Layer | Choice |
|---|---|
| Language | TypeScript (frontend + backend) |
| Frontend | Next.js (React) + TanStack Query + Zustand + dnd-kit |
| Backend | NestJS (Module/Guard/Interceptor maps to DDD module boundaries) |
| DB | PostgreSQL 16+ (recursive CTEs, JSONB, window functions) |
| ORM | Prisma (CRUD) + raw SQL (graph/scheduling queries) |
| Jobs | BullMQ + Redis (SLA timers, automations, search indexing, webhooks) |
| Real-time | Socket.IO (feed, board updates, notifications) |
| Cache | Redis (permission cache, rate limits, Socket.IO adapter) |
| Search | PostgreSQL FTS (MVP) → OpenSearch (later) |
| Files | S3 / MinIO |
| Auth | AWS Cognito + JWT (per Architecture_Specification_v1) |

---

## 3. Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│  Next.js client                                                  │
│  Nav: Home · Feed · Discuss · Reports · Calendar · Projects      │
│  Views: List · Kanban (dnd-kit) · Gantt (custom) · Calendar      │
└─────────────┬───────────────────────────────┬───────────────────┘
              │ REST + WebSocket               │
┌─────────────▼───────────────────────────────▼───────────────────┐
│  NestJS API                                                       │
│  Guards:       AuthGuard → PermissionGuard (4-layer RBAC)        │
│  Interceptors: AuditInterceptor · ActivityInterceptor            │
│  Modules: projects · tasks · milestones · tasklists · issues     │
│           users · departments · teams · workflows · approvals    │
│           documents · search · analytics · dashboard · feed      │
│           attendance · timesheets · leaves · automation          │
├───────────────────────────────────────────────────────────────────┤
│  Domain services                                                  │
│  • PermissionService  — resolves 4-layer RBAC per request         │
│  • WorkflowEngine     — evaluates transitions + conditions        │
│  • SchedulingEngine   — CPM + dependency reschedule (Phase 4)     │
│  • AutomationEngine   — rule evaluator + SLA timers + DLQ        │
├───────────────────────────────────────────────────────────────────┤
│  Data layer                                                       │
│  PostgreSQL · Prisma (CRUD) · raw SQL (graph queries)            │
│  Redis · BullMQ workers · S3/MinIO                               │
└───────────────────────────────────────────────────────────────────┘
```

---

## 4. Data model overview

Full schema in `packages/db/prisma/schema.prisma`. Domain map (22 domains per frozen ERD + prompt.md additions):

| # | Domain | Key entities |
|---|---|---|
| 1 | Organization | Organization |
| 2 | Identity | User, UserManager |
| 3 | Org Structure | Department, DepartmentMember, Team, TeamMember |
| 4 | Security | Role, UserRole, Permission, RolePermission, UserPermission, PermissionGroup, PermissionGroupMember, PermissionGroupPermission, PermissionOverride |
| 5 | Workflow | Workflow, WorkflowStatus, WorkflowTransition |
| 6 | Project | Project, ProjectMember, ProjectDepartment, ProjectTeam |
| 7 | Task | Task, ProjectTask (M2M), TaskAssignee, Subtask (flat), SubtaskAssignee, TaskDependency (FS/SS/SF/FF), Checklist |
| 7a | *Milestone* | Milestone *(prompt.md addition)* |
| 7b | *TaskList* | TaskList *(prompt.md addition, "General" invariant)* |
| 8 | Comment | Comment (polymorphic entity_type + entity_id) |
| 9 | Approval | Approval, ApprovalAction (polymorphic) |
| 10 | Attendance | Attendance, LeaveRequest |
| 11 | Time | Timesheet |
| 12 | Document | Folder, Document, DocumentVersion, ProjectDocument, TaskDocument |
| 13 | Search | SearchIndex |
| 14 | Analytics | AnalyticsEvent, AnalyticsSnapshot |
| 15 | Dashboard | Dashboard, DashboardWidget |
| 16 | Metadata | Tag, CustomField, CustomFieldValue |
| 17 | Automation | AutomationRule |
| 18 | Activity | Activity |
| 19 | Notification | Notification |
| 20 | Audit | AuditLog (immutable, never deleted) |
| 21 | Integration | Integration |

**Key modeling decisions:**

| Decision | Rationale |
|---|---|
| `ProjectTask` join table (task ↔ project M2M) | DRS v1: "Tasks can belong to multiple projects" |
| Flat `Subtask` table (not recursive) | Frozen ERD v2.0; 1-level sub-tasks only |
| `workflow_id` + `currentWorkflowStatusId` on Project/Task/Milestone | Config-driven engine; no hardcoded state machines |
| Generic `Approval(entityType, entityId)` | Covers project approval, document approval, leave approval, etc. |
| Generic `Comment(entityType, entityId)` | Attach to any entity without schema changes |
| `deleted_at` on all mutable entities | NFR: soft deletes everywhere |
| `AuditLog` with `Restrict` delete | NFR: audit records are immutable and never deleted |
| Permission resolution: DENY Override > ALLOW Override > Direct User > Group > Role > DENY | Permission_Matrix_Specification_v1 §6 |

---

## 5. Permission model

Format: `resource.action.scope`

Examples: `project.create`, `project.approve`, `task.edit`, `task.view.team`,
`analytics.view.department`, `attendance.view.organization`

Resolution order (first match wins):
1. DENY override → denied
2. ALLOW override → allowed
3. Direct user permission → allowed
4. Permission group membership → allowed
5. Role permission → allowed
6. Default → denied

Scopes: SELF · TEAM · DEPARTMENT · ORGANIZATION

Built-in roles: Employee, Team Lead, Department Head, HR, Project Manager, Admin, Super Admin

---

## 6. Workflow engine

- Config-driven; no hardcoded transitions
- `Workflow` → many `WorkflowStatus` (nodes) → many `WorkflowTransition` (edges)
- Each transition carries `conditions` (JSON) and `allowedRoles` (JSON)
- `WorkflowStatus.colorHex` carries the display color (D3: status-only colors)
- Projects, Tasks, and Milestones each carry `workflowId` + `currentWorkflowStatusId`
- Project lifecycle: Draft → Pending Approval → Approved → Active → Completed → Archived
- Task lifecycle: Draft → Assigned → In Progress → Review → Completed (→ Reopened)

---

## 7. Design decisions

| # | Decision | Value |
|---|---|---|
| D1 | Milestone auto-complete | Implemented as AutomationRule, not hardcoded service |
| D2 | Project approval | Generic `Approval` + `ApprovalAction` entities |
| D3 | Status colors | `WorkflowStatus.colorHex` only (no per-task color picker) |
| D4 | API format | Clean greenfield REST (not Zoho V3 wire format) |
| D5 | ORM | Prisma + raw SQL for graph queries |
| D6 | Methodology | Waterfall WBS only |

---

## 8. NFR targets (Non-Functional Requirements v1.0)

| Metric | Target |
|---|---|
| Availability | 99.5% (< 4 hrs downtime/month) |
| Page load | < 2s (max 5s) |
| Search | < 1s |
| Dashboard | < 3s |
| Complex reports | < 15s |
| Users | 50–500 initial; 1000+ without major redesign |
| Unit test coverage | 80%+ |
| Log retention | 90 days |
| DB/doc backup | Daily, 30-day retention |

---

## 9. Build roadmap

| # | Milestone | Contents |
|---|---|---|
| M0 | Foundation | Monorepo, Docker, Prisma schema (all 22 domains), auth skeleton, CI |
| M1 | Core hierarchy | Organization → Project → TaskList → Task → Subtask APIs; "General" invariant; WorkflowStatus; Approval flow (D2) |
| M2 | List + Kanban | List view (group/sort), Kanban (dnd-kit), status transitions via workflow |
| M3 | Milestones + TaskLists | Full milestone lifecycle; TaskList CRUD; ProjectTask M2M |
| M4 | Home (Personal) | Count cards, task widgets, Dashboard + DashboardWidget |
| M5 | Permission system | PermissionGuard (4-layer RBAC); permission cache (Redis) |
| M6 | Scheduling | Dependencies (FS/SS/SF/FF), SchedulingEngine (CPM + business hours), Gantt |
| M7 | Issues + Time | Issue module (severity/reporter), Timesheet, Attendance, Leave |
| M8 | Automation | AutomationRule engine (D1 rollup, SLA timers, BullMQ), Webhooks |
| M9 | Reports + Feed | Resource utilization, Activity Feed (Socket.IO), Analytics snapshots |

---

## 10. Repo structure

```
pdash/
├─ apps/
│  ├─ web/                 # Next.js
│  └─ api/                 # NestJS
│     └─ src/modules/
│        ├─ organization/  projects/  tasks/  milestones/  tasklists/
│        ├─ users/  departments/  teams/
│        ├─ workflows/  approvals/  permissions/
│        ├─ documents/  search/  analytics/  dashboard/
│        ├─ attendance/  timesheets/  leaves/
│        ├─ automation/  feed/  notifications/
│        └─ audit/
├─ packages/
│  ├─ db/                  # Prisma schema + migrations
│  ├─ types/               # shared TS types
│  └─ config/
├─ workers/                # BullMQ processors
├─ tools/                  # smoke tests, dev scripts
└─ docker-compose.yml
```
