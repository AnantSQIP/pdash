-- Role-based staffing: a person may hold MULTIPLE roles on one task (each role once), and each
-- assignment can carry its own deadline. Additive column + a looser unique key (old data satisfies
-- the new key, so no data migration needed).
ALTER TABLE "task_assignee" ADD COLUMN "dueDate" TIMESTAMP(3);
DROP INDEX IF EXISTS "task_assignee_taskId_userId_key";
CREATE UNIQUE INDEX "task_assignee_taskId_userId_role_key" ON "task_assignee"("taskId", "userId", "role");
