-- A short label for a timesheet entry — used by "OTHER" (non-project) time, which has no task
-- to take its name from. Strictly ADDITIVE: one new nullable column; existing rows get NULL.
-- Applies cleanly on the live server via `prisma migrate deploy` on boot.
ALTER TABLE "timesheet" ADD COLUMN "title" TEXT;
