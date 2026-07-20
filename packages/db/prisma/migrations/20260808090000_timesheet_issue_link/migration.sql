-- A timesheet can be logged against a technical issue instead of a task.
ALTER TABLE "timesheet" ALTER COLUMN "taskId" DROP NOT NULL;
ALTER TABLE "timesheet" ADD COLUMN "issueId" TEXT;
CREATE INDEX "timesheet_issueId_idx" ON "timesheet"("issueId");
ALTER TABLE "timesheet" ADD CONSTRAINT "timesheet_issueId_fkey" FOREIGN KEY ("issueId") REFERENCES "issue"("id") ON DELETE CASCADE ON UPDATE CASCADE;
