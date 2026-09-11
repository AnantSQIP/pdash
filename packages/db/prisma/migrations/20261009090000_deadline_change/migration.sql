-- Every time a deadline moved, and who moved it.
--
-- Additive and idempotent: one new table, no change to any existing one, so it applies to a
-- populated database in place with nothing to back-fill and nothing to lock.
CREATE TABLE IF NOT EXISTS "deadline_change" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "entityType"     TEXT NOT NULL,
    "entityId"       TEXT NOT NULL,
    "projectId"      TEXT,
    "previousDate"   TIMESTAMP(3),
    "newDate"        TIMESTAMP(3),
    "shiftDays"      INTEGER NOT NULL DEFAULT 0,
    "changedById"    TEXT NOT NULL,
    "reason"         TEXT,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "deadline_change_pkey" PRIMARY KEY ("id")
);

-- A shift is only a shift when there was a previous date to move away from. Setting a deadline
-- for the first time is not a breach of anything, and the reports must never count it as one.
ALTER TABLE "deadline_change" DROP CONSTRAINT IF EXISTS "deadline_change_entity_type_check";
ALTER TABLE "deadline_change" ADD CONSTRAINT "deadline_change_entity_type_check"
    CHECK ("entityType" IN ('PROJECT', 'TASK'));

CREATE INDEX IF NOT EXISTS "deadline_change_organizationId_createdAt_idx" ON "deadline_change"("organizationId", "createdAt");
CREATE INDEX IF NOT EXISTS "deadline_change_entityType_entityId_idx"      ON "deadline_change"("entityType", "entityId");
CREATE INDEX IF NOT EXISTS "deadline_change_projectId_createdAt_idx"      ON "deadline_change"("projectId", "createdAt");
