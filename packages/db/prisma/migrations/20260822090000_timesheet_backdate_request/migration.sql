-- Backdated-timesheet approval. Filling time for the last ~1 month is free; a day between 1 and
-- 3 months old needs Super-Admin approval; older than 3 months is blocked. Strictly ADDITIVE:
-- one new table + FK to user. Applies via `prisma migrate deploy` on API boot.
CREATE TABLE "timesheet_backdate_request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "fromDate" TIMESTAMP(3) NOT NULL,
    "toDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "timesheet_backdate_request_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "timesheet_backdate_request_userId_idx" ON "timesheet_backdate_request"("userId");
CREATE INDEX "timesheet_backdate_request_organizationId_status_idx" ON "timesheet_backdate_request"("organizationId", "status");
ALTER TABLE "timesheet_backdate_request" ADD CONSTRAINT "timesheet_backdate_request_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
