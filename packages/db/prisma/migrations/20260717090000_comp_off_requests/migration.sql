-- Comp-off: an employee worked on a non-working day (weekend/holiday) and claims a
-- compensatory day off. On approval it grants a CO leave credit, availed later as a
-- normal leave of type CO. This is the EARN side (the USE side is an ordinary CO leave).

CREATE TABLE "comp_off_request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "workDate" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "hoursWorked" DOUBLE PRECISION,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "comp_off_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "comp_off_request_userId_idx" ON "comp_off_request"("userId");
CREATE INDEX "comp_off_request_organizationId_status_idx" ON "comp_off_request"("organizationId", "status");

ALTER TABLE "comp_off_request" ADD CONSTRAINT "comp_off_request_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
