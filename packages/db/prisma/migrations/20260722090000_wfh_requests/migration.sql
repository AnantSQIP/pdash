-- WFH becomes a REQUEST → approval flow (raised from the Leaves section, reviewed by
-- HR/Admin via attendance.manage). Punch derives workMode=WFH from an approved request
-- covering the day — the WFH button is gone from the punch screen.

CREATE TABLE "wfh_request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    -- PENDING | APPROVED | REJECTED | CANCELLED
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "wfh_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "wfh_request_userId_idx" ON "wfh_request"("userId");
CREATE INDEX "wfh_request_organizationId_status_idx" ON "wfh_request"("organizationId", "status");

ALTER TABLE "wfh_request" ADD CONSTRAINT "wfh_request_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
