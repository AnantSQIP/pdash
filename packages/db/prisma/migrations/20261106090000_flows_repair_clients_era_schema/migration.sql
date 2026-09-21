-- Put back what the clients flow took away, on a database that already ran its old migrations.
--
-- The workspace-flows foundation rewrote the clients-era migrations so that every one of them is
-- additive and flow-neutral: pid_request is left exactly as the PROJECTS flow uses it, the number
-- registry's status CHECK covers BOTH flows' states, and "every live client has a CID" is NOT a
-- table constraint, because the PROJECTS flow is allowed to hold a project whose PID has not been
-- issued yet (docs/WORKSPACE_FLOWS.md, "Schema and migrations").
--
-- That rewrite is the truth for any database migrated from scratch. It is not the truth for one
-- that had already run the ORIGINAL migrations: those databases dropped pid_request, narrowed the
-- registry CHECK to the CLIENTS states, and added a CHECK that every live project carries a code.
-- Put such a database into the PROJECTS flow and it cannot issue a PID, cannot hold a request, and
-- refuses to create a project at all. No production database ran those migrations, but every
-- clients-flow dev, preview and demo database did, and they are the ones this codebase is tested
-- on — so bring them into line here.
--
-- Every statement is conditional: on a database that never saw the old migrations this does
-- nothing whatsoever.

-- 1. The PID request pool, as the PROJECTS flow has always had it.
CREATE TABLE IF NOT EXISTS "pid_request" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "requestedById" TEXT NOT NULL,
    "assigneeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'PENDING',
    "pid" TEXT,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "pid_request_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pid_request_projectId_key" ON "pid_request"("projectId");
CREATE INDEX IF NOT EXISTS "pid_request_assigneeId_status_idx" ON "pid_request"("assigneeId", "status");
CREATE INDEX IF NOT EXISTS "pid_request_requestedById_idx" ON "pid_request"("requestedById");
CREATE INDEX IF NOT EXISTS "pid_request_organizationId_status_idx" ON "pid_request"("organizationId", "status");
DO $$
BEGIN
  ALTER TABLE "pid_request" ADD CONSTRAINT "pid_request_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- 2. A project without a number is legal again. The CLIENTS flow still refuses one — its own code
--    mints the CID inside the same transaction that creates the client, and the conversion's
--    verification re-checks every live client afterwards — but a PROJECTS project waits for its
--    PID, which is the whole point of the request pool above.
ALTER TABLE "project" DROP CONSTRAINT IF EXISTS "project_live_client_has_cid";

-- 3. The registry holds the UNION of both flows' states: a PROJECTS PID passes through RESERVED,
--    RELEASED and EXPIRED, which the clients-era CHECK had removed.
ALTER TABLE "pid_reservation" DROP CONSTRAINT IF EXISTS "pid_reservation_status_check";
ALTER TABLE "pid_reservation" ADD CONSTRAINT "pid_reservation_status_check"
  CHECK ("status" IN ('RESERVED', 'ATTACHED', 'RELEASED', 'EXPIRED', 'DISCONTINUED', 'DELETED', 'PURGED', 'MERGED'));

-- 4. And the defaults a new row takes when nobody says otherwise: a generated PID starts its life
--    held (RESERVED), and a new organisation starts on the timer, as production always has.
ALTER TABLE "pid_reservation" ALTER COLUMN "status" SET DEFAULT 'RESERVED';
ALTER TABLE "organization" ALTER COLUMN "timeTrackingMode" SET DEFAULT 'TIMER';
