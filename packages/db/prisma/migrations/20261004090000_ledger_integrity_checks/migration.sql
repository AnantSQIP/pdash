-- Integrity rules the timesheet ledger has always enforced in code, now also held by the database.
--
-- NOT VALID: the constraint applies to every row written from now on, and the existing rows are
-- not scanned at deploy time — so a historical row that predates a rule cannot fail the deploy.
-- Validate them afterwards, at a quiet moment, with:
--     ALTER TABLE "timesheet" VALIDATE CONSTRAINT "timesheet_hours_in_range";
--     ALTER TABLE "timesheet" VALIDATE CONSTRAINT "timesheet_task_xor_issue";
-- A validation failure names the offending rows; nothing else changes.

-- An entry is between a quarter hour and the whole daily cap (16h — the same figure the API
-- enforces as the SUM across a person's day, so no single row can ever exceed it).
ALTER TABLE "timesheet"
  ADD CONSTRAINT "timesheet_hours_in_range" CHECK ("hoursLogged" > 0 AND "hoursLogged" <= 16) NOT VALID;

-- Time is booked against a task OR against an issue, never both: Task.actualHours is the sum of
-- its task entries, and an entry counted under both would be billed twice.
ALTER TABLE "timesheet"
  ADD CONSTRAINT "timesheet_task_xor_issue" CHECK (NOT ("taskId" IS NOT NULL AND "issueId" IS NOT NULL)) NOT VALID;
