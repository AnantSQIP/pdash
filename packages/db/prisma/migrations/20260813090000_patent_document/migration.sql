-- A patent may carry an attached document (PDF/media), stored in the shared Document + blob table.
ALTER TABLE "patent" ADD COLUMN "documentId" TEXT;
ALTER TABLE "patent" ADD COLUMN "documentName" TEXT;
