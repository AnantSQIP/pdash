-- Employment lifecycle and leave accrual.
--
-- Three gaps this closes, all of which turned out to rest on the same missing fact — nobody's
-- joining date was recorded, so nothing could be derived from length of service.
--
--   1. Leave was granted in full regardless of when somebody joined. With a quarter of the firm
--      on internships, a three-month intern received a full year's allowance.
--   2. Nothing survived 31 December. Unused Earned Leave silently vanished at midnight.
--   3. Probation and exit were tracked outside the system entirely.
--
-- Every column is nullable or defaulted, and every default reproduces today's behaviour exactly:
-- accrualMode ANNUAL, no pro-rating, no carry-forward. Nobody's entitlement moves until somebody
-- deliberately changes a policy.

-- ── Leave policy, per type ────────────────────────────────────────────────────
ALTER TABLE "leave_type"
  ADD COLUMN IF NOT EXISTS "accrualMode"     TEXT             NOT NULL DEFAULT 'ANNUAL',
  ADD COLUMN IF NOT EXISTS "monthlyRate"     DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "prorateOnJoin"   BOOLEAN          NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "carryForward"    BOOLEAN          NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "carryForwardCap" INTEGER;

-- ── What was carried into a leave year ────────────────────────────────────────
-- Stored, not derived: deriving it would recompute every prior year on each balance read, and a
-- later policy change would silently rewrite history people have already been told.
CREATE TABLE IF NOT EXISTS "leave_opening_balance" (
  "id"          TEXT PRIMARY KEY,
  "userId"      TEXT NOT NULL,
  "leaveTypeId" TEXT NOT NULL,
  "year"        INTEGER NOT NULL,
  "days"        DOUBLE PRECISION NOT NULL,
  "source"      TEXT NOT NULL DEFAULT 'CARRY_FORWARD',
  "note"        TEXT,
  "createdBy"   TEXT,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);

DO $$ BEGIN
  ALTER TABLE "leave_opening_balance"
    ADD CONSTRAINT "leave_opening_balance_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  ALTER TABLE "leave_opening_balance"
    ADD CONSTRAINT "leave_opening_balance_leaveTypeId_fkey"
    FOREIGN KEY ("leaveTypeId") REFERENCES "leave_type"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- One statement per person, per type, per year. Re-running a year-end roll must update the row
-- rather than stack a second one on top of it.
CREATE UNIQUE INDEX IF NOT EXISTS "leave_opening_balance_userId_leaveTypeId_year_key"
  ON "leave_opening_balance"("userId", "leaveTypeId", "year");
CREATE INDEX IF NOT EXISTS "leave_opening_balance_year_idx"
  ON "leave_opening_balance"("year");

-- ── Employment lifecycle on the person ────────────────────────────────────────
-- Probation END is deliberately absent: it is joiningDate + probationMonths, computed on read.
-- A stored end date is a second copy of the same fact that goes stale when a joining date is
-- corrected, and joining dates get corrected.
ALTER TABLE "user"
  ADD COLUMN IF NOT EXISTS "probationMonths"   INTEGER,
  ADD COLUMN IF NOT EXISTS "confirmedAt"       TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "confirmedBy"       TEXT,
  ADD COLUMN IF NOT EXISTS "confirmationNote"  TEXT,
  ADD COLUMN IF NOT EXISTS "resignationDate"   TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "noticeDays"        INTEGER,
  ADD COLUMN IF NOT EXISTS "lastWorkingDay"    TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "exitReason"        TEXT,
  ADD COLUMN IF NOT EXISTS "exitCompletedAt"   TIMESTAMP(3);

-- Finding who is due for confirmation, or serving notice, is a scan of the whole roster today.
CREATE INDEX IF NOT EXISTS "user_confirmedAt_idx"    ON "user"("organizationId", "confirmedAt");
CREATE INDEX IF NOT EXISTS "user_lastWorkingDay_idx" ON "user"("organizationId", "lastWorkingDay");
