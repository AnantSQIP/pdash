-- Phase 2 refinement — tell a deliberate write-down from a figure that has gone stale.
--
-- A ledger override supersedes the derived billable-hours total, and the ledger shows both. But
-- "stated 1,980h · derived 2,500h" is ambiguous: it could be a deliberate 520-hour write-down
-- agreed with the client, or it could be a figure that was right in June and has been quietly
-- wrong ever since, because four more months of work landed underneath it.
--
-- Recording what the derived figure WAS when the statement was made settles it. If the snapshot
-- also said 2,500h, the gap is a decision. If it said 1,980h, the gap is drift, and the ledger
-- can say so instead of presenting a stale number with a straight face.
--
-- Nullable and additive: overrides stated before this column existed simply have no snapshot, and
-- are shown without a drift claim rather than with a fabricated one.
ALTER TABLE "client_ledger_override"
  ADD COLUMN IF NOT EXISTS "derivedHoursWhenSet" DOUBLE PRECISION;
