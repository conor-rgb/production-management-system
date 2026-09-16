BEGIN;

-- AlterEnum
ALTER TYPE "pms_purchase_order_status" ADD VALUE 'ISSUED';

-- AlterTable
ALTER TABLE "pms_purchase_order_groups" ADD COLUMN "cancellationReason" TEXT,
ADD COLUMN     "currency" TEXT NOT NULL DEFAULT 'GBP',
ADD COLUMN     "documentError" TEXT,
ADD COLUMN     "documentSnapshot" JSONB,
ADD COLUMN     "documentStatus" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
ADD COLUMN     "financeManaged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "issuedAt" TIMESTAMP(3),
ADD COLUMN     "issuedBy" TEXT,
ADD COLUMN     "pdfJobFileId" TEXT,
ADD COLUMN     "supplierTerms" TEXT,
ADD COLUMN     "version" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "pms_job_files" ADD COLUMN     "sourceKey" TEXT;

-- AlterTable
ALTER TABLE "pms_project_finance_costs" ADD COLUMN     "activePurchaseOrderId" TEXT;

-- CreateTable
CREATE TABLE "pms_project_purchase_order_lines" (
    "id" TEXT NOT NULL,
    "purchaseOrderId" TEXT NOT NULL,
    "costId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "netMinor" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "pms_project_purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_project_purchase_order_lines_costId_idx" ON "pms_project_purchase_order_lines"("costId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_project_purchase_order_lines_purchaseOrderId_costId_key" ON "pms_project_purchase_order_lines"("purchaseOrderId", "costId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_purchase_order_groups_pdfJobFileId_key" ON "pms_purchase_order_groups"("pdfJobFileId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_job_files_sourceKey_key" ON "pms_job_files"("sourceKey");

-- AddForeignKey
ALTER TABLE "pms_purchase_order_groups" ADD CONSTRAINT "pms_purchase_order_groups_pdfJobFileId_fkey" FOREIGN KEY ("pdfJobFileId") REFERENCES "pms_job_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_finance_costs" ADD CONSTRAINT "pms_project_finance_costs_activePurchaseOrderId_fkey" FOREIGN KEY ("activePurchaseOrderId") REFERENCES "pms_purchase_order_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_purchase_order_lines" ADD CONSTRAINT "pms_project_purchase_order_lines_purchaseOrderId_fkey" FOREIGN KEY ("purchaseOrderId") REFERENCES "pms_purchase_order_groups"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_purchase_order_lines" ADD CONSTRAINT "pms_project_purchase_order_lines_costId_fkey" FOREIGN KEY ("costId") REFERENCES "pms_project_finance_costs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "pms_project_purchase_order_lines" ADD CONSTRAINT "finance_po_net_positive" CHECK ("netMinor" > 0);
COMMIT;
