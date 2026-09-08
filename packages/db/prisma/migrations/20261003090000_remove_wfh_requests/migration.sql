-- Work-from-home is no longer a request flow, and is no longer chosen at punch time.
-- The ONE way a day is recorded as worked from home is an approved regularisation request of
-- type WFH, which sets attendance.workMode — that column stays; everything else goes.

DROP TABLE IF EXISTS "wfh_request";

-- Approving a request published a "Working from home" row to the shared calendar.
DELETE FROM "calendar_event" WHERE "type" = 'WFH';

-- The request flow's own notifications (wfh.requested / wfh.approved / wfh.rejected).
DELETE FROM "notification" WHERE "type" LIKE 'wfh.%';

-- The seeded policy described two ways to work from home; only one exists now. Rewritten only
-- while it still carries the seeded text — a policy HR has edited is HR's.
UPDATE "policy"
   SET "body" = E'HOW A DAY BECOMES A WORK-FROM-HOME DAY\n\nWorking from home is not requested in advance and is not chosen at punch time. Punch in and out\nas usual, then raise a regularisation request for that date from the Attendance section and pick\n"Worked from home" as the type. HR reviews it (attendance.regularize); on approval the day is\nrecorded as worked from home.\n\nWHAT IT IS NOT\n\nWorking from home is a place of work, not a leave type. It does not consume any leave balance,\nand it counts as a full working day.', "updatedAt" = NOW()
 WHERE "title" = 'Working from home' AND "body" LIKE 'TWO WAYS A DAY BECOMES A WORK-FROM-HOME DAY%';
