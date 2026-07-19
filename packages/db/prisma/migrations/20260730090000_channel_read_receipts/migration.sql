-- 3c Read receipts: per-user read position in a channel (unread badges + seen-by).
CREATE TABLE "channel_read" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastReadAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastReadMessageId" TEXT,

    CONSTRAINT "channel_read_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "channel_read_channelId_userId_key" ON "channel_read"("channelId", "userId");
CREATE INDEX "channel_read_channelId_idx" ON "channel_read"("channelId");

ALTER TABLE "channel_read" ADD CONSTRAINT "channel_read_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "channel_read" ADD CONSTRAINT "channel_read_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
