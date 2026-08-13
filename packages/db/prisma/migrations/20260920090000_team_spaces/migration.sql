-- Phase 3 — team spaces: somewhere for work that is not client delivery.
--
-- Until now a Task could not exist without a Project, and every project type was a
-- patent-analysis type carrying a PID, a client and billability. HR and BD work therefore had to
-- masquerade as a "General / Other" project in the delivery list, taking a Project ID it had no
-- use for and turning up in delivery reports beside real client matters.
--
-- A team space is NOT a kind of project: no PID, no client, and it never reaches the client
-- ledger, the PID ledger or delivery reporting. What it shares is the Task itself — team_task
-- mirrors project_task exactly — so assignees, subtasks, comments, statuses and logged time all
-- behave as people already expect, and nothing that reads a task learns a second shape.

-- 1. The team space. `team` already existed and was completely empty (never written to by any
--    code path), so these columns are additive over nothing.
ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "archivedAt" TIMESTAMP(3);
ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "deletedAt"  TIMESTAMP(3);
ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "createdBy"  TEXT;
ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
ALTER TABLE "team" ADD COLUMN IF NOT EXISTS "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;
CREATE INDEX IF NOT EXISTS "team_organizationId_deletedAt_idx" ON "team"("organizationId", "deletedAt");

-- 2. Task lists become shared between projects and team spaces.
--    Dropping NOT NULL is backward-compatible in the direction that matters: every existing row
--    still has its projectId, and every query filtering on projectId is unaffected.
ALTER TABLE "task_list" ALTER COLUMN "projectId" DROP NOT NULL;
ALTER TABLE "task_list" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
ALTER TABLE "task_list" DROP CONSTRAINT IF EXISTS "task_list_teamId_fkey";
ALTER TABLE "task_list"
  ADD CONSTRAINT "task_list_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
CREATE INDEX IF NOT EXISTS "task_list_teamId_idx" ON "task_list"("teamId");

-- A list belongs to exactly one owner. Without this the nullable columns permit a list that
-- belongs to both a project and a team, or to neither — states no code would create deliberately
-- and every reader would then have to defend against.
ALTER TABLE "task_list" DROP CONSTRAINT IF EXISTS "task_list_one_owner";
ALTER TABLE "task_list"
  ADD CONSTRAINT "task_list_one_owner"
  CHECK (("projectId" IS NOT NULL) <> ("teamId" IS NOT NULL));

-- 3. Tasks in a team space — the mirror of project_task.
CREATE TABLE IF NOT EXISTS "team_task" (
  "id"         TEXT NOT NULL,
  "teamId"     TEXT NOT NULL,
  "taskId"     TEXT NOT NULL,
  "taskListId" TEXT,
  "sequence"   INTEGER NOT NULL DEFAULT 0,
  CONSTRAINT "team_task_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "team_task_teamId_taskId_key" ON "team_task"("teamId", "taskId");
CREATE INDEX IF NOT EXISTS "team_task_teamId_idx" ON "team_task"("teamId");

ALTER TABLE "team_task" DROP CONSTRAINT IF EXISTS "team_task_teamId_fkey";
ALTER TABLE "team_task"
  ADD CONSTRAINT "team_task_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "team_task" DROP CONSTRAINT IF EXISTS "team_task_taskId_fkey";
ALTER TABLE "team_task"
  ADD CONSTRAINT "team_task_taskId_fkey"
  FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "team_task" DROP CONSTRAINT IF EXISTS "team_task_taskListId_fkey";
ALTER TABLE "team_task"
  ADD CONSTRAINT "team_task_taskListId_fkey"
  FOREIGN KEY ("taskListId") REFERENCES "task_list"("id") ON DELETE SET NULL ON UPDATE CASCADE;
