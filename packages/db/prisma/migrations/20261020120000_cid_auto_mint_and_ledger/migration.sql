-- The CID registry and the CID ledger — schema only (docs/WORKSPACE_FLOWS.md).
--
-- Additive and flow-neutral. A PROJECTS organisation keeps using pid_reservation exactly as before
-- (RESERVED holds, RELEASED / EXPIRED reclaim, DISCONTINUED retirement) and never writes cid_event.
-- Everything that reshapes DATA for the CLIENTS flow — retiring un-attached numbers, importing the
-- existing numbers into the ledger, giving every live project a CID — is done by the workspace-flow
-- conversion (WorkspaceFlowService), for the one organisation converting, in one transaction.
--
-- Re-runnable where it matters: every object is created only if missing.

-- ── The registry: what the CLIENTS flow records beyond the PID lifecycle ─────────────────────────
-- CIDs are minted on create, so they carry no 5-minute hold.
ALTER TABLE "pid_reservation" ALTER COLUMN "expiresAt" DROP NOT NULL;
-- The survivor a MERGED number was merged under.
ALTER TABLE "pid_reservation" ADD COLUMN IF NOT EXISTS "mergedIntoCid" TEXT;

-- Both flows' states, and nothing else. PROJECTS: RESERVED, ATTACHED, RELEASED, EXPIRED,
-- DISCONTINUED. CLIENTS: ATTACHED, DELETED, PURGED, MERGED, DISCONTINUED.
DO $$ BEGIN
  ALTER TABLE "pid_reservation" ADD CONSTRAINT "pid_reservation_status_check"
    CHECK ("status" IN ('RESERVED', 'ATTACHED', 'RELEASED', 'EXPIRED', 'DISCONTINUED', 'DELETED', 'PURGED', 'MERGED'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pid_reservation" ADD CONSTRAINT "pid_reservation_merged_has_target"
    CHECK (("status" = 'MERGED') = ("mergedIntoCid" IS NOT NULL));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pid_reservation" ADD CONSTRAINT "pid_reservation_serial_positive" CHECK ("serial" >= 1);
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- ── The CID ledger: append-only, written in the same transaction as the change it records ────────
CREATE TABLE IF NOT EXISTS "cid_event" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "cid"            TEXT NOT NULL,
    "projectId"      TEXT,
    "clientTitle"    TEXT,
    "type"           TEXT NOT NULL,
    "fromCid"        TEXT,
    "toCid"          TEXT,
    "fromTitle"      TEXT,
    "toTitle"        TEXT,
    "actorId"        TEXT,
    "actorName"      TEXT,
    "metadata"       JSONB,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "cid_event_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "cid_event_organizationId_cid_createdAt_idx" ON "cid_event"("organizationId", "cid", "createdAt");
CREATE INDEX IF NOT EXISTS "cid_event_projectId_idx" ON "cid_event"("projectId");
CREATE INDEX IF NOT EXISTS "cid_event_organizationId_createdAt_idx" ON "cid_event"("organizationId", "createdAt");

DO $$ BEGIN
  ALTER TABLE "cid_event" ADD CONSTRAINT "cid_event_type_check" CHECK ("type" IN (
    'MINTED', 'BACKFILLED', 'IMPORTED', 'ROUND_ADDED', 'RENAMED', 'CLIENT_GROUP_CHANGED',
    'MANAGER_CHANGED', 'PHASE_CHANGED', 'DELETED', 'RESTORED', 'COMPLETED', 'REOPENED',
    'REINITIALIZED', 'REASSIGNED', 'SPLIT', 'MERGED', 'PURGED'
  ));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Append-only: a correction is a new event, never an edit of an old one.
CREATE OR REPLACE FUNCTION "cid_event_refuse_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'cid_event is append-only: write a new event instead of editing %', OLD."id";
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS "cid_event_no_update" ON "cid_event";
CREATE TRIGGER "cid_event_no_update" BEFORE UPDATE ON "cid_event"
  FOR EACH ROW EXECUTE FUNCTION "cid_event_refuse_update"();
