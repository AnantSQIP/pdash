-- Discuss chat upgrade: message edit/delete/pin state, emoji reactions, and @mentions.

ALTER TABLE "message" ADD COLUMN "editedAt" TIMESTAMP(3);
ALTER TABLE "message" ADD COLUMN "deletedAt" TIMESTAMP(3);
ALTER TABLE "message" ADD COLUMN "pinnedAt" TIMESTAMP(3);
ALTER TABLE "message" ADD COLUMN "pinnedBy" TEXT;

CREATE TABLE "message_reaction" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "emoji" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "message_reaction_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "message_reaction_messageId_userId_emoji_key" ON "message_reaction"("messageId", "userId", "emoji");
CREATE INDEX "message_reaction_messageId_idx" ON "message_reaction"("messageId");
ALTER TABLE "message_reaction" ADD CONSTRAINT "message_reaction_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_reaction" ADD CONSTRAINT "message_reaction_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "message_mention" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,

    CONSTRAINT "message_mention_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "message_mention_messageId_userId_key" ON "message_mention"("messageId", "userId");
CREATE INDEX "message_mention_userId_idx" ON "message_mention"("userId");
ALTER TABLE "message_mention" ADD CONSTRAINT "message_mention_messageId_fkey"
    FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "message_mention" ADD CONSTRAINT "message_mention_userId_fkey"
    FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
