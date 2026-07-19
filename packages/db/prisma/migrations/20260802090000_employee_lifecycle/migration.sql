-- TeamNest port TN P1: employee lifecycle (onboarding/offboarding + checklists + HR letters).
CREATE TABLE "lifecycle_process" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'IN_PROGRESS',
    "notes" TEXT,
    "reason" TEXT,
    "lastWorkingDay" TIMESTAMP(3),
    "startedBy" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "lifecycle_process_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lifecycle_process_organizationId_type_status_idx" ON "lifecycle_process"("organizationId", "type", "status");
CREATE INDEX "lifecycle_process_userId_idx" ON "lifecycle_process"("userId");

CREATE TABLE "lifecycle_task" (
    "id" TEXT NOT NULL,
    "processId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDate" TIMESTAMP(3),
    "done" BOOLEAN NOT NULL DEFAULT false,
    "doneAt" TIMESTAMP(3),
    "doneBy" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "lifecycle_task_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "lifecycle_task_processId_idx" ON "lifecycle_task"("processId");

CREATE TABLE "checklist_template" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "checklist_template_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "checklist_template_organizationId_type_idx" ON "checklist_template"("organizationId", "type");

CREATE TABLE "checklist_template_item" (
    "id" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "dueDays" INTEGER,
    "sequence" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "checklist_template_item_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "checklist_template_item_templateId_idx" ON "checklist_template_item"("templateId");

CREATE TABLE "hr_letter" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "issuedBy" TEXT NOT NULL,
    "issuedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acknowledgedAt" TIMESTAMP(3),

    CONSTRAINT "hr_letter_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "hr_letter_userId_idx" ON "hr_letter"("userId");
CREATE INDEX "hr_letter_organizationId_idx" ON "hr_letter"("organizationId");

ALTER TABLE "lifecycle_process" ADD CONSTRAINT "lifecycle_process_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lifecycle_process" ADD CONSTRAINT "lifecycle_process_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "lifecycle_task" ADD CONSTRAINT "lifecycle_task_processId_fkey" FOREIGN KEY ("processId") REFERENCES "lifecycle_process"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checklist_template" ADD CONSTRAINT "checklist_template_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "checklist_template_item" ADD CONSTRAINT "checklist_template_item_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "checklist_template"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hr_letter" ADD CONSTRAINT "hr_letter_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "hr_letter" ADD CONSTRAINT "hr_letter_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
