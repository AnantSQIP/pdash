-- Role-based task staffing: each assignee gets a role (PM / REVIEWER / ANALYST) and their own
-- estimated hours (the task's total is the sum). Strictly ADDITIVE: two new nullable columns;
-- existing assignees get NULL (a legacy plain assignee). Applies via `prisma migrate deploy`.
ALTER TABLE "task_assignee" ADD COLUMN "role" TEXT;
ALTER TABLE "task_assignee" ADD COLUMN "estimatedHours" DOUBLE PRECISION;
