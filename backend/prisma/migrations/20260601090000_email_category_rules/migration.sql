CREATE TYPE "pms_email_category_rule_match_type" AS ENUM ('SENDER', 'DOMAIN');

CREATE TABLE "pms_email_category_rules" (
  "id" TEXT NOT NULL,
  "accountId" TEXT NOT NULL,
  "matchType" "pms_email_category_rule_match_type" NOT NULL,
  "value" TEXT NOT NULL,
  "category" "pms_email_auto_category" NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pms_email_category_rules_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pms_email_category_rules_accountId_matchType_value_key" ON "pms_email_category_rules"("accountId", "matchType", "value");
CREATE INDEX "pms_email_category_rules_accountId_category_idx" ON "pms_email_category_rules"("accountId", "category");

ALTER TABLE "pms_email_category_rules" ADD CONSTRAINT "pms_email_category_rules_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "pms_email_accounts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
