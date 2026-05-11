-- CreateEnum
CREATE TYPE "pms_budget_status" AS ENUM ('DRAFT', 'SENT', 'CONFIRMED', 'IN_PRODUCTION', 'WRAPPED');

-- CreateEnum
CREATE TYPE "pms_revision_status" AS ENUM ('DRAFT', 'SENT', 'APPROVED', 'REJECTED', 'SUPERSEDED');

-- CreateEnum
CREATE TYPE "pms_sub_cost_status" AS ENUM ('PENDING', 'AGREED', 'INVOICED', 'PAID');

-- CreateEnum
CREATE TYPE "pms_advance_calc_type" AS ENUM ('PERCENT_OF_TOTAL', 'PERCENT_OF_PRODUCTION', 'FIXED_AMOUNT');

-- DropForeignKey
ALTER TABLE "pms_budget_line_items" DROP CONSTRAINT "pms_budget_line_items_catalogItemId_fkey";

-- DropForeignKey
ALTER TABLE "pms_budgets" DROP CONSTRAINT "pms_budgets_opportunityId_fkey";

-- DropForeignKey
ALTER TABLE "pms_budgets" DROP CONSTRAINT "pms_budgets_productionId_fkey";

-- DropForeignKey
ALTER TABLE "pms_catalog_group_items" DROP CONSTRAINT "pms_catalog_group_items_catalogItemId_fkey";

-- DropForeignKey
ALTER TABLE "pms_catalog_group_items" DROP CONSTRAINT "pms_catalog_group_items_groupId_fkey";

-- DropForeignKey
ALTER TABLE "pms_line_item_invoices" DROP CONSTRAINT "pms_line_item_invoices_jobFileId_fkey";

-- DropForeignKey
ALTER TABLE "pms_line_item_invoices" DROP CONSTRAINT "pms_line_item_invoices_lineItemId_fkey";

-- DropForeignKey
ALTER TABLE "pms_purchase_orders" DROP CONSTRAINT "pms_purchase_orders_invoiceFileId_fkey";

-- DropForeignKey
ALTER TABLE "pms_purchase_orders" DROP CONSTRAINT "pms_purchase_orders_lineItemId_fkey";

-- DropForeignKey
ALTER TABLE "pms_purchase_orders" DROP CONSTRAINT "pms_purchase_orders_productionId_fkey";

-- AlterTable
ALTER TABLE "pms_budget_line_items" DROP COLUMN "actualCost",
DROP COLUMN "agencyMarkup",
DROP COLUMN "baseHours",
DROP COLUMN "catalogItemId",
DROP COLUMN "clientSubtotal",
DROP COLUMN "clientUnitCost",
DROP COLUMN "daysUnits",
DROP COLUMN "hasHealthSafety",
DROP COLUMN "hasPW",
DROP COLUMN "internalSubtotal",
DROP COLUMN "internalUnitCost",
DROP COLUMN "isTaxable",
DROP COLUMN "marginAmount",
DROP COLUMN "marginPercent",
DROP COLUMN "overtime15x",
DROP COLUMN "overtime2x",
DROP COLUMN "privateMemo",
DROP COLUMN "publicMemo",
DROP COLUMN "quantity",
DROP COLUMN "unitLabel",
ADD COLUMN     "actualTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "agencyFeePercent" DOUBLE PRECISION,
ADD COLUMN     "clientNotes" TEXT,
ADD COLUMN     "estimatedTotal" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "internalNotes" TEXT,
ADD COLUMN     "isAgreed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSubItem" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "multiplier" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "otHours" DOUBLE PRECISION,
ADD COLUMN     "otRate" DOUBLE PRECISION,
ADD COLUMN     "parentId" TEXT,
ADD COLUMN     "prepTravelDays" DOUBLE PRECISION,
ADD COLUMN     "qty" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "rate" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "reconNotes" TEXT,
ADD COLUMN     "shootDays" DOUBLE PRECISION,
ADD COLUMN     "unit" TEXT NOT NULL DEFAULT 'Days';

-- AlterTable
ALTER TABLE "pms_budget_revisions" DROP COLUMN "version",
ADD COLUMN     "insurancePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ALTER COLUMN "label" SET DEFAULT 'Original',
DROP COLUMN "status",
ADD COLUMN     "status" "pms_revision_status" NOT NULL DEFAULT 'DRAFT';

-- AlterTable
ALTER TABLE "pms_budget_sections" ADD COLUMN     "isVisible" BOOLEAN NOT NULL DEFAULT true;

-- AlterTable
ALTER TABLE "pms_budgets" ADD COLUMN     "accountingContact" TEXT,
ADD COLUMN     "caveats" TEXT,
ADD COLUMN     "comments" TEXT,
ADD COLUMN     "currencyBase" TEXT NOT NULL DEFAULT 'GBP',
ADD COLUMN     "currencyRate" DOUBLE PRECISION,
ADD COLUMN     "currencySecondary" TEXT,
ADD COLUMN     "insurancePercent" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "jobLocation" TEXT,
ADD COLUMN     "jobName" TEXT,
ADD COLUMN     "photographerDirector" TEXT,
ADD COLUMN     "prepTravelDate" TEXT,
ADD COLUMN     "productionFeePercent" DOUBLE PRECISION NOT NULL DEFAULT 10,
ADD COLUMN     "shootDates" TEXT,
ADD COLUMN     "shotCount" TEXT,
ADD COLUMN     "status" "pms_budget_status" NOT NULL DEFAULT 'DRAFT',
ADD COLUMN     "usages" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "pms_productions" ADD COLUMN     "actualSpend" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "variance" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "pms_catalog_group_items";

-- DropTable
DROP TABLE "pms_catalog_groups";

-- DropTable
DROP TABLE "pms_catalog_items";

-- DropTable
DROP TABLE "pms_line_item_invoices";

-- DropTable
DROP TABLE "pms_purchase_orders";

-- DropEnum
DROP TYPE "BudgetRevisionStatus";

-- DropEnum
DROP TYPE "InvoiceStatus";

-- DropEnum
DROP TYPE "PurchaseOrderStatus";

-- CreateTable
CREATE TABLE "pms_sub_costs" (
    "id" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplierName" TEXT,
    "amount" DOUBLE PRECISION NOT NULL,
    "amountGross" DOUBLE PRECISION,
    "vatAmount" DOUBLE PRECISION,
    "vatRate" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "status" "pms_sub_cost_status" NOT NULL DEFAULT 'PENDING',
    "invoiceNumber" TEXT,
    "invoiceDate" TIMESTAMP(3),
    "datePaid" TIMESTAMP(3),
    "invoiceFileId" TEXT,
    "proofOfPayment" TEXT,
    "isAgreed" BOOLEAN NOT NULL DEFAULT false,
    "isInvoiced" BOOLEAN NOT NULL DEFAULT false,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "receiptCaptureId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_sub_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_advance_invoices" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "percent" DOUBLE PRECISION,
    "amount" DOUBLE PRECISION,
    "calculationType" "pms_advance_calc_type" NOT NULL DEFAULT 'PERCENT_OF_TOTAL',
    "calculatedAmount" DOUBLE PRECISION,
    "isPaid" BOOLEAN NOT NULL DEFAULT false,
    "datePaid" TIMESTAMP(3),
    "freeAgentInvoiceId" TEXT,
    "dueDate" TIMESTAMP(3),
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_advance_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_section_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "sections" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_section_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_sub_costs_lineItemId_idx" ON "pms_sub_costs"("lineItemId");

-- CreateIndex
CREATE INDEX "pms_sub_costs_invoiceFileId_idx" ON "pms_sub_costs"("invoiceFileId");

-- CreateIndex
CREATE INDEX "pms_sub_costs_proofOfPayment_idx" ON "pms_sub_costs"("proofOfPayment");

-- CreateIndex
CREATE INDEX "pms_advance_invoices_budgetId_idx" ON "pms_advance_invoices"("budgetId");

-- CreateIndex
CREATE INDEX "pms_budget_line_items_sectionId_idx" ON "pms_budget_line_items"("sectionId");

-- CreateIndex
CREATE INDEX "pms_budget_line_items_parentId_idx" ON "pms_budget_line_items"("parentId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_budgets_productionId_key" ON "pms_budgets"("productionId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_budgets_opportunityId_key" ON "pms_budgets"("opportunityId");

-- AddForeignKey
ALTER TABLE "pms_budgets" ADD CONSTRAINT "pms_budgets_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_budgets" ADD CONSTRAINT "pms_budgets_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "pms_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_budget_line_items" ADD CONSTRAINT "pms_budget_line_items_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "pms_budget_line_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_sub_costs" ADD CONSTRAINT "pms_sub_costs_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "pms_budget_line_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_sub_costs" ADD CONSTRAINT "pms_sub_costs_invoiceFileId_fkey" FOREIGN KEY ("invoiceFileId") REFERENCES "pms_job_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_sub_costs" ADD CONSTRAINT "pms_sub_costs_proofOfPayment_fkey" FOREIGN KEY ("proofOfPayment") REFERENCES "pms_job_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_advance_invoices" ADD CONSTRAINT "pms_advance_invoices_budgetId_fkey" FOREIGN KEY ("budgetId") REFERENCES "pms_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
