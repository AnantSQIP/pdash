-- Phase 2 — a renamed client code must not break the IDs already sent to the client.
--
-- Renaming a client code re-mints every patent handle under it: Pat_MLK_7 becomes Pat_MLKB_7 and
-- the old string stops existing anywhere in the system. But it does still exist in the world — in
-- the emails, reports and claim charts we sent the client under that ID. Until now, a client
-- quoting Pat_MLK_7 back at us found nothing, with no indication that the ID had ever been valid.
--
-- formerHandles keeps them. Append-only, oldest first, and the live handle is never in the list,
-- so "which patent was this?" always has an answer while "what is it called now?" has exactly one.
--
-- Additive with a default, so every existing patent comes through with an empty list and an older
-- API build that has never heard of the column keeps working against the same database.
ALTER TABLE "patent" ADD COLUMN IF NOT EXISTS "formerHandles" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];

-- Lookups go the other way round from the usual index: "find the patent whose FORMER handles
-- contain this string". That is a containment test on an array, which needs GIN.
CREATE INDEX IF NOT EXISTS "patent_formerHandles_idx" ON "patent" USING GIN ("formerHandles");
