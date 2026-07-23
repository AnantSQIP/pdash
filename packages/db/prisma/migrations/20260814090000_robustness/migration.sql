-- Robustness fixes.

-- #2: make the client-code / patent-handle / patent-serial uniqueness apply only to
-- NON-deleted rows, so a soft-deleted client code (or patent) can be recreated without a
-- "duplicate key" error. (A deleted MLK no longer reserves the code MLK forever.)
DROP INDEX "client_organizationId_code_key";
CREATE UNIQUE INDEX "client_organizationId_code_key" ON "client"("organizationId", "code") WHERE "deletedAt" IS NULL;

DROP INDEX "patent_organizationId_handle_key";
CREATE UNIQUE INDEX "patent_organizationId_handle_key" ON "patent"("organizationId", "handle") WHERE "deletedAt" IS NULL;

DROP INDEX "patent_clientId_serial_key";
CREATE UNIQUE INDEX "patent_clientId_serial_key" ON "patent"("clientId", "serial") WHERE "deletedAt" IS NULL;

-- #1: documents may store their bytes on disk instead of inside the DB. Existing blob-backed
-- documents keep working (served from the blob); new uploads write to disk and set this key.
ALTER TABLE "document" ADD COLUMN "storagePath" TEXT;
