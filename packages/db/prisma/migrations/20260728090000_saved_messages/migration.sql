-- Saved messages: a personal bookmark of a discussion message.

CREATE TABLE "saved_message" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "saved_message_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "saved_message_userId_messageId_key" ON "saved_message"("userId", "messageId");
CREATE INDEX "saved_message_userId_idx" ON "saved_message"("userId");
ALTER TABLE "saved_message" ADD CONSTRAINT "saved_message_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "saved_message" ADD CONSTRAINT "saved_message_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;
