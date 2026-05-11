-- CreateEnum
CREATE TYPE "pms_sub_cost_line_type" AS ENUM ('PO', 'BILL', 'RECEIPT');

-- AlterTable
ALTER TABLE "pms_sub_costs" ADD COLUMN     "lineType" "pms_sub_cost_line_type" NOT NULL DEFAULT 'PO';

-- Existing receipt-captured rows are paid receipt cost lines, not POs.
UPDATE "pms_sub_costs"
SET "lineType" = 'RECEIPT',
    "status" = 'PAID',
    "isAgreed" = true,
    "isInvoiced" = true,
    "isPaid" = true
WHERE "receiptCaptureId" IS NOT NULL;
