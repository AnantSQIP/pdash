-- Work-from-home comes back as a REQUEST you raise from the Leaves section, on top of the
-- retrospective route that already exists (a regularisation of type WFH). Both end at the same
-- column, attendance."workMode"; neither is a leave type and neither consumes a balance.
--
-- The table was dropped in 20261003090000 when the whole feature came out. Nothing survived it,
-- so this creates it empty rather than trying to restore anything.

CREATE TABLE IF NOT EXISTS "wfh_request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wfh_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "wfh_request_userId_idx" ON "wfh_request"("userId");
CREATE INDEX IF NOT EXISTS "wfh_request_organizationId_status_idx" ON "wfh_request"("organizationId", "status");

ALTER TABLE "wfh_request" DROP CONSTRAINT IF EXISTS "wfh_request_userId_fkey";
ALTER TABLE "wfh_request" ADD CONSTRAINT "wfh_request_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
