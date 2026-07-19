-- Presence: one row per user (manual status + heartbeat). Effective presence is
-- computed on read from lastSeenAt plus approved leave/WFH — never stored.

CREATE TABLE "presence" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" TEXT,
    "statusMessage" TEXT,
    "statusExpiresAt" TIMESTAMP(3),
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "presence_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "presence_userId_key" ON "presence"("userId");
ALTER TABLE "presence" ADD CONSTRAINT "presence_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
