-- CreateEnum
CREATE TYPE "BudgetRevisionStatus" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('PENDING', 'PAID');

-- DropForeignKey
ALTER TABLE "pms_budget_sections" DROP CONSTRAINT "pms_budget_sections_budgetId_fkey";

-- AlterTable
ALTER TABLE "pms_budgets" DROP COLUMN "name",
ADD COLUMN     "currentRevisionId" TEXT,
ADD COLUMN     "opportunityId" TEXT,
ALTER COLUMN "productionId" DROP NOT NULL;

-- AlterTable
ALTER TABLE "pms_budget_sections" DROP COLUMN "budgetId",
ADD COLUMN     "code" TEXT NOT NULL,
ADD COLUMN     "revisionId" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL;

-- AlterTable
ALTER TABLE "pms_budget_line_items" DROP COLUMN "notes",
DROP COLUMN "total",
DROP COLUMN "unitCost",
ADD COLUMN     "agencyMarkup" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "baseHours" DOUBLE PRECISION,
ADD COLUMN     "catalogItemId" TEXT,
ADD COLUMN     "clientSubtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "clientUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "daysUnits" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "hasHealthSafety" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasPW" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "internalSubtotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "internalUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "isTaxable" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lineCode" TEXT NOT NULL,
ADD COLUMN     "overtime15x" DOUBLE PRECISION,
ADD COLUMN     "overtime2x" DOUBLE PRECISION,
ADD COLUMN     "privateMemo" TEXT,
ADD COLUMN     "publicMemo" TEXT,
ADD COLUMN     "unitLabel" TEXT NOT NULL DEFAULT 'Days',
ADD COLUMN     "variance" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "quantity" SET DATA TYPE DOUBLE PRECISION,
ALTER COLUMN "actualCost" SET DATA TYPE DOUBLE PRECISION;

-- AlterTable
ALTER TABLE "pms_line_item_invoices" DROP COLUMN "invoiceDate",
ADD COLUMN     "dateReceived" DATE,
ADD COLUMN     "jobFileId" TEXT,
ADD COLUMN     "status" "InvoiceStatus" NOT NULL DEFAULT 'PENDING',
ADD COLUMN     "supplierName" TEXT NOT NULL,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "amount" SET DATA TYPE DOUBLE PRECISION;

-- CreateTable
CREATE TABLE "pms_budget_revisions" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "label" TEXT NOT NULL,
    "status" "BudgetRevisionStatus" NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "productionFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 10,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_budget_revisions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_catalog_items" (
    "id" TEXT NOT NULL,
    "section" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "defaultInternalUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defaultClientUnitCost" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "defaultUnitLabel" TEXT NOT NULL DEFAULT 'Days',
    "defaultQuantity" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "defaultDaysUnits" DOUBLE PRECISION NOT NULL DEFAULT 1,
    "defaultAgencyMarkup" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "notes" TEXT,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_catalog_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_catalog_groups" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_catalog_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_catalog_group_items" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "catalogItemId" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pms_catalog_group_items_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pms_budget_revisions_budgetId_revisionNumber_key" ON "pms_budget_revisions"("budgetId", "revisionNumber");

-- CreateIndex
CREATE INDEX "pms_catalog_items_section_isActive_idx" ON "pms_catalog_items"("section", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "pms_catalog_group_items_groupId_catalogItemId_key" ON "pms_catalog_group_items"("groupId", "catalogItemId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_budgets_currentRevisionId_key" ON "pms_budgets"("currentRevisionId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_budget_sections_revisionId_code_key" ON "pms_budget_sections"("revisionId", "code");

-- AddForeignKey
ALTER TABLE "pms_budgets" ADD CONSTRAINT "pms_budgets_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "pms_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_budgets" ADD CONSTRAINT "pms_budgets_currentRevisionId_fkey" FOREIGN KEY ("currentRevisionId") REFERENCES "pms_budget_revisions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_budget_revisions" ADD CONSTRAINT "pms_budget_revisions_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "pms_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_budget_sections" ADD CONSTRAINT "pms_budget_sections_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "pms_budget_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_budget_line_items" ADD CONSTRAINT "pms_budget_line_items_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "pms_catalog_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_line_item_invoices" ADD CONSTRAINT "pms_line_item_invoices_jobFileId_fkey" FOREIGN KEY ("jobFileId") REFERENCES "pms_job_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_catalog_group_items" ADD CONSTRAINT "pms_catalog_group_items_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "pms_catalog_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_catalog_group_items" ADD CONSTRAINT "pms_catalog_group_items_catalogItemId_fkey" FOREIGN KEY ("catalogItemId") REFERENCES "pms_catalog_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

