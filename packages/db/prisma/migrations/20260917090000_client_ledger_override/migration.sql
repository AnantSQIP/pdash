-- Phase 2 — a Super Admin's stated figure for a client.
--
-- The client ledger derives everything it shows from live projects and timesheets, and is
-- therefore right about the WORK and silent about the COMMERCE: no rate card, agreed fee or
-- invoice exists anywhere in this system, so no honest money figure can be computed. This table
-- is where a person supplies it.
--
-- It supersedes the derived figure for display; it does not replace it in storage. The ledger
-- returns both, so an override left behind by later work reads as a disagreement rather than
-- quietly passing as the truth. `updatedBy`/`updatedAt` sit on the row itself so the ledger can
-- show who stated the number without a second lookup — the audit log records it as well.
--
-- One row per client: this is a statement about the relationship, not about a single project.
CREATE TABLE IF NOT EXISTS "client_ledger_override" (
  "id"             TEXT NOT NULL,
  "organizationId" TEXT NOT NULL,
  "clientId"       TEXT NOT NULL,
  "billableHours"  DOUBLE PRECISION,
  "amount"         DOUBLE PRECISION,
  "currency"       TEXT NOT NULL DEFAULT 'INR',
  "note"           TEXT,
  "updatedBy"      TEXT NOT NULL,
  "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"      TIMESTAMP(3) NOT NULL,
  CONSTRAINT "client_ledger_override_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "client_ledger_override_clientId_key" ON "client_ledger_override"("clientId");
CREATE INDEX IF NOT EXISTS "client_ledger_override_organizationId_idx" ON "client_ledger_override"("organizationId");

-- Cascade: an override is meaningless without its client, and Remove is already refused while
-- the client has any patent or project, so this only ever fires on a client nothing depends on.
ALTER TABLE "client_ledger_override"
  DROP CONSTRAINT IF EXISTS "client_ledger_override_clientId_fkey";
ALTER TABLE "client_ledger_override"
  ADD CONSTRAINT "client_ledger_override_clientId_fkey"
  FOREIGN KEY ("clientId") REFERENCES "client"("id") ON DELETE CASCADE ON UPDATE CASCADE;
