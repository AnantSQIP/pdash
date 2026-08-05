-- Completion capture: when the work was delivered to the client, and what it cost in hours.
-- Additive and nullable — every existing project simply has no delivery record.
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "clientDeliveryDate" TIMESTAMP(3);
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "workingHours" DOUBLE PRECISION;
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "actualHours" DOUBLE PRECISION;
