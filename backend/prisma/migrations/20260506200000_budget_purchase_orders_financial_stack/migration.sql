-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('OPEN', 'INVOICED', 'PAID');

-- AlterTable
ALTER TABLE "pms_productions" ADD COLUMN     "lastPoSequence" INTEGER NOT NULL DEFAULT 0;

-- AlterTable
ALTER TABLE "pms_budget_line_items" ADD COLUMN     "isClosed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "marginAmount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "marginPercent" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "pms_purchase_orders" (
    "id" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "poNumber" TEXT NOT NULL,
    "supplierName" TEXT NOT NULL,
    "description" TEXT,
    "agreedAmount" DOUBLE PRECISION NOT NULL,
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'OPEN',
    "dateRaised" DATE NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "invoiceNumber" TEXT,
    "invoiceDate" DATE,
    "invoiceFileId" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_purchase_orders_lineItemId_idx" ON "pms_purchase_orders"("lineItemId");

-- CreateIndex
CREATE INDEX "pms_purchase_orders_productionId_idx" ON "pms_purchase_orders"("productionId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_purchase_orders_productionId_poNumber_key" ON "pms_purchase_orders"("productionId", "poNumber");

-- AddForeignKey
ALTER TABLE "pms_purchase_orders" ADD CONSTRAINT "pms_purchase_orders_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "pms_budget_line_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_purchase_orders" ADD CONSTRAINT "pms_purchase_orders_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_purchase_orders" ADD CONSTRAINT "pms_purchase_orders_invoiceFileId_fkey" FOREIGN KEY ("invoiceFileId") REFERENCES "pms_job_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;

