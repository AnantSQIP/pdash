-- WFH becomes a work MODE on attendance (not a leave type), and a new Expense module.

-- Attendance work mode: OFFICE | WFH.
ALTER TABLE "attendance" ADD COLUMN "workMode" TEXT NOT NULL DEFAULT 'OFFICE';

-- WFH is no longer a leave type — drop it and any leave requests that used it.
DELETE FROM "leave_request" WHERE "leaveType" = 'WFH';
DELETE FROM "leave_type" WHERE code = 'WFH';

-- Expense management: employees record business expenses and request reimbursement.
CREATE TABLE "expense" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "organizationId" TEXT,
    "category" TEXT NOT NULL DEFAULT 'OTHER',
    "amount" DOUBLE PRECISION NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'INR',
    "spentOn" TIMESTAMP(3) NOT NULL,
    "description" TEXT NOT NULL,
    "receiptDocumentId" TEXT,
    -- PENDING | APPROVED | REJECTED | REIMBURSED | CANCELLED
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "reviewedBy" TEXT,
    "reviewedAt" TIMESTAMP(3),
    "reviewNote" TEXT,
    "reimbursedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expense_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "expense_userId_idx" ON "expense"("userId");
CREATE INDEX "expense_organizationId_status_idx" ON "expense"("organizationId", "status");

ALTER TABLE "expense" ADD CONSTRAINT "expense_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
