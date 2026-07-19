-- Polls in Discuss: a message can BE a poll (message.pollId 1:1 → poll), with options
-- and single/multiple-choice votes.

ALTER TABLE "message" ADD COLUMN "pollId" TEXT;
CREATE UNIQUE INDEX "message_pollId_key" ON "message"("pollId");

CREATE TABLE "poll" (
    "id" TEXT NOT NULL,
    "channelId" TEXT NOT NULL,
    "createdBy" TEXT NOT NULL,
    "question" TEXT NOT NULL,
    "multiple" BOOLEAN NOT NULL DEFAULT false,
    "closedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "poll_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "poll_channelId_idx" ON "poll"("channelId");

CREATE TABLE "poll_option" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "text" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "poll_option_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "poll_option_pollId_idx" ON "poll_option"("pollId");

CREATE TABLE "poll_vote" (
    "id" TEXT NOT NULL,
    "pollId" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    CONSTRAINT "poll_vote_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "poll_vote_pollId_userId_optionId_key" ON "poll_vote"("pollId", "userId", "optionId");
CREATE INDEX "poll_vote_pollId_idx" ON "poll_vote"("pollId");

ALTER TABLE "message" ADD CONSTRAINT "message_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "poll"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "poll" ADD CONSTRAINT "poll_channelId_fkey" FOREIGN KEY ("channelId") REFERENCES "channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll" ADD CONSTRAINT "poll_createdBy_fkey" FOREIGN KEY ("createdBy") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_option" ADD CONSTRAINT "poll_option_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_vote" ADD CONSTRAINT "poll_vote_pollId_fkey" FOREIGN KEY ("pollId") REFERENCES "poll"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_vote" ADD CONSTRAINT "poll_vote_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "poll_option"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "poll_vote" ADD CONSTRAINT "poll_vote_userId_fkey" FOREIGN KEY ("userId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
