-- 3d Channel governance: archive (read-only) + retention (auto-tombstone old messages).
ALTER TABLE "channel" ADD COLUMN "archivedAt" TIMESTAMP(3);
ALTER TABLE "channel" ADD COLUMN "archivedBy" TEXT;
ALTER TABLE "channel" ADD COLUMN "retentionDays" INTEGER;
