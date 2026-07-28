-- Custom project-type templates (org-wide, saved by Admin/Manager/PM). Strictly ADDITIVE: one
-- new table. Applies via `prisma migrate deploy` on API boot.
CREATE TABLE "project_template" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "taskListName" TEXT,
    "tasks" TEXT[],
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "project_template_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "project_template_organizationId_value_key" ON "project_template"("organizationId", "value");
CREATE INDEX "project_template_organizationId_isActive_idx" ON "project_template"("organizationId", "isActive");
