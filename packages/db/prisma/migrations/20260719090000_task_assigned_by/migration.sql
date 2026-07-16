-- "Assigned by" — who delegated a task — kept distinct from its assignees (who do it).
-- Nullable + ON DELETE SET NULL so removing a user never deletes their delegated tasks.

ALTER TABLE "task" ADD COLUMN "assignedById" TEXT;

ALTER TABLE "task" ADD CONSTRAINT "task_assignedById_fkey"
    FOREIGN KEY ("assignedById") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "task_assignedById_idx" ON "task"("assignedById");
