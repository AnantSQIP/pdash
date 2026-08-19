-- Appraisals: what people are rated ON, a scale that holds, and the review call.
--
-- A rating was a single integer. That says somebody is "a 4" without saying at what, and it cannot
-- express the stated requirement that parameters differ by team and by position. These tables put
-- the criteria behind the number; the overall figure becomes their weighted mean rather than
-- something typed directly.

-- ── Cycles gain a type and a financial year ─────────────────────────────────
-- HALF_YEARLY and ANNUAL are the two the firm runs. Stored rather than inferred from the period
-- dates, because a six-month period is not always a half-yearly review.
ALTER TABLE "appraisal_cycle" ADD COLUMN IF NOT EXISTS "cycleType" TEXT NOT NULL DEFAULT 'HALF_YEARLY';
ALTER TABLE "appraisal_cycle" ADD COLUMN IF NOT EXISTS "fyLabel" TEXT;

-- ── The review call — step three of the flow ────────────────────────────────
-- Held as a real calendar event, so it turns up where every other commitment does instead of being
-- a date typed into an appraisal that nobody's calendar knows about.
ALTER TABLE "appraisal" ADD COLUMN IF NOT EXISTS "reviewCallAt" TIMESTAMP(3);
ALTER TABLE "appraisal" ADD COLUMN IF NOT EXISTS "reviewCallEventId" TEXT;

-- ── What people are rated on ────────────────────────────────────────────────
-- Scoping is the point: a parameter applies to somebody when it names their team space, or names
-- their designation, or names NEITHER — the last meaning everyone. A person's form is assembled
-- from every parameter that matches, so a BD executive and a Research Associate are rated on
-- different things without anyone maintaining two separate forms.
CREATE TABLE IF NOT EXISTS "appraisal_parameter" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "name"           TEXT NOT NULL,
  "description"    TEXT,
  "teamId"         TEXT,
  "designation"    TEXT,
  "weight"         DOUBLE PRECISION NOT NULL DEFAULT 1,
  "sequence"       INTEGER NOT NULL DEFAULT 0,
  "active"         BOOLEAN NOT NULL DEFAULT true,
  "createdBy"      TEXT,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  "deletedAt"      TIMESTAMP(3),
  CONSTRAINT "appraisal_parameter_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "appraisal_parameter_organizationId_active_idx" ON "appraisal_parameter"("organizationId", "active");
CREATE INDEX IF NOT EXISTS "appraisal_parameter_teamId_idx" ON "appraisal_parameter"("teamId");
ALTER TABLE "appraisal_parameter" DROP CONSTRAINT IF EXISTS "appraisal_parameter_organizationId_fkey";
ALTER TABLE "appraisal_parameter" ADD CONSTRAINT "appraisal_parameter_organizationId_fkey"
  FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- SET NULL: retiring a team space must not silently delete the criteria people were rated on.
ALTER TABLE "appraisal_parameter" DROP CONSTRAINT IF EXISTS "appraisal_parameter_teamId_fkey";
ALTER TABLE "appraisal_parameter" ADD CONSTRAINT "appraisal_parameter_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "appraisal_score" (
  "id"           TEXT NOT NULL,
  "appraisalId"  TEXT NOT NULL,
  "parameterId"  TEXT NOT NULL,
  "selfScore"    INTEGER,
  "managerScore" INTEGER,
  "comment"      TEXT,
  "createdAt"    TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"    TIMESTAMP(3) NOT NULL,
  CONSTRAINT "appraisal_score_pkey" PRIMARY KEY ("id")
);
-- One score per parameter per appraisal: scoring the same thing twice is a bug, not a second opinion.
CREATE UNIQUE INDEX IF NOT EXISTS "appraisal_score_appraisalId_parameterId_key" ON "appraisal_score"("appraisalId", "parameterId");
CREATE INDEX IF NOT EXISTS "appraisal_score_appraisalId_idx" ON "appraisal_score"("appraisalId");
ALTER TABLE "appraisal_score" DROP CONSTRAINT IF EXISTS "appraisal_score_appraisalId_fkey";
ALTER TABLE "appraisal_score" ADD CONSTRAINT "appraisal_score_appraisalId_fkey"
  FOREIGN KEY ("appraisalId") REFERENCES "appraisal"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "appraisal_score" DROP CONSTRAINT IF EXISTS "appraisal_score_parameterId_fkey";
ALTER TABLE "appraisal_score" ADD CONSTRAINT "appraisal_score_parameterId_fkey"
  FOREIGN KEY ("parameterId") REFERENCES "appraisal_parameter"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- The scale is 1-5, 5 highest. Enforced here as well as in the service: a scale that can be
-- violated is not a scale, and one stray 7 silently skews every average built on it.
ALTER TABLE "appraisal_score" DROP CONSTRAINT IF EXISTS "appraisal_score_self_1_5";
ALTER TABLE "appraisal_score" ADD CONSTRAINT "appraisal_score_self_1_5"
  CHECK ("selfScore" IS NULL OR ("selfScore" >= 1 AND "selfScore" <= 5));
ALTER TABLE "appraisal_score" DROP CONSTRAINT IF EXISTS "appraisal_score_manager_1_5";
ALTER TABLE "appraisal_score" ADD CONSTRAINT "appraisal_score_manager_1_5"
  CHECK ("managerScore" IS NULL OR ("managerScore" >= 1 AND "managerScore" <= 5));

-- The same bound on the headline figures, which are now derived from the scores above.
ALTER TABLE "appraisal" DROP CONSTRAINT IF EXISTS "appraisal_ratings_1_5";
ALTER TABLE "appraisal" ADD CONSTRAINT "appraisal_ratings_1_5"
  CHECK (
    ("selfRating"    IS NULL OR ("selfRating"    >= 1 AND "selfRating"    <= 5)) AND
    ("managerRating" IS NULL OR ("managerRating" >= 1 AND "managerRating" <= 5)) AND
    ("overallRating" IS NULL OR ("overallRating" >= 1 AND "overallRating" <= 5))
  );

-- ── A starting set of parameters ────────────────────────────────────────────
-- Firm-wide (team and designation both null), because everyone is rated on these regardless of
-- what they do. Team- and position-specific ones are added through the UI — HR knows what a BD
-- executive should be measured on and this migration does not.
INSERT INTO "appraisal_parameter" ("id","organizationId","name","description","weight","sequence","active","createdAt","updatedAt")
SELECT md5('ap'||o.id||p.n), o.id, p.n, p.d, 1, p.s, true, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "organization" o
CROSS JOIN (VALUES
  ('Quality of work',   'Accuracy, depth and defensibility of the output.',                 1),
  ('Timeliness',        'Delivering to agreed dates, and flagging slippage early.',         2),
  ('Ownership',         'Carrying work to completion without needing to be chased.',        3),
  ('Communication',     'Clarity with colleagues and clients, written and spoken.',         4),
  ('Collaboration',     'Helping the team succeed, not only one''s own workstream.',        5)
) AS p(n, d, s)
ON CONFLICT DO NOTHING;

-- The headline ratings become the WEIGHTED MEAN of the parameter scores, so they need decimals.
-- Held as integers, a mean of 4.2 was silently stored as 4 — and the financial-year figure, being
-- an average of these, lost precision a second time. Widening integer -> double precision is
-- lossless, so existing whole-number ratings are unaffected.
ALTER TABLE "appraisal" ALTER COLUMN "selfRating"    TYPE DOUBLE PRECISION;
ALTER TABLE "appraisal" ALTER COLUMN "managerRating" TYPE DOUBLE PRECISION;
ALTER TABLE "appraisal" ALTER COLUMN "overallRating" TYPE DOUBLE PRECISION;

-- The performance sheet: whatever the manager and employee actually worked from. Held through the
-- shared Document table, so it lands in the same on-disk blob storage as every other attachment
-- and inherits its size limits and streaming — nothing new to build for storage.
ALTER TABLE "appraisal" ADD COLUMN IF NOT EXISTS "sheetDocumentId"   TEXT;
ALTER TABLE "appraisal" ADD COLUMN IF NOT EXISTS "sheetDocumentName" TEXT;
