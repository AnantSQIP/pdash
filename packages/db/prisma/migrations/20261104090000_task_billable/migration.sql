-- CLIENTS FLOW: billability is a property of the TASK.
--
-- Every task is billable unless somebody associated with it marks it otherwise. From here on a
-- timesheet entry on a task always carries the task's flag — set when the entry is logged, and
-- re-set on the task's existing entries whenever the flag changes — so no report can show a
-- non-billable task with billable hours.
--
-- Existing entries are NOT rewritten by this migration: until now each person chose billability per
-- entry, and those choices are the history. The first time a task's flag is changed its entries
-- are brought into line.
--
-- Team-space (internal) work was already never billable; its tasks say so too.
-- Additive and re-runnable.

ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "billable" BOOLEAN NOT NULL DEFAULT true;
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "billableChangedAt" TIMESTAMP(3);
ALTER TABLE "task" ADD COLUMN IF NOT EXISTS "billableChangedById" TEXT;

UPDATE "task" t
   SET "billable" = false
 WHERE t."billable" = true
   AND EXISTS (SELECT 1 FROM "team_task" tt WHERE tt."taskId" = t."id")
   AND NOT EXISTS (SELECT 1 FROM "project_task" pt WHERE pt."taskId" = t."id");
