-- Task.completedAt — when the work was finished, recorded rather than inferred.
--
-- Performance used `updatedAt` as a proxy for completion, which is wrong in two ways, and both
-- land on somebody's appraisal:
--
--   * a task closed in January but edited in March counted as completed in MARCH, inflating the
--     current period and emptying the one where the work actually happened;
--   * on-time was decided by comparing updatedAt against the due date, so a task delivered on
--     time became retroactively LATE the moment anyone edited it afterwards. Fixing a typo in a
--     closed task could damage a person's on-time rate.
--
-- Additive and nullable. The backfill uses updatedAt for tasks that are already closed, which is
-- the same figure performance was using before — so no history changes on the day this ships. It
-- becomes accurate from here on, for every task closed after it.
--
-- BE CLEAR ABOUT WHAT THE BACKFILL IS WORTH. It reconstructs a date that was never recorded, from
-- the only column that survives: when the row was last touched. Where a batch of tasks was last
-- edited on one day, they all inherit that day, and every one of them will read as late against
-- an older due date. That is not a regression — it is exactly what the on-time rate was already
-- computing — but it is not evidence of anything either, and the metric glossary says so.

ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "completedAt" TIMESTAMP(3);

-- Backfill: only tasks currently in a CLOSED status, and only where it is not already set.
UPDATE "task" t
SET "completedAt" = t."updatedAt"
FROM "workflow_status" ws
WHERE ws.id = t."currentWorkflowStatusId"
  AND ws.type = 'CLOSED'
  AND t."completedAt" IS NULL;

-- Performance windows by completion date on every read, so the lookup is worth an index.
-- Partial: an unfinished task is never what that query is looking for.
CREATE INDEX IF NOT EXISTS "task_completedAt_idx" ON "task"("completedAt") WHERE "completedAt" IS NOT NULL;
