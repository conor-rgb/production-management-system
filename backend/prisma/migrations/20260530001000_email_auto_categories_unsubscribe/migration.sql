-- Email automatic categories and unsubscribe metadata
CREATE TYPE "pms_email_auto_category" AS ENUM ('PEOPLE', 'PROMOTIONS', 'NEWSLETTERS', 'PURCHASES', 'UPDATES', 'SOCIAL', 'FORUMS', 'OTHER');
CREATE TYPE "pms_email_unsubscribe_method" AS ENUM ('ONE_CLICK', 'MAILTO', 'URL');

ALTER TABLE "pms_email_threads"
  ADD COLUMN "autoCategory" "pms_email_auto_category" NOT NULL DEFAULT 'PEOPLE',
  ADD COLUMN "gmailCategory" TEXT,
  ADD COLUMN "unsubscribeUrl" TEXT,
  ADD COLUMN "unsubscribeEmail" TEXT,
  ADD COLUMN "unsubscribeMethod" "pms_email_unsubscribe_method",
  ADD COLUMN "unsubscribedAt" TIMESTAMP(3);

CREATE INDEX "pms_email_threads_accountId_autoCategory_idx" ON "pms_email_threads"("accountId", "autoCategory");
