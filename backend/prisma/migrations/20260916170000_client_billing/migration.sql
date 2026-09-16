BEGIN;
-- CreateTable
CREATE TABLE "pms_project_client_invoices" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "clientName" TEXT NOT NULL,
    "billingAddress" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "paymentInstructions" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3) NOT NULL,
    "netMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "issuedAt" TIMESTAMP(3),
    "issuedBy" TEXT,
    "documentSnapshot" JSONB,
    "documentStatus" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
    "documentError" TEXT,
    "pdfJobFileId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_project_client_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_project_client_receipts" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_project_client_receipts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pms_project_client_invoices_number_key" ON "pms_project_client_invoices"("number");

-- CreateIndex
CREATE UNIQUE INDEX "pms_project_client_invoices_pdfJobFileId_key" ON "pms_project_client_invoices"("pdfJobFileId");

-- CreateIndex
CREATE INDEX "pms_project_client_invoices_productionId_status_idx" ON "pms_project_client_invoices"("productionId", "status");

-- CreateIndex
CREATE INDEX "pms_project_client_receipts_invoiceId_idx" ON "pms_project_client_receipts"("invoiceId");

-- AddForeignKey
ALTER TABLE "pms_project_client_invoices" ADD CONSTRAINT "pms_project_client_invoices_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_project_finance_ledgers"("productionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_client_invoices" ADD CONSTRAINT "pms_project_client_invoices_pdfJobFileId_fkey" FOREIGN KEY ("pdfJobFileId") REFERENCES "pms_job_files"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_client_receipts" ADD CONSTRAINT "pms_project_client_receipts_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "pms_project_client_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "pms_project_client_invoices" ADD CONSTRAINT "client_invoice_amounts" CHECK ("netMinor" > 0 AND "taxMinor" >= 0 AND "netMinor" + "taxMinor" <= 1000000000);
ALTER TABLE "pms_project_client_receipts" ADD CONSTRAINT "client_receipt_amount" CHECK ("amountMinor" > 0);
COMMIT;
