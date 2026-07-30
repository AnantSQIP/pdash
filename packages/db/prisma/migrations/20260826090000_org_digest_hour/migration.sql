-- Admin-editable hour (IST) for the daily digest. Additive with a default. Applies on API boot.
ALTER TABLE "organization" ADD COLUMN "digestHourIst" INTEGER NOT NULL DEFAULT 22;
