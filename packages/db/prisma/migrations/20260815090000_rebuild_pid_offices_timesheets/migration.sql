-- Rebuild foundation (Phase 1): office grouping, PID-by-timesheet fields, and the PID request flow.
-- Strictly ADDITIVE — new nullable columns + a new table + new indexes/FKs. No data touched, so
-- this applies cleanly on the live server via `prisma migrate deploy` on boot.
--
-- NOTE: this migration intentionally does NOT recreate the client/patent unique indexes that
-- `prisma migrate diff` suggests — those are the PARTIAL (WHERE deletedAt IS NULL) indexes from
-- 20260814_robustness, which Prisma can't express declaratively; recreating them full would
-- revert the delete-then-recreate fix. It also skips the unrelated task_assignedById_idx drift.

-- Office / branch grouping for the capacity board (GURGAON | JAIPUR), nullable.
ALTER TABLE "user" ADD COLUMN "office" TEXT;

-- Timesheets are now keyed by PID: resolve to a project (+ type snapshot); createdAt anchors the
-- 1-week "assign the PID later" buffer. All nullable/defaulted → safe on existing rows.
ALTER TABLE "timesheet" ADD COLUMN "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN "projectId" TEXT,
ADD COLUMN "projectType" TEXT;

CREATE INDEX "timesheet_projectId_idx" ON "timesheet"("projectId");

ALTER TABLE "timesheet" ADD CONSTRAINT "timesheet_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- PID request flow: a non-authority creates a PID-pending project and routes a request to a
-- chosen authority who mints/enters the PID.
CREATE TABLE "pid_request" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pid" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "pid_request_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pid_request_projectId_key" ON "pid_request"("projectId");
CREATE INDEX "pid_request_assigneeId_status_idx" ON "pid_request"("assigneeId", "status");
CREATE INDEX "pid_request_requestedById_idx" ON "pid_request"("requestedById");
CREATE INDEX "pid_request_organizationId_status_idx" ON "pid_request"("organizationId", "status");

ALTER TABLE "pid_request" ADD CONSTRAINT "pid_request_projectId_fkey"
  FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
