ALTER TABLE "pms_budget_revisions"
  ADD COLUMN IF NOT EXISTS "majorVersion" INTEGER NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS "minorVersion" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS "sourceRevisionId" TEXT,
  ADD COLUMN IF NOT EXISTS "isLocked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "lockedAt" TIMESTAMP(3),
  ADD COLUMN IF NOT EXISTS "changeSummary" TEXT;

UPDATE "pms_budget_revisions"
SET "majorVersion" = "revisionNumber",
    "minorVersion" = 0
WHERE "majorVersion" = 1
  AND "minorVersion" = 0;

CREATE INDEX IF NOT EXISTS "pms_budget_revisions_budgetId_majorVersion_minorVersion_idx"
  ON "pms_budget_revisions"("budgetId", "majorVersion", "minorVersion");
