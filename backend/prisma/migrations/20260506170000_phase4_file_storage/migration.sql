-- DropForeignKey
ALTER TABLE "pms_job_files" DROP CONSTRAINT "pms_job_files_productionId_fkey";

-- AlterTable
ALTER TABLE "pms_productions" ADD COLUMN     "storagePath" TEXT;

-- AlterTable
ALTER TABLE "pms_job_files" DROP COLUMN "createdAt",
DROP COLUMN "name",
DROP COLUMN "size",
DROP COLUMN "url",
ADD COLUMN     "folder" TEXT NOT NULL,
ADD COLUMN     "isReceipt" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "linkedBudgetLineId" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "originalFilename" TEXT NOT NULL,
ADD COLUMN     "receiptAmount" INTEGER,
ADD COLUMN     "receiptDate" DATE,
ADD COLUMN     "receiptVendor" TEXT,
ADD COLUMN     "sizeBytes" INTEGER NOT NULL,
ADD COLUMN     "storedFilename" TEXT NOT NULL,
ADD COLUMN     "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ALTER COLUMN "productionId" SET NOT NULL,
ALTER COLUMN "mimeType" SET NOT NULL;

-- CreateIndex
CREATE INDEX "pms_job_files_productionId_folder_idx" ON "pms_job_files"("productionId", "folder");

-- CreateIndex
CREATE INDEX "pms_job_files_originalFilename_idx" ON "pms_job_files"("originalFilename");

-- AddForeignKey
ALTER TABLE "pms_job_files" ADD CONSTRAINT "pms_job_files_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_job_files" ADD CONSTRAINT "pms_job_files_linkedBudgetLineId_fkey" FOREIGN KEY ("linkedBudgetLineId") REFERENCES "pms_budget_line_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

