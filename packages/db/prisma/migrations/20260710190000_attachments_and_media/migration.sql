-- Attachments & media: file storage for discussions and project files.
-- All statements are additive and backward-compatible (the running app ignores
-- the new tables/column until the new API is deployed).

-- Document metadata: content type of the stored file.
ALTER TABLE "document" ADD COLUMN     "mimeType" TEXT;

-- File bytes live in a separate 1:1 table so document list queries stay light.
CREATE TABLE "document_blob" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "data" BYTEA NOT NULL,

    CONSTRAINT "document_blob_pkey" PRIMARY KEY ("id")
);

-- Attachment join: Discuss channel message <-> document.
CREATE TABLE "message_attachment" (
    "id" TEXT NOT NULL,
    "messageId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "message_attachment_pkey" PRIMARY KEY ("id")
);

-- Attachment join: polymorphic comment (project/task discussion) <-> document.
CREATE TABLE "comment_attachment" (
    "id" TEXT NOT NULL,
    "commentId" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,

    CONSTRAINT "comment_attachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "document_blob_documentId_key" ON "document_blob"("documentId");

-- CreateIndex
CREATE INDEX "message_attachment_documentId_idx" ON "message_attachment"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "message_attachment_messageId_documentId_key" ON "message_attachment"("messageId", "documentId");

-- CreateIndex
CREATE INDEX "comment_attachment_documentId_idx" ON "comment_attachment"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "comment_attachment_commentId_documentId_key" ON "comment_attachment"("commentId", "documentId");

-- CreateIndex
CREATE INDEX "document_uploadedBy_idx" ON "document"("uploadedBy");

-- CreateIndex
CREATE INDEX "document_deletedAt_idx" ON "document"("deletedAt");

-- AddForeignKey
ALTER TABLE "document_blob" ADD CONSTRAINT "document_blob_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_messageId_fkey" FOREIGN KEY ("messageId") REFERENCES "message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "message_attachment" ADD CONSTRAINT "message_attachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_attachment" ADD CONSTRAINT "comment_attachment_commentId_fkey" FOREIGN KEY ("commentId") REFERENCES "comment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comment_attachment" ADD CONSTRAINT "comment_attachment_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
