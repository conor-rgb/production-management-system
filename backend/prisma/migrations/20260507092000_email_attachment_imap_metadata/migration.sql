-- AlterTable
ALTER TABLE "pms_email_messages" ADD COLUMN     "imapMailbox" TEXT,
ADD COLUMN     "imapUid" INTEGER;

-- CreateIndex
CREATE INDEX "pms_email_messages_imapMailbox_imapUid_idx" ON "pms_email_messages"("imapMailbox", "imapUid");
