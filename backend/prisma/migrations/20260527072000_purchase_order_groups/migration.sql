-- CreateEnum
CREATE TYPE "pms_purchase_order_status" AS ENUM ('DRAFT', 'SENT', 'ACCEPTED', 'PART_BILLED', 'BILLED', 'PAID', 'CANCELLED');

-- CreateTable
CREATE TABLE "pms_purchase_order_groups" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "budgetId" TEXT,
    "poNumber" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "supplierEmail" TEXT,
    "supplierPhone" TEXT,
    "blackbookEntryId" TEXT,
    "optionCandidateId" TEXT,
    "status" "pms_purchase_order_status" NOT NULL DEFAULT 'DRAFT',
    "notes" TEXT,
    "onboardingToken" TEXT,
    "onboardingSentAt" TIMESTAMP(3),
    "sentAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_purchase_order_groups_pkey" PRIMARY KEY ("id")
);

-- AlterTable
ALTER TABLE "pms_sub_costs" ADD COLUMN "purchaseOrderGroupId" TEXT;

-- CreateIndex
CREATE UNIQUE INDEX "pms_purchase_order_groups_onboardingToken_key" ON "pms_purchase_order_groups"("onboardingToken");
CREATE UNIQUE INDEX "pms_purchase_order_groups_productionId_poNumber_key" ON "pms_purchase_order_groups"("productionId", "poNumber");
CREATE INDEX "pms_purchase_order_groups_productionId_status_idx" ON "pms_purchase_order_groups"("productionId", "status");
CREATE INDEX "pms_purchase_order_groups_blackbookEntryId_idx" ON "pms_purchase_order_groups"("blackbookEntryId");
CREATE INDEX "pms_purchase_order_groups_optionCandidateId_idx" ON "pms_purchase_order_groups"("optionCandidateId");
CREATE INDEX "pms_sub_costs_purchaseOrderGroupId_idx" ON "pms_sub_costs"("purchaseOrderGroupId");

-- AddForeignKey
ALTER TABLE "pms_purchase_order_groups" ADD CONSTRAINT "pms_purchase_order_groups_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pms_purchase_order_groups" ADD CONSTRAINT "pms_purchase_order_groups_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "pms_budgets"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pms_purchase_order_groups" ADD CONSTRAINT "pms_purchase_order_groups_blackbookEntryId_fkey" FOREIGN KEY ("blackbookEntryId") REFERENCES "pms_blackbook_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pms_purchase_order_groups" ADD CONSTRAINT "pms_purchase_order_groups_optionCandidateId_fkey" FOREIGN KEY ("optionCandidateId") REFERENCES "pms_option_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pms_sub_costs" ADD CONSTRAINT "pms_sub_costs_purchaseOrderGroupId_fkey" FOREIGN KEY ("purchaseOrderGroupId") REFERENCES "pms_purchase_order_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
