-- Technology domain: the FIELD a project is about (Medical, Automobile, Source Code …), as
-- opposed to its TYPE, which is the kind of study it is (FTO, Invalidity …). A patent team
-- searches along both axes, so they are separate columns rather than one overloaded one.
ALTER TABLE "project" ADD COLUMN IF NOT EXISTS "technologyDomain" TEXT;

-- Filtering and grouping by domain is the whole point of storing it.
CREATE INDEX IF NOT EXISTS "project_technologyDomain_idx" ON "project"("technologyDomain");

-- Domains an organisation added itself. Built-ins live in code; these extend the list per org,
-- exactly as project_template extends the built-in project types.
CREATE TABLE IF NOT EXISTS "technology_domain" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "value"          TEXT NOT NULL,
  "label"          TEXT NOT NULL,
  "isActive"       BOOLEAN NOT NULL DEFAULT true,
  "createdBy"      TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "technology_domain_pkey" PRIMARY KEY ("id")
);

-- One slug per organisation: "Cloud / Server" and "cloud server" slug identically, so this is
-- what stops the same domain being saved twice under two spellings.
CREATE UNIQUE INDEX IF NOT EXISTS "technology_domain_organizationId_value_key"
  ON "technology_domain"("organizationId", "value");
CREATE INDEX IF NOT EXISTS "technology_domain_organizationId_isActive_idx"
  ON "technology_domain"("organizationId", "isActive");
