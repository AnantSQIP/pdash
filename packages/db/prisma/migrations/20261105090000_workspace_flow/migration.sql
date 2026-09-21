-- Which workspace flow an organisation runs, and which flow every piece of work belongs to
-- (docs/WORKSPACE_FLOWS.md).
--
-- TWO THINGS HAPPEN HERE, and the second depends on the first.
--
-- 1. THE ORGANISATION'S FLOW IS READ OFF THE DATABASE, NOT DEFAULTED.
--
--    A blanket "everybody starts on PROJECTS" is right for a database that has only ever run the
--    projects flow, and catastrophic for one that has already been through the CLIENTS era: the
--    morning after the deploy the firm would find the projects screens over its client work. So
--    the flow is DECIDED FROM EVIDENCE that is already in the database. The evidence is the marks
--    the clients era left behind and nothing else — no configuration, no environment variable, no
--    operator having to remember:
--
--      A. the migration 20261018110000_pid_request_backfill is recorded as applied. That migration
--         only ever existed in the clients era (this codebase deleted it), so nothing else can
--         have run it.  — database-wide
--      B. "project" carries the CHECK project_live_client_has_cid, which only the original
--         20261020120000_cid_auto_mint_and_ledger ever added. (20261106090000 drops it again, one
--         migration later — which is why the question is asked HERE.)  — database-wide
--      C. the PID request pool is gone: the original clients migration dropped "pid_request", and
--         only it ever did.  — database-wide
--      D. the CID ledger has been written to: a row in "cid_event". Only the CLIENTS flow writes
--         one.  — per organisation
--      E. clients are filed in client groups: a row in "client_group". A CLIENTS-only idea.
--         — per organisation
--
--    Any one of A–C makes the whole database a clients-era one (its SCHEMA went through the
--    clients era, whoever's rows are in it); D or E make that one organisation a clients one.
--    Everything else — including a production database that never saw the clients flow, and a
--    database migrated from scratch, where the rewritten clients-era migrations create cid_event
--    and client_group EMPTY — stays PROJECTS and notices nothing.
--
--    Re-runnable, and it never argues with a person: only an organisation that has never been
--    converted (workspaceFlowChangedAt IS NULL) is decided for. Once a Super Admin has chosen a
--    flow, that choice is the answer for ever. A and D survive the repair migration, so a re-run
--    of this file reaches the same verdict it reached the first time.
--
-- 2. EVERY PROJECT/CLIENT ROW IS STAMPED WITH THE FLOW IT BELONGS TO.
--
--    The two flows share one "project" table but must never show each other's work: in CLIENTS the
--    firm sees its clients, in PROJECTS it sees its projects, and switching hides one and reveals
--    the other rather than converting anything. So the row itself carries "workspaceFlow", the API
--    filters every flow-scoped read on it, and the tasks, timesheets, staffing and task lists that
--    hang off a project follow it through their project. Existing rows are backfilled from the
--    flow their organisation was just decided to be running — which is what they were made in.
--
--    A project has no organisation column: it belongs to its creator's organisation, else to that
--    of its earliest member, else to the first organisation. That is the same derived-organisation
--    rule CidService.orgForProject and the flow conversion use.
--
-- Additive and re-runnable throughout.

-- ── 1. The columns on the organisation ──────────────────────────────────────────────────────────
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

-- ── 2. Reading the flow off the database ────────────────────────────────────────────────────────
DO $$
DECLARE
  v_schema_is_clients_era BOOLEAN := FALSE;
  v_marks                 TEXT[]  := ARRAY[]::TEXT[];
  v_org                   RECORD;
  v_org_marks             TEXT[];
  v_decided               TEXT;
BEGIN
  -- A. a migration only the clients era ever ran
  IF to_regclass('public._prisma_migrations') IS NOT NULL
     AND EXISTS (SELECT 1 FROM "_prisma_migrations"
                  WHERE "migration_name" = '20261018110000_pid_request_backfill'
                    AND "finished_at" IS NOT NULL AND "rolled_back_at" IS NULL) THEN
    v_schema_is_clients_era := TRUE;
    v_marks := v_marks || 'the 20261018110000_pid_request_backfill migration is applied'::text;
  END IF;

  -- B. the CHECK only the original CID migration ever added
  IF EXISTS (SELECT 1 FROM "pg_constraint" WHERE "conname" = 'project_live_client_has_cid') THEN
    v_schema_is_clients_era := TRUE;
    v_marks := v_marks || 'project carries the project_live_client_has_cid constraint'::text;
  END IF;

  -- C. the PID request pool the clients era dropped
  IF to_regclass('public.pid_request') IS NULL THEN
    v_schema_is_clients_era := TRUE;
    v_marks := v_marks || 'the pid_request pool has been dropped'::text;
  END IF;

  FOR v_org IN SELECT "id", "name", "workspaceFlow", "workspaceFlowChangedAt" FROM "organization" LOOP
    -- A flow somebody has already chosen is never overruled by a migration.
    CONTINUE WHEN v_org."workspaceFlowChangedAt" IS NOT NULL;

    v_org_marks := v_marks;

    -- D. the CID ledger has been written for this organisation
    IF to_regclass('public.cid_event') IS NOT NULL
       AND EXISTS (SELECT 1 FROM "cid_event" e WHERE e."organizationId" = v_org."id") THEN
      v_org_marks := v_org_marks || 'the CID ledger has events'::text;
    END IF;

    -- E. this organisation files clients in client groups
    IF to_regclass('public.client_group') IS NOT NULL
       AND EXISTS (SELECT 1 FROM "client_group" g WHERE g."organizationId" = v_org."id") THEN
      v_org_marks := v_org_marks || 'clients are filed in client groups'::text;
    END IF;

    v_decided := CASE WHEN v_schema_is_clients_era OR array_length(v_org_marks, 1) > 0
                      THEN 'CLIENTS' ELSE 'PROJECTS' END;

    UPDATE "organization" SET "workspaceFlow" = v_decided WHERE "id" = v_org."id";

    RAISE NOTICE 'workspace flow: % runs %  (%)', v_org."name", v_decided,
      CASE WHEN v_decided = 'CLIENTS' THEN array_to_string(v_org_marks, '; ')
           ELSE 'nothing in this database has been through the clients era' END;
  END LOOP;
END $$;

-- ── 3. The flow a project/client row belongs to ────────────────────────────────────────────────
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "workspaceFlow" TEXT;

UPDATE "project" p
   SET "workspaceFlow" = COALESCE((
         SELECT o."workspaceFlow" FROM "organization" o
          WHERE o."id" = COALESCE(
            (SELECT u."organizationId" FROM "user" u WHERE u."id" = p."createdBy"),
            (SELECT u."organizationId" FROM "project_member" pm JOIN "user" u ON u."id" = pm."userId"
              WHERE pm."projectId" = p."id" ORDER BY pm."isActive" DESC, pm."joinedAt" LIMIT 1),
            (SELECT o2."id" FROM "organization" o2 ORDER BY o2."createdAt", o2."id" LIMIT 1))
       ), 'PROJECTS')
 WHERE p."workspaceFlow" IS NULL;

ALTER TABLE "project" ALTER COLUMN "workspaceFlow" SET DEFAULT 'PROJECTS';
ALTER TABLE "project" ALTER COLUMN "workspaceFlow" SET NOT NULL;
DO $$ BEGIN
  ALTER TABLE "project" ADD CONSTRAINT "project_workspaceFlow_check"
    CHECK ("workspaceFlow" IN ('PROJECTS', 'CLIENTS'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Every flow-scoped list starts here: "the live rows of MY flow".
CREATE INDEX IF NOT EXISTS "project_workspaceFlow_deletedAt_idx" ON "project"("workspaceFlow", "deletedAt");

-- ── 4. Which flow's work a notification is about ────────────────────────────────────────────────
-- NULL = about neither flow (leave, an expense, a mention in a team space) and shown in both. A
-- notification that names a project row is stamped with that row's flow when it is written, so a
-- firm that switches flow is not offered links into work it can no longer open. Existing rows stay
-- NULL: the bell is a few days of history, and a stale link is answered by the wall behind it.
ALTER TABLE "notification" ADD COLUMN IF NOT EXISTS "workspaceFlow" TEXT;
DO $$ BEGIN
  ALTER TABLE "notification" ADD CONSTRAINT "notification_workspaceFlow_check"
    CHECK ("workspaceFlow" IS NULL OR "workspaceFlow" IN ('PROJECTS', 'CLIENTS'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
