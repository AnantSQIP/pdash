-- Project lifecycle: Complete → Close → Reopen.
-- CLOSED is an intact, reopenable end-state kept separate from deletedAt (a real delete).
-- completedAt / closedAt record when each transition happened; both cleared on reopen.

ALTER TABLE "project" ADD COLUMN "completedAt" TIMESTAMP(3);
ALTER TABLE "project" ADD COLUMN "closedAt" TIMESTAMP(3);
