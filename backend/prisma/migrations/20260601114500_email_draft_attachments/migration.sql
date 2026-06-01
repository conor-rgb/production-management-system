-- DropTable
DROP TABLE "pms_sessions";

-- CreateTable
CREATE TABLE "pms_email_draft_attachments" (
    "id" TEXT NOT NULL,
    "draftId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storedPath" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_email_draft_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_email_draft_attachments_draftId_idx" ON "pms_email_draft_attachments"("draftId");

-- AddForeignKey
ALTER TABLE "pms_email_draft_attachments" ADD CONSTRAINT "pms_email_draft_attachments_draftId_fkey" FOREIGN KEY ("draftId") REFERENCES "pms_email_drafts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

