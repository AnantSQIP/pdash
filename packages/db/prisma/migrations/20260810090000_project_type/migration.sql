-- Add the project-type field: the kind of patent-analysis matter (HML, Claim Chart, FTO,
-- Novelty, Invalidity, Reverse Engineering, Risk & Strategy). Drives the workflow task
-- template auto-created on project creation. Null = a general project (existing rows).
ALTER TABLE "project" ADD COLUMN "projectType" TEXT;
