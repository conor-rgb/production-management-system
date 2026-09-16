BEGIN;
-- AlterTable
ALTER TABLE "pms_project_supplier_invoices" ADD COLUMN     "kind" TEXT NOT NULL DEFAULT 'INVOICE',
ADD COLUMN     "originalInvoiceId" TEXT,
ADD COLUMN     "reviewNote" TEXT;

-- AlterTable
ALTER TABLE "pms_project_invoice_payments" ADD COLUMN     "direction" TEXT NOT NULL DEFAULT 'PAYMENT';

-- CreateIndex
CREATE INDEX "pms_project_supplier_invoices_originalInvoiceId_idx" ON "pms_project_supplier_invoices"("originalInvoiceId");

-- AddForeignKey
ALTER TABLE "pms_project_supplier_invoices" ADD CONSTRAINT "pms_project_supplier_invoices_originalInvoiceId_fkey" FOREIGN KEY ("originalInvoiceId") REFERENCES "pms_project_supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "pms_project_supplier_invoices" ADD CONSTRAINT "supplier_credit_original" CHECK ("kind" IN ('INVOICE','CREDIT') AND ("kind" <> 'CREDIT' OR ("originalInvoiceId" IS NOT NULL AND "originalInvoiceId" <> "id")));
ALTER TABLE "pms_project_invoice_payments" ADD CONSTRAINT "supplier_cash_direction" CHECK ("direction" IN ('PAYMENT','REFUND'));
ALTER TABLE "pms_project_supplier_invoices" DROP CONSTRAINT "invoice_amounts_nonnegative";
ALTER TABLE "pms_project_supplier_invoices" ADD CONSTRAINT "invoice_amounts_nonnegative" CHECK ("netMinor" >= 0 AND "taxMinor" >= 0 AND "netMinor" + "taxMinor" > 0 AND ("kind" = 'CREDIT' OR "netMinor" > 0));
COMMIT;
