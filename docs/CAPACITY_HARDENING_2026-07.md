# Capacity feature — production hardening audit (2026-07-13)

Deep audit of the Team Capacity feature (and the endpoints added alongside it) for
security, edge cases, and correctness. Every finding below is fixed at the root, not
patched. Verified end-to-end against the running app: **15/15 security + edge checks**,
plus **32/32** no-regression on the full capacity/deadline/overdue/approval suite.

## Findings & fixes

| # | Severity | Finding | Root cause | Fix |
|---|---|---|---|---|
| C1 | **Critical** | `GET /capacity/team` took `organizationId` from the query string — a user could pass another org's id and read its entire team, tasks and names (cross-tenant IDOR). | Org identity was trusted from the client. | Org is now derived from the **session** via the new `ActorContextService.requireOrgId()`. The query param is gone. A spoofed id is impossible — verified it returns the caller's own org. |
| C2 | High | `?days=abc` → `parseInt` = NaN → `addDays(today, NaN)` = Invalid Date → the whole board silently broke; `?days=100000` forced a huge computation. | No validation of the horizon. | `parseHorizon()` coerces + clamps to [5, 60], defaulting to 14. Verified for `abc`, `-5`, `100000`, empty. |
| C3 | Med (DoS) | A `LeaveRequest` whose `endDate` is far in the future (bad data) made the day-expansion loop iterate millions of times before the in-loop `continue` skipped each day. | Loop bounds were the raw leave range, not the visible window. | Iteration is clamped to `[today, windowEnd]` **before** looping. |
| C4 | Med (correctness) | A task that only *starts* after the visible window fell through to the day-1 fallback and dumped its whole load onto today — people looked busy for work that hadn't begun. | The "no span in window" fallback didn't distinguish future-start from overdue. | Tasks starting on/after the window end now contribute nothing; the day-1 fallback is reserved for overdue/same-day work. |
| C5 | Low (perf) | `workingDaysFor(userId)` (filter over the whole window) was recomputed once per task — O(tasks × window). | No memoisation. | Cached per user for the request. |
| C6 | — (feature) | Capacity was only reachable from the sidebar. | — | Added `GET /capacity/project/:id` and a **Capacity tab on the project page** (perm-gated, `capacity.view`), showing that project's members' availability across all their projects. Shared grid extracted to `components/capacity/grid.tsx` (no duplication). |
| C7 | High | `GET /projects/eligible-managers` and `/projects/pending-approvals` (added with the intern flow) also took `organizationId` from the query. | Same as C1. | Both now derive org from the session. |

## Confirmed correct (checked, no change needed)

- **Client deadline never leaks through capacity** — the query selects only `dueDate`; the payload has no `clientDueDate` key. Verified.
- **Permission gate** — `capacity.view` required on every capacity route; an employee gets 403 on both the team and project endpoints. Verified.
- **Cross-tenant project id** on `/capacity/project/:id` returns 404 (scoped through project membership), not a leak. Verified.
- **Division-by-zero / empty inputs** — `perDay` divisor is guaranteed ≥1; `utilization` guards `capacityHours === 0`; a project with no members yields an empty board, not a crash.
- **Hierarchy** — capacity.view is held by Manager, Senior Consultant, Admin, Super Admin (Employee/Consultant/HR denied), matching "managers see availability to assign work; admins see everything." Cross-project task visibility is intended for those roles.

## Architectural addition

`apps/api/src/common/context/actor-context.service.ts` — a `@Global` service that resolves
the actor's org from the verified session (cached). This is the single source of truth for
"which org is this request in," replacing client-supplied `organizationId` for every
endpoint that has been migrated to it (capacity + the project-request endpoints).

See `ARCHITECTURE.md` §11 (capacity engine) and §12 (multi-tenancy & the org-identity rule,
including the list of pre-existing endpoints still to migrate before going multi-org).
