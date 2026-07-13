-- Suppress the historical overdue backlog the first time the overdue monitor runs.
--
-- OverdueMonitorService alerts the assignee, the project's managers and the org admins the
-- first time a task passes its INTERNAL deadline while still open, and uses
-- Task.overdueNotifiedAt so that each slip alerts exactly once.
--
-- On a database that predates the monitor, every already-late task looks "newly overdue",
-- so the very first sweep would fire the entire backlog at the team at once (88 notifications
-- on the current data). Marking that backlog as already-alerted means people are only
-- notified about deadlines missed from here on.
--
-- This does not hide the backlog: the daily per-manager digest recomputes from live data and
-- still reports every task that is currently overdue.
--
-- The predicate below is deliberately identical to OverdueMonitorService.overdueTasks()
-- + its !overdueNotifiedAt filter — if one changes, change the other.
UPDATE "task" t
SET "overdueNotifiedAt" = now() AT TIME ZONE 'utc'
WHERE t."overdueNotifiedAt" IS NULL
  AND t."deletedAt" IS NULL
  AND t."dueDate" < date_trunc('day', now() AT TIME ZONE 'utc')
  AND (
    t."currentWorkflowStatusId" IS NULL
    OR EXISTS (
      SELECT 1 FROM "workflow_status" s
      WHERE s."id" = t."currentWorkflowStatusId"
        AND s."type" <> 'CLOSED'
    )
  );
