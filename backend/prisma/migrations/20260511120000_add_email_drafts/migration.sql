-- CreateTable
CREATE TABLE "pms_email_drafts" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "to" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "cc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "bcc" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "subject" TEXT NOT NULL DEFAULT '',
    "bodyHtml" TEXT NOT NULL DEFAULT '',
    "replyToThreadId" TEXT,
    "gmailThreadId" TEXT,
    "inReplyToMsgId" TEXT,
    "references" TEXT,
    "linkedOpportunityId" TEXT,
    "linkedProductionId" TEXT,
    "linkedContactId" TEXT,
    "isMinimized" BOOLEAN NOT NULL DEFAULT false,
    "lastEditedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_email_drafts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_email_drafts_accountId_lastEditedAt_idx" ON "pms_email_drafts"("accountId", "lastEditedAt");

-- CreateIndex
CREATE INDEX "pms_email_drafts_replyToThreadId_idx" ON "pms_email_drafts"("replyToThreadId");

-- CreateIndex
CREATE INDEX "pms_email_drafts_linkedOpportunityId_idx" ON "pms_email_drafts"("linkedOpportunityId");

-- CreateIndex
CREATE INDEX "pms_email_drafts_linkedProductionId_idx" ON "pms_email_drafts"("linkedProductionId");

-- CreateIndex
CREATE INDEX "pms_email_drafts_linkedContactId_idx" ON "pms_email_drafts"("linkedContactId");

-- AddForeignKey
ALTER TABLE "pms_email_drafts" ADD CONSTRAINT "pms_email_drafts_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "pms_email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_email_drafts" ADD CONSTRAINT "pms_email_drafts_linkedOpportunityId_fkey" FOREIGN KEY ("linkedOpportunityId") REFERENCES "pms_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_email_drafts" ADD CONSTRAINT "pms_email_drafts_linkedProductionId_fkey" FOREIGN KEY ("linkedProductionId") REFERENCES "pms_productions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_email_drafts" ADD CONSTRAINT "pms_email_drafts_linkedContactId_fkey" FOREIGN KEY ("linkedContactId") REFERENCES "pms_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
