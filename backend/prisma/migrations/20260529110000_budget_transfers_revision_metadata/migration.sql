-- AlterTable
ALTER TABLE "pms_budget_revisions" ADD COLUMN     "assumptions" TEXT,
ADD COLUMN     "estimateDescription" TEXT,
ADD COLUMN     "includedNotes" TEXT,
ADD COLUMN     "notIncludedNotes" TEXT,
ADD COLUMN     "paymentTerms" TEXT,
ADD COLUMN     "representative" TEXT,
ADD COLUMN     "validUntil" TIMESTAMP(3);

-- CreateTable
CREATE TABLE "pms_budget_line_transfers" (
    "id" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "fromLineItemId" TEXT NOT NULL,
    "toLineItemId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_budget_line_transfers_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_budget_line_transfers_revisionId_idx" ON "pms_budget_line_transfers"("revisionId");

-- CreateIndex
CREATE INDEX "pms_budget_line_transfers_fromLineItemId_idx" ON "pms_budget_line_transfers"("fromLineItemId");

-- CreateIndex
CREATE INDEX "pms_budget_line_transfers_toLineItemId_idx" ON "pms_budget_line_transfers"("toLineItemId");

-- AddForeignKey
ALTER TABLE "pms_budget_line_transfers" ADD CONSTRAINT "pms_budget_line_transfers_revisionId_fkey" FOREIGN KEY ("revisionId") REFERENCES "pms_budget_revisions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_budget_line_transfers" ADD CONSTRAINT "pms_budget_line_transfers_fromLineItemId_fkey" FOREIGN KEY ("fromLineItemId") REFERENCES "pms_budget_line_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_budget_line_transfers" ADD CONSTRAINT "pms_budget_line_transfers_toLineItemId_fkey" FOREIGN KEY ("toLineItemId") REFERENCES "pms_budget_line_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
