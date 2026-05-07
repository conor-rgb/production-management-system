-- CreateEnum
CREATE TYPE "pms_receipt_capture_status" AS ENUM ('PENDING', 'PARSING', 'PARSED', 'ASSIGNED', 'FAILED');

-- CreateTable
CREATE TABLE "pms_receipt_captures" (
    "id" TEXT NOT NULL,
    "status" "pms_receipt_capture_status" NOT NULL DEFAULT 'PENDING',
    "originalFilename" TEXT NOT NULL,
    "storedFilename" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "storedPath" TEXT NOT NULL,
    "parsedVendor" TEXT,
    "parsedAmount" INTEGER,
    "parsedDate" DATE,
    "parsedCurrency" TEXT NOT NULL DEFAULT 'GBP',
    "parsedDescription" TEXT,
    "parsedAicpSection" TEXT,
    "parsedAicpSectionName" TEXT,
    "parseConfidence" TEXT,
    "parseRawText" TEXT,
    "parsedAt" TIMESTAMP(3),
    "productionId" TEXT,
    "lineItemId" TEXT,
    "jobFileId" TEXT,
    "assignedAt" TIMESTAMP(3),
    "capturedOffline" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_receipt_captures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_receipt_captures_status_idx" ON "pms_receipt_captures"("status");

-- CreateIndex
CREATE INDEX "pms_receipt_captures_productionId_idx" ON "pms_receipt_captures"("productionId");

-- CreateIndex
CREATE INDEX "pms_receipt_captures_lineItemId_idx" ON "pms_receipt_captures"("lineItemId");

-- CreateIndex
CREATE INDEX "pms_receipt_captures_jobFileId_idx" ON "pms_receipt_captures"("jobFileId");

-- AddForeignKey
ALTER TABLE "pms_receipt_captures" ADD CONSTRAINT "pms_receipt_captures_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_receipt_captures" ADD CONSTRAINT "pms_receipt_captures_lineItemId_fkey" FOREIGN KEY ("lineItemId") REFERENCES "pms_budget_line_items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_receipt_captures" ADD CONSTRAINT "pms_receipt_captures_jobFileId_fkey" FOREIGN KEY ("jobFileId") REFERENCES "pms_job_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
