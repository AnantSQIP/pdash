-- Which workspace flow an organisation runs: PROJECTS or CLIENTS (docs/WORKSPACE_FLOWS.md).
--
-- Every existing organisation is PROJECTS — what it has always run — so deploying this changes
-- nothing for anybody. Moving to CLIENTS is a conversion a Super Admin runs from Settings, and each
-- one is recorded in workspace_flow_change. Additive and re-runnable.

ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "workspaceFlow" TEXT NOT NULL DEFAULT 'PROJECTS';
ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "workspaceFlowChangedAt" TIMESTAMP(3);
DO $$ BEGIN
  ALTER TABLE "organization" ADD CONSTRAINT "organization_workspaceFlow_check"
    CHECK ("workspaceFlow" IN ('PROJECTS', 'CLIENTS'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS "workspace_flow_change" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromFlow"       TEXT NOT NULL,
    "toFlow"         TEXT NOT NULL,
    "changedBy"      TEXT NOT NULL,
    "changedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note"           TEXT,
    "preflight"      JSONB,
    "applied"        JSONB,
    "verification"   JSONB,
    CONSTRAINT "workspace_flow_change_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "workspace_flow_change_organizationId_changedAt_idx"
  ON "workspace_flow_change"("organizationId", "changedAt");
