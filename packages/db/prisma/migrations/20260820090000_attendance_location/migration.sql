-- Attendance punch location: lat/lng + GPS accuracy captured at check-in and check-out.
-- Strictly ADDITIVE: six new nullable columns; existing rows get NULL. Applies via
-- `prisma migrate deploy` on API boot.
ALTER TABLE "attendance"
  ADD COLUMN "checkInLat" DOUBLE PRECISION,
  ADD COLUMN "checkInLng" DOUBLE PRECISION,
  ADD COLUMN "checkInAcc" DOUBLE PRECISION,
  ADD COLUMN "checkOutLat" DOUBLE PRECISION,
  ADD COLUMN "checkOutLng" DOUBLE PRECISION,
  ADD COLUMN "checkOutAcc" DOUBLE PRECISION;
