-- Phase 2 (part two) — let time be logged against team-space work.
--
-- A timesheet reaches its context through `projectId`, resolved from the task. A team-space task
-- has no project, so such an entry would carry a null projectId — which already means something
-- else entirely: "logged inside the assign-the-PID-later buffer, still to be attached".
--
-- The consequences of leaving them indistinguishable are concrete: HR and BD time would be
-- chased forever for a PID it can never have, and the client ledger's Unattributed line would
-- count internal work as unattributed *client* work, overstating the gap it exists to expose.
--
-- With teamId set, the three states are distinct and every reader can tell them apart:
--   projectId set              -> client work
--   teamId set                 -> internal team-space work
--   both null                  -> genuinely awaiting a PID
--
-- Additive and nullable: every existing row keeps exactly the meaning it had.
ALTER TABLE "timesheet" ADD COLUMN IF NOT EXISTS "teamId" TEXT;
CREATE INDEX IF NOT EXISTS "timesheet_teamId_date_idx" ON "timesheet"("teamId", "date");

-- SET NULL rather than CASCADE: deleting a team space must not destroy the hours people worked.
-- The entry survives as unattributed time, which is honest — the work happened.
ALTER TABLE "timesheet" DROP CONSTRAINT IF EXISTS "timesheet_teamId_fkey";
ALTER TABLE "timesheet"
  ADD CONSTRAINT "timesheet_teamId_fkey"
  FOREIGN KEY ("teamId") REFERENCES "team"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Drop `team.status`, which nothing ever read.
--
-- It shipped with the original (unused) team tables and now overlaps `archivedAt`, added for team
-- spaces. Two ways to express "not active" drift apart, and the one no code reads is the one that
-- ends up lying — a space archived through the UI would still have said status='ACTIVE'.
--
-- Free to do now and not later: no code path has ever written to this table outside this feature,
-- so the column holds nothing anyone can lose.
ALTER TABLE "team" DROP COLUMN IF EXISTS "status";
