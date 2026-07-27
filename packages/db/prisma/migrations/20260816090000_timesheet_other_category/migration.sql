-- "Other" (non-project) timesheet category.
-- Strictly ADDITIVE: one new nullable column. Existing rows get NULL (= a normal
-- project/buffer/issue entry), so behaviour is unchanged. An entry with category = 'OTHER'
-- is miscellaneous non-project time — always non-billable, never a PID buffer to assign.
-- Applies cleanly on the live server via `prisma migrate deploy` on boot.
ALTER TABLE "timesheet" ADD COLUMN "category" TEXT;
