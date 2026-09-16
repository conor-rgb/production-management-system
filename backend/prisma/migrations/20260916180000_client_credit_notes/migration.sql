BEGIN;
-- AlterTable
ALTER TABLE "pms_project_client_invoices" ADD COLUMN     "originalInvoiceId" TEXT;

-- AlterTable
ALTER TABLE "pms_project_client_receipts" ADD COLUMN     "direction" TEXT NOT NULL DEFAULT 'RECEIPT';

-- CreateIndex
CREATE INDEX "pms_project_client_invoices_originalInvoiceId_idx" ON "pms_project_client_invoices"("originalInvoiceId");

-- AddForeignKey
ALTER TABLE "pms_project_client_invoices" ADD CONSTRAINT "pms_project_client_invoices_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "pms_project_client_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "pms_project_client_invoices" DROP CONSTRAINT "client_invoice_amounts";
ALTER TABLE "pms_project_client_invoices" ADD CONSTRAINT "client_invoice_amounts" CHECK ("netMinor" >= 0 AND "taxMinor" >= 0 AND "netMinor" + "taxMinor" > 0 AND "netMinor" + "taxMinor" <= 1000000000 AND ("kind" = 'CREDIT' OR "netMinor" > 0));
ALTER TABLE "pms_project_client_invoices" ADD CONSTRAINT "credit_original_required" CHECK ("kind" <> 'CREDIT' OR ("originalInvoiceId" IS NOT NULL AND "originalInvoiceId" <> "id"));
ALTER TABLE "pms_project_client_receipts" ADD CONSTRAINT "client_cash_direction" CHECK ("direction" IN ('RECEIPT','REFUND'));
COMMIT;
