-- Somebody standing in for somebody else on a task, for named days or for good.
--
-- Covering an absence used to go through the staffing call, which REPLACES the seats on a task:
-- the original staffing was destroyed, there was no way back when the leave was cancelled, and it
-- could only ever be all-or-nothing. A seat is unique per person per role, so "Priya takes days 3
-- to 5 and Anant keeps the rest" had nowhere to live at all.
--
-- Held as its own row, the cover is a fact with an author, a reason and a date range. Withdrawing
-- it restores the original plan exactly, because the original plan was never overwritten.
--
-- Purely additive: no existing row changes, and a task with no coverage behaves as it always did.

CREATE TABLE IF NOT EXISTS "task_coverage" (
    "id"         TEXT NOT NULL,
    "taskId"     TEXT NOT NULL,
    "fromUserId" TEXT NOT NULL,
    "toUserId"   TEXT NOT NULL,
    "fromDate"   TIMESTAMP(3) NOT NULL,
    -- NULL = a permanent handover, with no date it comes back.
    "toDate"     TIMESTAMP(3),
    "mode"       TEXT NOT NULL DEFAULT 'COVER',
    "reason"     TEXT,
    "createdBy"  TEXT NOT NULL,
    "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    -- Kept rather than deleted: who covered whom, and why, is a question a firm has to answer.
    "revokedAt"  TIMESTAMP(3),
    "revokedBy"  TEXT,
    CONSTRAINT "task_coverage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "task_coverage_taskId_idx"     ON "task_coverage"("taskId");
CREATE INDEX IF NOT EXISTS "task_coverage_fromUserId_idx" ON "task_coverage"("fromUserId");
CREATE INDEX IF NOT EXISTS "task_coverage_toUserId_idx"   ON "task_coverage"("toUserId");

DO $$ BEGIN
  ALTER TABLE "task_coverage" ADD CONSTRAINT "task_coverage_taskId_fkey"
    FOREIGN KEY ("taskId") REFERENCES "task"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "task_coverage" ADD CONSTRAINT "task_coverage_fromUserId_fkey"
    FOREIGN KEY ("fromUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "task_coverage" ADD CONSTRAINT "task_coverage_toUserId_fkey"
    FOREIGN KEY ("toUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- A day cannot be covered twice for the same person on the same task: the hours would be counted
-- on two people at once. Ranges overlap-check in the service (Postgres cannot express it in a
-- plain unique index), but the same (task, from, to, fromDate) pair is refused outright.
CREATE UNIQUE INDEX IF NOT EXISTS "task_coverage_unique_live"
  ON "task_coverage"("taskId", "fromUserId", "fromDate")
  WHERE "revokedAt" IS NULL;
