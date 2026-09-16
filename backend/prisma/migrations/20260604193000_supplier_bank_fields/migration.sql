ALTER TABLE "pms_blackbook_entries"
  ADD COLUMN "supplierBillingEmail" TEXT,
  ADD COLUMN "supplierBankAccountName" TEXT,
  ADD COLUMN "supplierBankAccountNumber" TEXT,
  ADD COLUMN "supplierBankSortCode" TEXT,
  ADD COLUMN "supplierBankIban" TEXT,
  ADD COLUMN "supplierBankSwift" TEXT,
  ADD COLUMN "supplierVatNumber" TEXT;
