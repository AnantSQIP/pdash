-- One PID, many projects ("rounds").
--
-- A returning client keeps the PID they already know, and each new piece of work for them becomes
-- a new project row sharing that code. project.code therefore stops being unique. PID uniqueness
-- is unaffected: pid_reservation(organizationId, pid) is still UNIQUE and remains the single
-- authority for which serials exist, so no two PIDs can ever collide.
DROP INDEX IF EXISTS "project_code_key";
CREATE INDEX IF NOT EXISTS "project_code_idx" ON "project"("code");

-- Which round a project is under its PID. Every existing project is round 1.
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "roundSeq" INTEGER NOT NULL DEFAULT 1;

-- The office that owns the matter. Jaipur supports rounds; Gurgaon is unchanged.
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "office" TEXT;

-- Backfill: an existing project belongs to whichever office its creator sits in.
UPDATE "project" p
   SET "office" = u."office"
  FROM "user" u
 WHERE u."id" = p."createdBy"
   AND p."office" IS NULL
   AND u."office" IS NOT NULL;
