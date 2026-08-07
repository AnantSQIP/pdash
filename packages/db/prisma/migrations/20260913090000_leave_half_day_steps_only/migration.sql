-- Leave is counted in WHOLE and HALF days only.
--
-- Hourly leave was charged pro-rata against an 8-hour day, so a 3-hour absence became 0.375 of
-- a day and balances started carrying fractions nobody could have asked for. The feature is
-- withdrawn and the rule is written into the table, because a balance should not depend on
-- every future caller remembering to round correctly.
--
-- 0.5, 1, 1.5 … are exactly representable in binary floating point, so `x * 2 = floor(x * 2)`
-- is an exact test here — no tolerance needed.

-- Any leave that was recorded in hours becomes the nearest half day, rounded UP so nobody is
-- charged less than they actually took. (Expected to affect 0 rows: hourly leave shipped and
-- was withdrawn without reaching production.)
UPDATE "leave_request"
   SET "numDays" = GREATEST(0.5, CEIL("numDays" * 2) / 2.0),
       "dayType" = CASE WHEN "dayType" = 'HOURLY'
                        THEN CASE WHEN CEIL("numDays" * 2) / 2.0 <= 0.5 THEN 'HALF' ELSE 'FULL' END
                        ELSE "dayType" END
 WHERE "numDays" * 2 <> FLOOR("numDays" * 2)
    OR "dayType" = 'HOURLY';

UPDATE "leave_request"
   SET "encashmentDays" = CEIL("encashmentDays" * 2) / 2.0
 WHERE "encashmentDays" IS NOT NULL
   AND "encashmentDays" * 2 <> FLOOR("encashmentDays" * 2);

-- A HALF request must sit on exactly one date, or "half day" would mean half of each of them.
UPDATE "leave_request" SET "endDate" = "startDate"
 WHERE "dayType" = 'HALF' AND date_trunc('day', "endDate") <> date_trunc('day', "startDate");

ALTER TABLE "leave_request" DROP COLUMN IF EXISTS "startTime";
ALTER TABLE "leave_request" DROP COLUMN IF EXISTS "endTime";

ALTER TABLE "leave_request" DROP CONSTRAINT IF EXISTS "leave_request_daytype_check";
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_daytype_check"
  CHECK ("dayType" IN ('FULL', 'HALF'));

ALTER TABLE "leave_request" DROP CONSTRAINT IF EXISTS "leave_request_numdays_half_step";
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_numdays_half_step"
  CHECK ("numDays" > 0 AND "numDays" * 2 = FLOOR("numDays" * 2));

ALTER TABLE "leave_request" DROP CONSTRAINT IF EXISTS "leave_request_encashment_half_step";
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_encashment_half_step"
  CHECK ("encashmentDays" IS NULL
         OR ("encashmentDays" >= 0 AND "encashmentDays" * 2 = FLOOR("encashmentDays" * 2)));

-- A half day is 0.5 by definition; anything else in that column is a contradiction.
ALTER TABLE "leave_request" DROP CONSTRAINT IF EXISTS "leave_request_half_is_point_five";
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_half_is_point_five"
  CHECK ("dayType" <> 'HALF' OR "numDays" = 0.5);

-- Comp-off claims feed the same balance, so they inherit the same vocabulary.
ALTER TABLE "comp_off_request" DROP CONSTRAINT IF EXISTS "comp_off_daytype_check";
ALTER TABLE "comp_off_request" ADD CONSTRAINT "comp_off_daytype_check"
  CHECK ("dayType" IN ('FULL', 'HALF'));
