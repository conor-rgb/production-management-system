-- Gmail API foundation: native Gmail IDs, label state, history cursor, and attachment IDs.
ALTER TABLE "pms_email_accounts"
  ADD COLUMN IF NOT EXISTS "gmailHistoryId" TEXT;

ALTER TABLE "pms_email_threads"
  ADD COLUMN IF NOT EXISTS "gmailThreadId" TEXT,
  ADD COLUMN IF NOT EXISTS "historyId" TEXT,
  ADD COLUMN IF NOT EXISTS "snippet" TEXT,
  ADD COLUMN IF NOT EXISTS "participantNames" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "lastInboxMessageAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "lastSentMessageAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "inInbox" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "inSent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isStarred" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isUnread" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isTrashed" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "pms_email_messages"
  ADD COLUMN IF NOT EXISTS "gmailMessageId" TEXT,
  ADD COLUMN IF NOT EXISTS "gmailThreadId" TEXT,
  ADD COLUMN IF NOT EXISTS "labelIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
  ADD COLUMN IF NOT EXISTS "inInbox" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "inSent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isUnread" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isStarred" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "snippet" TEXT,
  ADD COLUMN IF NOT EXISTS "gmailAttachmentIds" JSONB NOT NULL DEFAULT '[]';

CREATE UNIQUE INDEX IF NOT EXISTS "pms_email_threads_accountId_gmailThreadId_key"
  ON "pms_email_threads"("accountId", "gmailThreadId");
CREATE INDEX IF NOT EXISTS "pms_email_threads_accountId_inInbox_lastMessageAt_idx"
  ON "pms_email_threads"("accountId", "inInbox", "lastMessageAt");
CREATE INDEX IF NOT EXISTS "pms_email_threads_accountId_inSent_lastSentMessageAt_idx"
  ON "pms_email_threads"("accountId", "inSent", "lastSentMessageAt");
CREATE INDEX IF NOT EXISTS "pms_email_threads_accountId_isStarred_idx"
  ON "pms_email_threads"("accountId", "isStarred");
CREATE INDEX IF NOT EXISTS "pms_email_threads_accountId_isUnread_idx"
  ON "pms_email_threads"("accountId", "isUnread");

CREATE UNIQUE INDEX IF NOT EXISTS "pms_email_messages_gmailMessageId_key"
  ON "pms_email_messages"("gmailMessageId");
CREATE INDEX IF NOT EXISTS "pms_email_messages_gmailThreadId_idx"
  ON "pms_email_messages"("gmailThreadId");
