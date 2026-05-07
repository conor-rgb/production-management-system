-- AlterTable
ALTER TABLE "pms_job_files" ADD COLUMN     "sourceEmailAttachmentIndex" INTEGER,
ADD COLUMN     "sourceEmailFilename" TEXT,
ADD COLUMN     "sourceEmailMessageId" TEXT,
ADD COLUMN     "sourceEmailThreadId" TEXT;

-- CreateIndex
CREATE INDEX "pms_job_files_sourceEmailThreadId_idx" ON "pms_job_files"("sourceEmailThreadId");

-- CreateIndex
CREATE INDEX "pms_job_files_sourceEmailMessageId_sourceEmailAttachmentInd_idx" ON "pms_job_files"("sourceEmailMessageId", "sourceEmailAttachmentIndex");

-- AddForeignKey
ALTER TABLE "pms_job_files" ADD CONSTRAINT "pms_job_files_sourceEmailThreadId_fkey" FOREIGN KEY ("sourceEmailThreadId") REFERENCES "pms_email_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_job_files" ADD CONSTRAINT "pms_job_files_sourceEmailMessageId_fkey" FOREIGN KEY ("sourceEmailMessageId") REFERENCES "pms_email_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;
