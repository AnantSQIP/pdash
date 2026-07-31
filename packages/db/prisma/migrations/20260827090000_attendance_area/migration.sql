-- Reverse-geocoded punch area/landmark (from the punch coordinates). Additive nullable columns.
ALTER TABLE "attendance" ADD COLUMN "checkInArea" TEXT;
ALTER TABLE "attendance" ADD COLUMN "checkOutArea" TEXT;
