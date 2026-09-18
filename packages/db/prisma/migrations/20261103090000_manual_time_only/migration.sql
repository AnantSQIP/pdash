-- CLIENTS FLOW: time is recorded one way only — Finish / Reopen on a task, and Log time for the day.
-- The stopwatch is retired (owner's decision, Sep 2026).
--
-- 1. Any clock still running is CLOSED, keeping the minutes it holds (capped at the same 12 hours
--    the stale sweep uses), because deleting them would erase work people actually did and leaving
--    them open would let them grow with nothing left to stop them.
-- 2. Every organisation still on TIMER moves to MANUAL, and the move is written to the switch
--    history exactly as an admin's switch would be, so a report over an older window still says
--    which flow was in force then.
-- 3. New organisations start on MANUAL.
--
-- Re-runnable: a second run finds no open clocks and no TIMER organisations and changes nothing.

WITH closing AS (
  SELECT s."id",
         u."organizationId",
         LEAST(720, GREATEST(0, ROUND(EXTRACT(EPOCH FROM (CURRENT_TIMESTAMP - s."startedAt")) / 60)))::int AS mins
    FROM "task_work_session" s
    JOIN "user" u ON u."id" = s."userId"
   WHERE s."endedAt" IS NULL
), closed AS (
  UPDATE "task_work_session" s
     SET "endedAt" = CURRENT_TIMESTAMP, "minutes" = c.mins
    FROM closing c
   WHERE s."id" = c."id"
  RETURNING c."organizationId", c.mins
), per_org AS (
  SELECT "organizationId", COUNT(*)::int AS timers, COALESCE(SUM(mins), 0)::int AS minutes
    FROM closed GROUP BY "organizationId"
)
INSERT INTO "time_tracking_mode_change"
  ("id", "organizationId", "fromMode", "toMode", "changedBy", "changedAt", "note", "timersClosed", "minutesClosed")
SELECT 'ttmc_' || md5(o."id" || '-manual-only-2026-09'),
       o."id", 'TIMER', 'MANUAL', 'system', CURRENT_TIMESTAMP,
       'Clients flow: the timer was retired; time is logged from My Tasks.',
       COALESCE(p.timers, 0), COALESCE(p.minutes, 0)
  FROM "organization" o
  LEFT JOIN per_org p ON p."organizationId" = o."id"
 WHERE o."timeTrackingMode" = 'TIMER'
ON CONFLICT ("id") DO NOTHING;

UPDATE "organization" SET "timeTrackingMode" = 'MANUAL' WHERE "timeTrackingMode" = 'TIMER';

ALTER TABLE "organization" ALTER COLUMN "timeTrackingMode" SET DEFAULT 'MANUAL';
