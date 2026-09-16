ALTER TABLE "pms_blackbook_entries"
  ADD COLUMN "supplierOnboarding" JSONB,
  ADD COLUMN "supplierOnboardingCompletedAt" TIMESTAMP(3);

ALTER TABLE "pms_purchase_order_groups"
  ADD COLUMN "onboardingExpiresAt" TIMESTAMP(3),
  ADD COLUMN "onboardingCompletedAt" TIMESTAMP(3);
