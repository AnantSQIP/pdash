-- Remove the milestone feature entirely (model + the columns that referenced it).
ALTER TABLE "project_task" DROP CONSTRAINT IF EXISTS "project_task_milestoneId_fkey";
DROP INDEX IF EXISTS "project_task_milestoneId_idx";
ALTER TABLE "project_task" DROP COLUMN IF EXISTS "milestoneId";

ALTER TABLE "task_list" DROP CONSTRAINT IF EXISTS "task_list_milestoneId_fkey";
ALTER TABLE "task_list" DROP COLUMN IF EXISTS "milestoneId";

DROP TABLE IF EXISTS "milestone";
