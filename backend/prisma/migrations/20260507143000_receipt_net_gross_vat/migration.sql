-- AlterTable
ALTER TABLE "pms_receipt_captures" ADD COLUMN     "parsedAmountGross" INTEGER,
ADD COLUMN     "parsedAmountNet" INTEGER,
ADD COLUMN     "parsedVatAmount" INTEGER,
ADD COLUMN     "parsedVatRate" DOUBLE PRECISION;
