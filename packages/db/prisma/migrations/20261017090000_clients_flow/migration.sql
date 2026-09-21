-- CLIENTS-FLOW. Strictly additive: one new table, one nullable column on project, and nullable or
-- defaulted columns on task_list. Nothing existing is altered or dropped, so the API that runs
-- `migrate deploy` on boot can come up against it before or after the new web does.

-- A named group of clients.
CREATE TABLE "client_group" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    "createdBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "archivedAt" TIMESTAMP(3),

    CONSTRAINT "client_group_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "client_group_name_not_blank" CHECK (length(btrim("name")) > 0)
);

CREATE INDEX "client_group_organizationId_archivedAt_idx" ON "client_group"("organizationId", "archivedAt");

-- Two live groups may not share a name in one organisation, whatever the case. Archived names are
-- free to be reused. The service checks first and says so in words; this is the backstop for two
-- requests in the same instant.
CREATE UNIQUE INDEX "client_group_org_live_name_key"
    ON "client_group" ("organizationId", lower(btrim("name")))
    WHERE "archivedAt" IS NULL;

-- A client (project row) may be filed under a group.
ALTER TABLE "project" ADD COLUMN "clientGroupId" TEXT;
CREATE INDEX "project_clientGroupId_idx" ON "project"("clientGroupId");
ALTER TABLE "project" ADD CONSTRAINT "project_clientGroupId_fkey"
    FOREIGN KEY ("clientGroupId") REFERENCES "client_group"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- A task group carries what a piece of work needs.
ALTER TABLE "task_list"
    ADD COLUMN "description" TEXT,
    ADD COLUMN "groupType" TEXT,
    ADD COLUMN "technologyDomain" TEXT,
    ADD COLUMN "startDate" TIMESTAMP(3),
    ADD COLUMN "dueDate" TIMESTAMP(3),
    ADD COLUMN "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    ADD COLUMN "completedAt" TIMESTAMP(3),
    ADD COLUMN "createdBy" TEXT;

ALTER TABLE "task_list" ADD CONSTRAINT "task_list_status_check" CHECK ("status" IN ('ACTIVE', 'COMPLETED'));

-- A completed group records when; an active one does not claim to have finished.
ALTER TABLE "task_list" ADD CONSTRAINT "task_list_completed_consistent"
    CHECK (("status" = 'COMPLETED') = ("completedAt" IS NOT NULL));

-- A deadline before the start is a typo, not a plan.
ALTER TABLE "task_list" ADD CONSTRAINT "task_list_dates_ordered"
    CHECK ("startDate" IS NULL OR "dueDate" IS NULL OR "dueDate" >= "startDate");
