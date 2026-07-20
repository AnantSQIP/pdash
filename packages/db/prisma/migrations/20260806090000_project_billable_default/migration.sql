-- Projects are billable by default; billability is no longer an admin decision.
UPDATE "project" SET "billable" = true WHERE "billable" IS NULL;
ALTER TABLE "project" ALTER COLUMN "billable" SET DEFAULT true;
ALTER TABLE "project" ALTER COLUMN "billable" SET NOT NULL;
