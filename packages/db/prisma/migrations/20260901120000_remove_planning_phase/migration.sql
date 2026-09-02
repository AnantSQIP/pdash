-- Remove the PLANNING project phase.
--
-- There is no planning stage in this business: a project starts when the work starts. The
-- phase survived only as a filter tab nobody used and a state nobody deliberately set — the
-- approval gate that once produced it was removed months ago, yet the column default was
-- still PLANNING, so anything creating a project without naming a phase silently landed in a
-- stage the product no longer believes in.
--
-- Existing rows become ACTIVE. That is the honest reading: a project someone created and left
-- in "planning" is a live project, and the alternative (ON_HOLD) would wrongly imply somebody
-- had paused it.
--
-- Reversible: nothing is deleted. Re-adding the phase later is a default change plus a
-- UI change, not a data recovery.

UPDATE "project" SET "projectPhase" = 'ACTIVE' WHERE "projectPhase" = 'PLANNING';

ALTER TABLE "project" ALTER COLUMN "projectPhase" SET DEFAULT 'ACTIVE';
