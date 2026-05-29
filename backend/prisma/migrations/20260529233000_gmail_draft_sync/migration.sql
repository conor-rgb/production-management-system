-- Gmail drafts now stay in pms_email_drafts and are hidden from normal message/activity views.
ALTER TABLE "pms_email_drafts"
ADD COLUMN "gmailDraftId" TEXT,
ADD COLUMN "gmailDraftMessageId" TEXT,
ADD COLUMN "lastSyncedToGmailAt" TIMESTAMP(3);

ALTER TABLE "pms_email_messages"
ADD COLUMN "isDraftArtifact" BOOLEAN NOT NULL DEFAULT false;

CREATE UNIQUE INDEX "pms_email_drafts_accountId_gmailDraftId_key"
ON "pms_email_drafts"("accountId", "gmailDraftId");

CREATE INDEX "pms_email_drafts_gmailDraftMessageId_idx"
ON "pms_email_drafts"("gmailDraftMessageId");

CREATE INDEX "pms_email_messages_isDraftArtifact_idx"
ON "pms_email_messages"("isDraftArtifact");

UPDATE "pms_email_messages" AS message
SET "isDraftArtifact" = true
FROM "pms_email_threads" AS thread
JOIN "pms_email_accounts" AS account ON account.id = thread."accountId"
WHERE message."threadId" = thread.id
  AND account.provider = 'GOOGLE'
  AND (
    'DRAFT' = ANY(message."labelIds")
    OR (
      message."isFromMe" = true
      AND message."inSent" = false
      AND message."inInbox" = false
      AND NOT ('SENT' = ANY(message."labelIds"))
    )
  );
