-- Feedback about a colleague — written by anyone, at any time, about anyone.
--
-- Distinct from an appraisal on purpose. An appraisal happens twice a year, runs between one
-- person and their manager, and produces a rating. This is the other thing: the observation
-- somebody wants to record in March about a colleague on another team, which by October nobody
-- remembers precisely enough to be fair about.
--
-- Readable by the author, HR, and the subject's reporting manager. NOT by the subject — that was
-- the instruction, and the trade-off is real: feedback somebody cannot see is feedback they
-- cannot answer. The form says so to whoever writes it.
--
-- A new table only. Nothing existing is touched.

CREATE TABLE IF NOT EXISTS "feedback" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "aboutUserId"    TEXT NOT NULL,
  "authorId"       TEXT NOT NULL,
  "kind"           TEXT NOT NULL DEFAULT 'OBSERVATION',
  "body"           TEXT NOT NULL,
  "rating"         INTEGER,
  "acknowledgedAt" TIMESTAMP(3),
  "acknowledgedBy" TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "feedback_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "feedback_organizationId_idx" ON "feedback"("organizationId");
CREATE INDEX IF NOT EXISTS "feedback_aboutUserId_idx"    ON "feedback"("aboutUserId");
CREATE INDEX IF NOT EXISTS "feedback_authorId_idx"       ON "feedback"("authorId");

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_organizationId_fkey') THEN
    ALTER TABLE "feedback" ADD CONSTRAINT "feedback_organizationId_fkey"
      FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_aboutUserId_fkey') THEN
    ALTER TABLE "feedback" ADD CONSTRAINT "feedback_aboutUserId_fkey"
      FOREIGN KEY ("aboutUserId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'feedback_authorId_fkey') THEN
    ALTER TABLE "feedback" ADD CONSTRAINT "feedback_authorId_fkey"
      FOREIGN KEY ("authorId") REFERENCES "user"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
