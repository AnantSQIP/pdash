-- Presence: when the person went idle (no keyboard or mouse for five minutes). Additive and
-- nullable, so a browser still running the previous build — which never sends it — keeps working:
-- its heartbeats simply leave the column null, which reads as "active", exactly as before.
ALTER TABLE "presence" ADD COLUMN "idleSince" TIMESTAMP(3);
