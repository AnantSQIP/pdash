-- Deals: what happens next, and what kind of matter this would become.
--
-- nextActionAt / nextActionNote — a pipeline's real failure mode is forgetting a deal, not losing
-- it. Stage and value say where a deal IS; nothing said what happens NEXT, so a prospect could sit
-- untouched for months while the board looked healthy.
--
-- expectedProjectType — captured while the deal is open, because once it is closed nobody can say
-- what it would have been. It is what lets win/loss be read by type of work.
--
-- Additive and nullable throughout: every existing deal stays valid with all three unset.
ALTER TABLE "deal" ADD COLUMN IF NOT EXISTS "nextActionAt" TIMESTAMP(3);
ALTER TABLE "deal" ADD COLUMN IF NOT EXISTS "nextActionNote" TEXT;
ALTER TABLE "deal" ADD COLUMN IF NOT EXISTS "expectedProjectType" TEXT;

-- The board sorts and filters on what is due, so the lookup is worth an index. Partial: a deal
-- with no next action is never what this query is looking for.
CREATE INDEX IF NOT EXISTS "deal_nextActionAt_idx" ON "deal"("nextActionAt") WHERE "nextActionAt" IS NOT NULL;
