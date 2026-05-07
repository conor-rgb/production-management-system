-- CreateIndex
CREATE INDEX "pms_email_messages_threadId_sentAt_idx" ON "pms_email_messages"("threadId", "sentAt");
