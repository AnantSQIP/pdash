-- A seat on a task learns WHEN ITS PERSON STARTS, and optionally how much of a day it may take.
--
-- The capacity board had no way to know when work was meant to happen, only when it was due, so
-- it spread every task evenly from today to its deadline. Seven hours due in ten days showed as
-- 0.7h on each of ten days: nobody ever looked free, no day could be claimed for one job, and a
-- genuinely impossible fortnight read as a mildly full one.
--
-- Purely additive, and NULL is the pre-existing behaviour: a seat with no startDate is still
-- spread to its deadline exactly as before. Every row that exists when this runs gets NULL, so
-- nothing on the board moves until somebody actually schedules something.

ALTER TABLE "task_assignee" ADD COLUMN IF NOT EXISTS "startDate" TIMESTAMP(3);
ALTER TABLE "task_assignee" ADD COLUMN IF NOT EXISTS "hoursPerDay" DOUBLE PRECISION;
