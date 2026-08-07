-- Make the expense receipt a real relation. The column already exists; this only adds the
-- foreign key, so any id left pointing at a document that has since gone must be cleared
-- first or the constraint cannot be created.
UPDATE "expense" e SET "receiptDocumentId" = NULL
 WHERE e."receiptDocumentId" IS NOT NULL
   AND NOT EXISTS (SELECT 1 FROM "document" d WHERE d."id" = e."receiptDocumentId");

CREATE INDEX IF NOT EXISTS "expense_receiptDocumentId_idx" ON "expense"("receiptDocumentId");

ALTER TABLE "expense" DROP CONSTRAINT IF EXISTS "expense_receiptDocumentId_fkey";
ALTER TABLE "expense" ADD CONSTRAINT "expense_receiptDocumentId_fkey"
  FOREIGN KEY ("receiptDocumentId") REFERENCES "document"("id") ON DELETE SET NULL ON UPDATE CASCADE;
