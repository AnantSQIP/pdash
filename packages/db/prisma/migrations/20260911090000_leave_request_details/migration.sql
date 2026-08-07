-- Extra detail on a leave request: hourly leave, who covers, and proof.
-- All additive and nullable — existing requests are untouched and stay valid.
ALTER TABLE "leave_request"
  ADD COLUMN IF NOT EXISTS "startTime"           TEXT,
  ADD COLUMN IF NOT EXISTS "endTime"             TEXT,
  ADD COLUMN IF NOT EXISTS "alternateEmployeeId" TEXT,
  ADD COLUMN IF NOT EXISTS "alternateNumber"     TEXT,
  ADD COLUMN IF NOT EXISTS "alternateAddress"    TEXT,
  ADD COLUMN IF NOT EXISTS "encashmentDays"      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "supportingDocId"     TEXT;

CREATE INDEX IF NOT EXISTS "leave_request_alternateEmployeeId_idx"
  ON "leave_request"("alternateEmployeeId");

-- SetNull on both: losing the cover person or the document must not delete the leave record.
ALTER TABLE "leave_request" DROP CONSTRAINT IF EXISTS "leave_request_alternateEmployeeId_fkey";
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_alternateEmployeeId_fkey"
  FOREIGN KEY ("alternateEmployeeId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "leave_request" DROP CONSTRAINT IF EXISTS "leave_request_supportingDocId_fkey";
ALTER TABLE "leave_request" ADD CONSTRAINT "leave_request_supportingDocId_fkey"
  FOREIGN KEY ("supportingDocId") REFERENCES "document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
