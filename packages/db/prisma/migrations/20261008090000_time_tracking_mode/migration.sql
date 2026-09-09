-- Two ways of recording time, and the ability to move between them without losing the history.
--
--   TIMER  — a stopwatch per task (what the product has always done).
--   MANUAL — no stopwatch at all: finish or reopen a task, and fill the whole day's hours in once.
--
-- Every existing organisation gets TIMER, so nothing changes for anybody until an admin decides
-- otherwise. That default is the entire safety of this migration.
--
-- The two flows share ONE ledger — a timesheet row is a timesheet row whichever wrote it — so a
-- firm can run one flow for months, switch, and switch back without stranding anything.
-- `timesheet.source` records which flow wrote each row; existing rows get NULL because they were
-- written before anything recorded it, and inventing a value would be worse than admitting that.

ALTER TABLE "organization" ADD COLUMN IF NOT EXISTS "timeTrackingMode" TEXT NOT NULL DEFAULT 'TIMER';
ALTER TABLE "timesheet"    ADD COLUMN IF NOT EXISTS "source" TEXT;

-- A report covering March cannot be read honestly without knowing which flow was in force in
-- March, and leaving the stopwatch has to close the clocks that were running at that moment —
-- how many, and how much they held, is a fact somebody will want back.
CREATE TABLE IF NOT EXISTS "time_tracking_mode_change" (
    "id"             TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "fromMode"       TEXT NOT NULL,
    "toMode"         TEXT NOT NULL,
    "changedBy"      TEXT NOT NULL,
    "changedAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "note"           TEXT,
    "timersClosed"   INTEGER NOT NULL DEFAULT 0,
    "minutesClosed"  INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "time_tracking_mode_change_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "time_tracking_mode_change_org_idx"
  ON "time_tracking_mode_change"("organizationId", "changedAt");

-- Only the two flows that exist. A typo in an admin payload must not put the whole firm into a
-- mode nothing knows how to render.
DO $$ BEGIN
  ALTER TABLE "organization" ADD CONSTRAINT "organization_timeTrackingMode_check"
    CHECK ("timeTrackingMode" IN ('TIMER', 'MANUAL'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
