-- Phase 3 — the business-development pipeline.
--
-- A DEAL is prospective business, tracked from first contact to won or lost. It is deliberately
-- not a Project: a project is work we have been engaged to do and are accountable for delivering,
-- while a deal is work we hope to be engaged for, and most never happen. Conflating them would
-- put speculative revenue into delivery reporting and hand every lost prospect a Project ID.
--
-- The join to the rest of the system happens at the moment of winning: a won deal can be tied to
-- the Client it became, after which its work flows through projects and the client ledger like
-- anything else. Before that, a prospect is just a name — hence `company` is free text rather
-- than a foreign key.
CREATE TABLE IF NOT EXISTS "deal" (
  "id"                TEXT NOT NULL,
  "organizationId"    TEXT NOT NULL,
  "teamId"            TEXT,
  "company"           TEXT NOT NULL,
  "title"             TEXT,
  "stage"             TEXT NOT NULL DEFAULT 'NEW',
  "value"             DOUBLE PRECISION,
  "currency"          TEXT NOT NULL DEFAULT 'INR',
  "ownerId"           TEXT NOT NULL,
  "source"            TEXT,
  "expectedCloseDate" TIMESTAMP(3),
  "wonAt"             TIMESTAMP(3),
  "lostAt"            TIMESTAMP(3),
  "lostReason"        TEXT,
  "clientId"          TEXT,
  "notes"             TEXT,
  "createdBy"         TEXT NOT NULL,
  "createdAt"         TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"         TIMESTAMP(3) NOT NULL,
  "deletedAt"         TIMESTAMP(3),
  CONSTRAINT "deal_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "deal_organizationId_deletedAt_stage_idx" ON "deal"("organizationId", "deletedAt", "stage");
CREATE INDEX IF NOT EXISTS "deal_ownerId_idx"  ON "deal"("ownerId");
CREATE INDEX IF NOT EXISTS "deal_clientId_idx" ON "deal"("clientId");

-- A deal outlives the team space that ran it and the client it became, so both detach rather
-- than cascade. Losing the owner is different: a deal with no owner is nobody's problem, and
-- offboarding already cascades a person's records.
ALTER TABLE "deal" DROP CONSTRAINT IF EXISTS "deal_teamId_fkey";
ALTER TABLE "deal" ADD CONSTRAINT "deal_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deal" DROP CONSTRAINT IF EXISTS "deal_clientId_fkey";
ALTER TABLE "deal" ADD CONSTRAINT "deal_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "deal" DROP CONSTRAINT IF EXISTS "deal_ownerId_fkey";
ALTER TABLE "deal" ADD CONSTRAINT "deal_ownerId_fkey"
  FOREIGN KEY ("ownerId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Everything that happened on a deal, including its stage changes.
--
-- A pipeline without history is a set of assertions nobody can check: "why is this still in
-- Proposal after four months" has no answer unless the moves were recorded as they happened.
CREATE TABLE IF NOT EXISTS "deal_activity" (
  "id"         TEXT NOT NULL,
  "dealId"     TEXT NOT NULL,
  "type"       TEXT NOT NULL,
  "note"       TEXT,
  "fromStage"  TEXT,
  "toStage"    TEXT,
  "occurredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "createdBy"  TEXT NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "deal_activity_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "deal_activity_dealId_occurredAt_idx" ON "deal_activity"("dealId", "occurredAt");

ALTER TABLE "deal_activity" DROP CONSTRAINT IF EXISTS "deal_activity_dealId_fkey";
ALTER TABLE "deal_activity" ADD CONSTRAINT "deal_activity_dealId_fkey"
  FOREIGN KEY ("dealId") REFERENCES "deal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
