-- TeamNest port TN P3: structured appraisal review cycles.
CREATE TABLE "appraisal_cycle" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3),
    "periodEnd" TIMESTAMP(3),
    "dueDate" TIMESTAMP(3),
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appraisal_cycle_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "appraisal_cycle_organizationId_idx" ON "appraisal_cycle"("organizationId");

CREATE TABLE "appraisal" (
    "id" TEXT NOT NULL,
    "cycleId" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "employeeId" TEXT NOT NULL,
    "reviewerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'PENDING_SELF',
    "selfRating" INTEGER,
    "selfComments" TEXT,
    "managerRating" INTEGER,
    "managerComments" TEXT,
    "overallRating" INTEGER,
    "submittedSelfAt" TIMESTAMP(3),
    "submittedManagerAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "appraisal_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "appraisal_cycleId_employeeId_key" ON "appraisal"("cycleId", "employeeId");
CREATE INDEX "appraisal_organizationId_idx" ON "appraisal"("organizationId");
CREATE INDEX "appraisal_employeeId_idx" ON "appraisal"("employeeId");
CREATE INDEX "appraisal_reviewerId_idx" ON "appraisal"("reviewerId");

CREATE TABLE "appraisal_goal" (
    "id" TEXT NOT NULL,
    "appraisalId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "weight" INTEGER,
    "selfRating" INTEGER,
    "selfComment" TEXT,
    "managerRating" INTEGER,
    "managerComment" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "appraisal_goal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "appraisal_goal_appraisalId_idx" ON "appraisal_goal"("appraisalId");

ALTER TABLE "appraisal_cycle" ADD CONSTRAINT "appraisal_cycle_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appraisal" ADD CONSTRAINT "appraisal_cycleId_fkey" FOREIGN KEY ("cycleId") REFERENCES "appraisal_cycle"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appraisal" ADD CONSTRAINT "appraisal_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appraisal" ADD CONSTRAINT "appraisal_employeeId_fkey" FOREIGN KEY ("employeeId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appraisal" ADD CONSTRAINT "appraisal_reviewerId_fkey" FOREIGN KEY ("reviewerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "appraisal_goal" ADD CONSTRAINT "appraisal_goal_appraisalId_fkey" FOREIGN KEY ("appraisalId") REFERENCES "appraisal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
