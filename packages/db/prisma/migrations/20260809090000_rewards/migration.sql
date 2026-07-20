-- Recognition / rewards given to employees (tallied per financial year, visible to all).
CREATE TABLE "reward" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "givenById" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "message" TEXT,
    "awardedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "reward_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "reward_organizationId_awardedAt_idx" ON "reward"("organizationId", "awardedAt");
CREATE INDEX "reward_recipientId_idx" ON "reward"("recipientId");

ALTER TABLE "reward" ADD CONSTRAINT "reward_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reward" ADD CONSTRAINT "reward_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reward" ADD CONSTRAINT "reward_givenById_fkey" FOREIGN KEY ("givenById") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
