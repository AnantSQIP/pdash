-- Attendance regularisation is now a REQUEST that HR approves, not a silent self-edit.
-- The employee raises a request; only on approval is the Attendance row changed.

CREATE TABLE "regularization_request" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "reason" TEXT NOT NULL,
    "requestType" TEXT NOT NULL DEFAULT 'OTHER',
    "requestedStatus" TEXT NOT NULL DEFAULT 'PRESENT',
    "requestedCheckIn" TIMESTAMP(3),
    "requestedCheckOut" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "regularization_request_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "regularization_request_userId_idx" ON "regularization_request"("userId");
CREATE INDEX "regularization_request_organizationId_status_idx" ON "regularization_request"("organizationId", "status");

ALTER TABLE "regularization_request" ADD CONSTRAINT "regularization_request_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
