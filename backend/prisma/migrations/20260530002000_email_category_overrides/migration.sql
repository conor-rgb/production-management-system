-- Persist manual email category corrections
ALTER TABLE "pms_email_threads"
  ADD COLUMN "categoryOverride" "pms_email_auto_category",
  ADD COLUMN "categoryOverrideAt" TIMESTAMP(3);

CREATE INDEX "pms_email_threads_accountId_categoryOverride_idx" ON "pms_email_threads"("accountId", "categoryOverride");
