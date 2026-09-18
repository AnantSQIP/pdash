-- CLIENTS-FLOW: the PID becomes the CID (Client ID), minted automatically when a client is created,
-- and every change to a client or its number is kept in an append-only ledger.
--
--   1. The PID request pool is removed (table pid_request).
--   2. The registry (table pid_reservation, name kept) loses the 5-minute "RESERVED" hold and gains
--      MERGED / DELETED / PURGED states and a pointer from a merged CID to the one it went into.
--   3. The ledger: table cid_event, append-only (a trigger refuses UPDATE).
--   4. Every existing live client without a CID is given one, in a deterministic order
--      (createdAt, then id), recorded in the ledger as BACKFILLED.
--   5. From here on the database itself refuses a live client with no CID.
--
-- Re-runnable in effect: every data step only touches rows still in the "before" shape, so on a
-- database with no code-less clients the backfill does nothing.

-- ── 1. The request pool goes ────────────────────────────────────────────────────────────────────
DROP TABLE IF EXISTS "pid_request";

-- ── 2. The registry ─────────────────────────────────────────────────────────────────────────────
ALTER TABLE "pid_reservation" ALTER COLUMN "expiresAt" DROP NOT NULL;
ALTER TABLE "pid_reservation" ALTER COLUMN "status" SET DEFAULT 'ATTACHED';
ALTER TABLE "pid_reservation" ADD COLUMN IF NOT EXISTS "mergedIntoCid" TEXT;

-- ── 3. The ledger ───────────────────────────────────────────────────────────────────────────────
CREATE TABLE "cid_event" (
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
CREATE INDEX "cid_event_organizationId_cid_createdAt_idx" ON "cid_event"("organizationId", "cid", "createdAt");
CREATE INDEX "cid_event_projectId_idx" ON "cid_event"("projectId");
CREATE INDEX "cid_event_organizationId_createdAt_idx" ON "cid_event"("organizationId", "createdAt");

ALTER TABLE "cid_event" ADD CONSTRAINT "cid_event_type_check" CHECK ("type" IN (
  'MINTED', 'BACKFILLED', 'IMPORTED', 'ROUND_ADDED', 'RENAMED', 'CLIENT_GROUP_CHANGED',
  'MANAGER_CHANGED', 'PHASE_CHANGED', 'DELETED', 'RESTORED', 'COMPLETED', 'REOPENED',
  'REINITIALIZED', 'REASSIGNED', 'SPLIT', 'MERGED', 'PURGED'
));

-- Append-only: a ledger row, once written, says what happened. Correcting history is done by
-- writing another event, never by editing one. (DELETE stays possible for the workspace reset
-- scripts, which clear everything operational together.)
CREATE OR REPLACE FUNCTION "cid_event_refuse_update"() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'cid_event is append-only: write a new event instead of editing %', OLD."id";
END;
$$ LANGUAGE plpgsql;
CREATE TRIGGER "cid_event_no_update" BEFORE UPDATE ON "cid_event"
  FOR EACH ROW EXECUTE FUNCTION "cid_event_refuse_update"();

-- ── 4. Data: bring the registry in line, then backfill ─────────────────────────────────────────
DO $$
DECLARE
  v_default_org TEXT;
  r             RECORD;
  v_org         TEXT;
  v_prefix      TEXT;
  v_ist         TIMESTAMP;
  v_start       INT;
  v_fy          TEXT;
  v_serial      INT;
  v_cid         TEXT;
  v_actor       TEXT;
BEGIN
  SELECT "id" INTO v_default_org FROM "organization" ORDER BY "createdAt", "id" LIMIT 1;

  -- 4a. A code carried by a client but missing from the registry (legacy rows from before the
  --     registry existed) gets its registry row, so the number can never be issued twice.
  FOR r IN
    SELECT DISTINCT ON (x."org", x."code") x.*
    FROM (
      SELECT p."code", p."id", p."createdBy", p."createdAt",
             COALESCE(
               (SELECT u."organizationId" FROM "user" u WHERE u."id" = p."createdBy"),
               (SELECT u."organizationId" FROM "project_member" pm JOIN "user" u ON u."id" = pm."userId"
                 WHERE pm."projectId" = p."id" ORDER BY pm."isActive" DESC, pm."joinedAt" LIMIT 1),
               v_default_org
             ) AS "org"
      FROM "project" p
      WHERE p."code" IS NOT NULL AND p."code" ~ '^[A-Za-z0-9]+_[0-9]{2}_[0-9]{2}_[0-9]{1,6}$'
    ) x
    WHERE x."org" IS NOT NULL
    ORDER BY x."org", x."code", x."createdAt", x."id"
  LOOP
    IF NOT EXISTS (SELECT 1 FROM "pid_reservation" WHERE "organizationId" = r."org" AND "pid" = r."code") THEN
      INSERT INTO "pid_reservation" ("id", "organizationId", "fyLabel", "serial", "pid", "generatedById",
                                     "status", "projectId", "createdAt", "resolvedAt")
      VALUES ('lg' || md5(r."org" || ':' || r."code"), r."org",
              (regexp_match(r."code", '_([0-9]{2}_[0-9]{2})_[0-9]{1,6}$'))[1],
              ((regexp_match(r."code", '_([0-9]{1,6})$'))[1])::INT,
              r."code", COALESCE(r."createdBy", 'system'), 'ATTACHED', r."id", r."createdAt", r."createdAt");
    END IF;
  END LOOP;

  -- 4b. The old hold states disappear. A number generated and never attached was never given to a
  --     client, but it WAS shown to somebody — so it is retired rather than handed out again.
  UPDATE "pid_reservation" SET "status" = 'DISCONTINUED', "resolvedAt" = COALESCE("resolvedAt", CURRENT_TIMESTAMP)
  WHERE "status" IN ('RESERVED', 'RELEASED', 'EXPIRED');

  -- 4c. Every number's status is read off the clients that carry it:
  --       a live client carries it           → ATTACHED (pointing at the newest live, unfinished round)
  --       only soft-deleted clients carry it → DELETED  (still reserved to them; restorable)
  --       nothing carries it, was ATTACHED   → PURGED   (the client row was destroyed)
  --     A number already DISCONTINUED with no carrier stays DISCONTINUED.
  UPDATE "pid_reservation" rs SET
    "status" = 'ATTACHED',
    "projectId" = (
      SELECT p."id" FROM "project" p WHERE p."code" = rs."pid" AND p."deletedAt" IS NULL
      ORDER BY (p."projectPhase" IN ('COMPLETED', 'CLOSED', 'ARCHIVED', 'CANCELLED')), p."roundSeq" DESC, p."id" DESC
      LIMIT 1)
  WHERE EXISTS (SELECT 1 FROM "project" p WHERE p."code" = rs."pid" AND p."deletedAt" IS NULL);

  UPDATE "pid_reservation" rs SET
    "status" = 'DELETED',
    "projectId" = (
      SELECT p."id" FROM "project" p WHERE p."code" = rs."pid"
      ORDER BY p."deletedAt" DESC, p."id" DESC LIMIT 1)
  WHERE NOT EXISTS (SELECT 1 FROM "project" p WHERE p."code" = rs."pid" AND p."deletedAt" IS NULL)
    AND EXISTS (SELECT 1 FROM "project" p WHERE p."code" = rs."pid");

  UPDATE "pid_reservation" rs SET "status" = 'PURGED', "projectId" = NULL,
    "resolvedAt" = COALESCE("resolvedAt", CURRENT_TIMESTAMP)
  WHERE rs."status" = 'ATTACHED'
    AND NOT EXISTS (SELECT 1 FROM "project" p WHERE p."code" = rs."pid");

  -- 4d. Every number that existed before the ledger gets one IMPORTED event, dated when it was
  --     issued, so its timeline has a beginning.
  INSERT INTO "cid_event" ("id", "organizationId", "cid", "projectId", "clientTitle", "type", "toCid",
                           "actorId", "actorName", "metadata", "createdAt")
  SELECT 'imp' || md5(rs."organizationId" || ':' || rs."pid"), rs."organizationId", rs."pid",
         rs."projectId",
         (SELECT p."title" FROM "project" p WHERE p."code" = rs."pid" ORDER BY p."roundSeq", p."createdAt" LIMIT 1),
         'IMPORTED', rs."pid",
         u."id",
         CASE WHEN u."id" IS NOT NULL THEN trim(u."firstName" || ' ' || u."lastName") ELSE 'System' END,
         jsonb_build_object('note', 'Issued before the CID ledger existed', 'statusAtImport', rs."status"),
         rs."createdAt"
  FROM "pid_reservation" rs
  LEFT JOIN "user" u ON u."id" = rs."generatedById"
  WHERE NOT EXISTS (
    SELECT 1 FROM "cid_event" e WHERE e."organizationId" = rs."organizationId" AND e."cid" = rs."pid"
  );

  -- 4e. The backfill: every live client without a CID gets the next one in its organisation's
  --     series for the financial year it was created in (Indian FY, April–March, read in IST).
  --     The prefix is the organisation code made safe — letters and digits only, upper-cased, at
  --     most 16 characters, 'SQ' if nothing is left — exactly as CidService.cidPrefix does it.
  --     The next serial is one past the highest the organisation has EVER used in that year:
  --     the registry, any client's code, and a legacy sequence counter all count.
  FOR r IN
    SELECT p."id", p."title", p."createdAt", p."createdBy",
           COALESCE(
             (SELECT u."organizationId" FROM "user" u WHERE u."id" = p."createdBy"),
             (SELECT u."organizationId" FROM "project_member" pm JOIN "user" u ON u."id" = pm."userId"
               WHERE pm."projectId" = p."id" ORDER BY pm."isActive" DESC, pm."joinedAt" LIMIT 1),
             v_default_org
           ) AS "org"
    FROM "project" p
    WHERE p."deletedAt" IS NULL AND p."code" IS NULL
    ORDER BY p."createdAt", p."id"
  LOOP
    v_org := r."org";
    CONTINUE WHEN v_org IS NULL;
    SELECT COALESCE(NULLIF(left(upper(regexp_replace(o."code", '[^A-Za-z0-9]', '', 'g')), 16), ''), 'SQ')
      INTO v_prefix FROM "organization" o WHERE o."id" = v_org;
    v_prefix := COALESCE(v_prefix, 'SQ');
    v_ist := (r."createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Kolkata';
    v_start := CASE WHEN EXTRACT(MONTH FROM v_ist) >= 4 THEN EXTRACT(YEAR FROM v_ist)::INT
                    ELSE EXTRACT(YEAR FROM v_ist)::INT - 1 END;
    v_fy := lpad((v_start % 100)::TEXT, 2, '0') || '_' || lpad(((v_start + 1) % 100)::TEXT, 2, '0');

    SELECT GREATEST(
      COALESCE((SELECT MAX("serial") FROM "pid_reservation" WHERE "organizationId" = v_org AND "fyLabel" = v_fy), 0),
      COALESCE((SELECT MAX(substr(p2."code", length(v_prefix || '_' || v_fy || '_') + 1)::INT)
                FROM "project" p2
                WHERE starts_with(p2."code", v_prefix || '_' || v_fy || '_')
                  AND substr(p2."code", length(v_prefix || '_' || v_fy || '_') + 1) ~ '^[0-9]{1,6}$'), 0),
      COALESCE((SELECT "value" FROM "sequence_counter" WHERE "scope" = 'pid:' || v_org || ':' || v_fy), 0)
    ) + 1 INTO v_serial;
    v_cid := v_prefix || '_' || v_fy || '_' || lpad(v_serial::TEXT, 3, '0');

    SELECT u."id" INTO v_actor FROM "user" u WHERE u."id" = r."createdBy";

    INSERT INTO "pid_reservation" ("id", "organizationId", "fyLabel", "serial", "pid", "generatedById",
                                   "status", "projectId", "createdAt", "resolvedAt")
    VALUES ('bf' || md5(v_org || ':' || v_cid), v_org, v_fy, v_serial, v_cid,
            COALESCE(r."createdBy", 'system'), 'ATTACHED', r."id", CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);

    UPDATE "project" SET "code" = v_cid, "roundSeq" = 1 WHERE "id" = r."id";

    INSERT INTO "cid_event" ("id", "organizationId", "cid", "projectId", "clientTitle", "type", "toCid",
                             "actorId", "actorName", "metadata", "createdAt")
    VALUES ('bfe' || md5(v_org || ':' || v_cid || ':' || r."id"), v_org, v_cid, r."id", r."title",
            'BACKFILLED', v_cid, NULL, 'System (CID backfill)',
            jsonb_build_object('clientCreatedAt', r."createdAt", 'clientCreatedBy', v_actor,
                               'order', 'createdAt, then id'),
            CURRENT_TIMESTAMP);
  END LOOP;
END $$;

-- ── 5. Rules the database holds from now on ─────────────────────────────────────────────────────
ALTER TABLE "pid_reservation" ADD CONSTRAINT "pid_reservation_status_check"
  CHECK ("status" IN ('ATTACHED', 'DELETED', 'PURGED', 'MERGED', 'DISCONTINUED'));
ALTER TABLE "pid_reservation" ADD CONSTRAINT "pid_reservation_merged_has_target"
  CHECK (("status" = 'MERGED') = ("mergedIntoCid" IS NOT NULL));
ALTER TABLE "pid_reservation" ADD CONSTRAINT "pid_reservation_serial_positive" CHECK ("serial" >= 1);

-- Every live client has a CID. Minting happens inside the create transaction, and a restore of a
-- client that has none mints one in the same statement that brings it back.
ALTER TABLE "project" ADD CONSTRAINT "project_live_client_has_cid"
  CHECK ("deletedAt" IS NOT NULL OR "code" IS NOT NULL);
