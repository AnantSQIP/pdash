-- A Client was a code and a name. These are the facts about the relationship behind it: who to
-- call, what was agreed, and — the one that changes a number rather than filling a box — the rate,
-- which lets the ledger derive what the hours are worth instead of waiting for someone to type a
-- total that goes stale the next time work is logged.
--
-- Every column is nullable or defaulted, so existing rows are untouched and the deploy is
-- backward-compatible: older API pods keep working against the new table.
ALTER TABLE "client"
  ADD COLUMN IF NOT EXISTS "contactName"      TEXT,
  ADD COLUMN IF NOT EXISTS "contactEmail"     TEXT,
  ADD COLUMN IF NOT EXISTS "contactPhone"     TEXT,
  ADD COLUMN IF NOT EXISTS "website"          TEXT,
  ADD COLUMN IF NOT EXISTS "country"          TEXT,
  ADD COLUMN IF NOT EXISTS "address"          TEXT,
  ADD COLUMN IF NOT EXISTS "industry"         TEXT,
  ADD COLUMN IF NOT EXISTS "notes"            TEXT,
  ADD COLUMN IF NOT EXISTS "billingRate"      DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "billingCurrency"  TEXT NOT NULL DEFAULT 'INR',
  ADD COLUMN IF NOT EXISTS "engagementStart"  TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "accountManagerId" TEXT;

-- SET NULL rather than CASCADE: when the person who owned the relationship leaves, the client
-- stays and loses its account manager. Deleting the client would be an absurd consequence.
DO $$ BEGIN
  ALTER TABLE "client"
    ADD CONSTRAINT "client_accountManagerId_fkey"
    FOREIGN KEY ("accountManagerId") REFERENCES "user"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE INDEX IF NOT EXISTS "client_accountManagerId_idx" ON "client"("accountManagerId");
