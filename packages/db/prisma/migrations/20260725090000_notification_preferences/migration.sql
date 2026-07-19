-- Per-user notification preferences. Consulted before a notification is written, so
-- muting a category or channel prevents the row from being created for that person.

CREATE TABLE "notification_preference" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "types" JSONB,
    "mutedChannels" JSONB,
    "quietStart" INTEGER,
    "quietEnd" INTEGER,
    "soundEnabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "notification_preference_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "notification_preference_userId_key" ON "notification_preference"("userId");
ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
