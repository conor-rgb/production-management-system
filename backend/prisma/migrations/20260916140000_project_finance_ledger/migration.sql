-- CreateTable
CREATE TABLE "pms_project_finance_ledgers" (
    "productionId" TEXT NOT NULL,
    "currency" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_project_finance_ledgers_pkey" PRIMARY KEY ("productionId")
);

-- CreateTable
CREATE TABLE "pms_project_finance_costs" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "supplierKey" TEXT NOT NULL,
    "committedMinor" INTEGER NOT NULL,
    "remainingMinor" INTEGER,
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_project_finance_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_project_supplier_invoices" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "supplier" TEXT NOT NULL,
    "supplierKey" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "numberKey" TEXT NOT NULL,
    "invoiceDate" TIMESTAMP(3) NOT NULL,
    "dueDate" TIMESTAMP(3),
    "netMinor" INTEGER NOT NULL,
    "taxMinor" INTEGER NOT NULL,
    "documentUrl" TEXT,
    "status" TEXT NOT NULL DEFAULT 'DRAFT',
    "version" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_project_supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_project_invoice_allocations" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "costId" TEXT NOT NULL,
    "netMinor" INTEGER NOT NULL,

    CONSTRAINT "pms_project_invoice_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_project_invoice_payments" (
    "id" TEXT NOT NULL,
    "invoiceId" TEXT NOT NULL,
    "amountMinor" INTEGER NOT NULL,
    "paidAt" TIMESTAMP(3) NOT NULL,
    "reference" TEXT NOT NULL,
    "reversedAt" TIMESTAMP(3),
    "reversalReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_project_invoice_payments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_project_finance_operations" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "requestId" TEXT NOT NULL,
    "payloadHash" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "actorId" TEXT NOT NULL,
    "detail" JSONB NOT NULL,
    "result" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_project_finance_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_project_finance_costs_productionId_idx" ON "pms_project_finance_costs"("productionId");

-- CreateIndex
CREATE INDEX "pms_project_supplier_invoices_productionId_status_idx" ON "pms_project_supplier_invoices"("productionId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "pms_project_supplier_invoices_productionId_supplierKey_numb_key" ON "pms_project_supplier_invoices"("productionId", "supplierKey", "numberKey");

-- CreateIndex
CREATE UNIQUE INDEX "pms_project_invoice_allocations_invoiceId_costId_key" ON "pms_project_invoice_allocations"("invoiceId", "costId");

-- CreateIndex
CREATE INDEX "pms_project_invoice_payments_invoiceId_idx" ON "pms_project_invoice_payments"("invoiceId");

-- CreateIndex
CREATE INDEX "pms_project_finance_operations_productionId_createdAt_idx" ON "pms_project_finance_operations"("productionId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "pms_project_finance_operations_productionId_requestId_key" ON "pms_project_finance_operations"("productionId", "requestId");

-- AddForeignKey
ALTER TABLE "pms_project_finance_ledgers" ADD CONSTRAINT "pms_project_finance_ledgers_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_finance_costs" ADD CONSTRAINT "pms_project_finance_costs_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_project_finance_ledgers"("productionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_supplier_invoices" ADD CONSTRAINT "pms_project_supplier_invoices_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_project_finance_ledgers"("productionId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_invoice_allocations" ADD CONSTRAINT "pms_project_invoice_allocations_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "pms_project_supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_invoice_allocations" ADD CONSTRAINT "pms_project_invoice_allocations_costId_fkey" FOREIGN KEY ("costId") REFERENCES "pms_project_finance_costs"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_invoice_payments" ADD CONSTRAINT "pms_project_invoice_payments_invoiceId_fkey" FOREIGN KEY ("invoiceId") REFERENCES "pms_project_supplier_invoices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_finance_operations" ADD CONSTRAINT "pms_project_finance_operations_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_project_finance_ledgers"("productionId") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "pms_project_finance_costs" ADD CONSTRAINT "cost_amounts_nonnegative" CHECK ("committedMinor" >= 0 AND ("remainingMinor" IS NULL OR "remainingMinor" >= 0));
ALTER TABLE "pms_project_supplier_invoices" ADD CONSTRAINT "invoice_amounts_nonnegative" CHECK ("netMinor" > 0 AND "taxMinor" >= 0);
ALTER TABLE "pms_project_supplier_invoices" ADD CONSTRAINT "invoice_status_valid" CHECK ("status" IN ('DRAFT', 'APPROVED', 'VOID'));
ALTER TABLE "pms_project_invoice_allocations" ADD CONSTRAINT "allocation_positive" CHECK ("netMinor" > 0);
ALTER TABLE "pms_project_invoice_payments" ADD CONSTRAINT "payment_positive" CHECK ("amountMinor" > 0);
