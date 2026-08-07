-- Leave encashment is withdrawn: this organisation does not pay leave out, so the field only
-- offered a way to record something that never happens. Dropping it rather than hiding it,
-- because a column nobody fills is a column somebody eventually misreads.
ALTER TABLE "leave_request" DROP CONSTRAINT IF EXISTS "leave_request_encashment_half_step";
ALTER TABLE "leave_request" DROP COLUMN IF EXISTS "encashmentDays";
