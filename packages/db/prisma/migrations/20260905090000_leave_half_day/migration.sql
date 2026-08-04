-- Half-day leave. Additive and backward compatible: every existing request is a full day, and
-- numDays already carries the count, so nothing needs backfilling beyond the default.
ALTER TABLE "leave_request" ADD COLUMN IF NOT EXISTS "dayType" TEXT NOT NULL DEFAULT 'FULL';
ALTER TABLE "leave_request" ADD COLUMN IF NOT EXISTS "halfPeriod" TEXT;
