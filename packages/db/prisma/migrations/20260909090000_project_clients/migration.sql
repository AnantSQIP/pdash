-- DELIVERY CLIENTS: which company a Project ID belongs to.
--
-- Separate from "client", which exists to mint confidential patent handles (Pat_MLK_001) and sits
-- behind the passcode. This one answers "who is this PID for" and "what work do we have for this
-- client" — one client, many PIDs.
--
-- The CODE is shareable (anyone who can see a project sees it); the NAME and contact details are
-- restricted to Super Admins and redacted server-side for everyone else.
CREATE TABLE IF NOT EXISTS "project_client" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "code"           TEXT NOT NULL,
  "name"           TEXT,
  "contactName"    TEXT,
  "contactEmail"   TEXT,
  "contactPhone"   TEXT,
  "address"        TEXT,
  "notes"          TEXT,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdBy"      TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "project_client_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "project_client_organizationId_code_key"
  ON "project_client"("organizationId", "code");
CREATE INDEX IF NOT EXISTS "project_client_organizationId_deletedAt_idx"
  ON "project_client"("organizationId", "deletedAt");

DO $$ BEGIN
  ALTER TABLE "project_client"
    ADD CONSTRAINT "project_client_organizationId_fkey"
    FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- The project's delivery client. Additive and nullable: every existing project simply has none
-- until one is attached.
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "projectClientId" TEXT;
CREATE INDEX IF NOT EXISTS "project_projectClientId_idx" ON "project"("projectClientId");

DO $$ BEGIN
  ALTER TABLE "project"
    ADD CONSTRAINT "project_projectClientId_fkey"
    FOREIGN KEY ("projectClientId") REFERENCES "project_client"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Backfill: every project already carrying a PATENT client gets a matching delivery client with
-- the same code, so the two never name the same company under two different codes.
INSERT INTO "project_client" ("id", "organizationId", "code", "name", "createdBy", "updatedAt")
SELECT gen_random_uuid()::text, c."organizationId", c."code", c."name", c."createdBy", CURRENT_TIMESTAMP
  FROM "client" c
 WHERE c."deletedAt" IS NULL
   AND EXISTS (SELECT 1 FROM "project" p WHERE p."clientId" = c."id" AND p."deletedAt" IS NULL)
ON CONFLICT ("organizationId", "code") DO NOTHING;

UPDATE "project" p
   SET "projectClientId" = pc."id"
  FROM "client" c
  JOIN "project_client" pc
    ON pc."organizationId" = c."organizationId" AND pc."code" = c."code"
 WHERE p."clientId" = c."id"
   AND p."projectClientId" IS NULL;
