-- TeamNest port TN P2: company announcements + HR policy library.
CREATE TABLE "announcement" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "pinnedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "announcement_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "announcement_organizationId_idx" ON "announcement"("organizationId");

CREATE TABLE "policy" (
    "id" TEXT NOT NULL,
    "organizationId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "category" TEXT,
    "body" TEXT,
    "documentId" TEXT,
    "requiresAck" BOOLEAN NOT NULL DEFAULT false,
    "publishedBy" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "policy_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "policy_organizationId_idx" ON "policy"("organizationId");

CREATE TABLE "policy_acknowledgement" (
    "id" TEXT NOT NULL,
    "policyId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "acknowledgedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "policy_acknowledgement_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "policy_acknowledgement_policyId_userId_key" ON "policy_acknowledgement"("policyId", "userId");
CREATE INDEX "policy_acknowledgement_policyId_idx" ON "policy_acknowledgement"("policyId");

ALTER TABLE "announcement" ADD CONSTRAINT "announcement_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "policy" ADD CONSTRAINT "policy_organizationId_fkey" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "policy" ADD CONSTRAINT "policy_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "policy_acknowledgement" ADD CONSTRAINT "policy_acknowledgement_policyId_fkey" FOREIGN KEY ("policyId") REFERENCES "policy"("id") ON DELETE CASCADE ON UPDATE CASCADE;
