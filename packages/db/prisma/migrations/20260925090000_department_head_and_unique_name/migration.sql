-- Departments: an explicit head, and names that cannot collide.
--
-- WHY: the head was inferred by running /head|lead|manager/i over each member's free-text
-- roleInDepartment. "Team Leader" matched on "lead"; a coordinator titled "Manager, Operations"
-- matched on "manager"; and where two members matched, the winner was whoever joined first.
-- Who runs a department is a decision, so it is now stored as one.
--
-- Additive and idempotent. Safe to run against live data: the backfill preserves whatever the old
-- regex would have chosen, so no existing head is lost, and the de-duplication below runs BEFORE
-- the unique index so the migration cannot fail on data that is already in the table.

-- 1. The explicit head column.
ALTER TABLE "department" ADD COLUMN IF NOT EXISTS "headUserId" TEXT;

-- 2. Preserve the head the regex would have picked — earliest-joined matching member, which is
--    exactly the old tie-break. Only where a head is not already set.
UPDATE "department" d
SET "headUserId" = sub."userId"
FROM (
  SELECT dm."departmentId", dm."userId",
         ROW_NUMBER() OVER (PARTITION BY dm."departmentId" ORDER BY dm."joinedAt" ASC) AS rn
  FROM "department_member" dm
  WHERE dm."roleInDepartment" ~* '(head|lead|manager)'
) sub
WHERE sub."departmentId" = d.id AND sub.rn = 1 AND d."headUserId" IS NULL;

-- 3. The head must be a member of the department it heads. Anything else is a data error, so
--    clear it rather than carry it forward into a constraint that will reject it later.
UPDATE "department" d SET "headUserId" = NULL
WHERE d."headUserId" IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM "department_member" dm
    WHERE dm."departmentId" = d.id AND dm."userId" = d."headUserId"
  );

-- 4. Foreign key. ON DELETE SET NULL: deleting a person must not delete the department they ran.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'department_headUserId_fkey') THEN
    ALTER TABLE "department"
      ADD CONSTRAINT "department_headUserId_fkey"
      FOREIGN KEY ("headUserId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
  END IF;
END $$;

-- 5. De-duplicate names BEFORE the unique index, or the index creation fails on existing rows.
--    Keeps the oldest row's name untouched and suffixes the rest, so nothing is deleted and an
--    administrator can see exactly what needs renaming.
UPDATE "department" d
SET name = d.name || ' (' || sub.rn || ')'
FROM (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY "organizationId", lower(name) ORDER BY id ASC) AS rn
  FROM "department"
) sub
WHERE sub.id = d.id AND sub.rn > 1;

-- 6. One name per organisation.
CREATE UNIQUE INDEX IF NOT EXISTS "department_organizationId_name_key"
  ON "department"("organizationId", "name");
