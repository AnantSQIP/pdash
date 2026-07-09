-- Deep-audit remediation: hot-path indexes (M14) + integrity constraints (#3, L16).
-- All statements are additive and backward-compatible. On the small seeded dataset
-- the unique indexes below succeed instantly; on a larger DB with pre-existing
-- duplicates they would abort the migration (dedupe first) rather than corrupt data.

-- M14: index the columns the performance / report queries filter & sort on.
CREATE INDEX "task_updatedAt_idx" ON "task"("updatedAt");
CREATE INDEX "task_dueDate_idx" ON "task"("dueDate");
CREATE INDEX "task_currentWorkflowStatusId_idx" ON "task"("currentWorkflowStatusId");

-- #3: role names must be unique per organization.
CREATE UNIQUE INDEX "role_organizationId_name_key" ON "role"("organizationId", "name");

-- L16: a document may not have two rows for the same version; index lookups by document.
CREATE UNIQUE INDEX "document_version_documentId_versionNumber_key" ON "document_version"("documentId", "versionNumber");
CREATE INDEX "document_version_documentId_idx" ON "document_version"("documentId");

-- M25: persist Settings → General (timezone + brand colour). Additive with defaults.
ALTER TABLE "organization" ADD COLUMN "timezone" TEXT NOT NULL DEFAULT 'UTC';
ALTER TABLE "organization" ADD COLUMN "brandColor" TEXT NOT NULL DEFAULT '#3d8de2';
