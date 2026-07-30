-- Comp-off day type (FULL | HALF) — drives whether an approved comp-off day requires 8h or 4h of
-- timesheet, and how attendance is marked. Additive with a default so existing rows stay valid.
ALTER TABLE "comp_off_request" ADD COLUMN "dayType" TEXT NOT NULL DEFAULT 'FULL';
