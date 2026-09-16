BEGIN;

-- AlterTable
ALTER TABLE "pms_productions" ADD COLUMN     "creationHash" TEXT,
ADD COLUMN     "creationRequestId" TEXT,
ADD COLUMN     "driveSetupError" TEXT,
ADD COLUMN     "driveSetupStatus" TEXT NOT NULL DEFAULT 'NOT_REQUESTED',
ADD COLUMN     "starterTemplate" TEXT,
ADD COLUMN     "workspaceVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "pms_budget_revisions" ADD COLUMN     "editVersion" INTEGER NOT NULL DEFAULT 1;

-- AlterTable
ALTER TABLE "pms_budget_line_items" ADD COLUMN     "plannedSupplier" TEXT,
ADD COLUMN     "plannedUnitCost" DOUBLE PRECISION,
ADD COLUMN     "stableCostKey" TEXT;
UPDATE "pms_budget_line_items" SET "stableCostKey" = "id";
ALTER TABLE "pms_budget_line_items" ALTER COLUMN "stableCostKey" SET NOT NULL;
ALTER TABLE "pms_budget_line_items" ALTER COLUMN "stableCostKey" SET DEFAULT gen_random_uuid()::text;

-- AlterTable
ALTER TABLE "pms_project_finance_costs" ADD COLUMN     "estimateLineKey" TEXT,
ADD COLUMN     "commitmentStatus" TEXT NOT NULL DEFAULT 'COMMITTED';

-- AlterTable
ALTER TABLE "pms_project_supplier_invoices" ADD COLUMN     "driveFileId" TEXT;

-- CreateTable
CREATE TABLE "pms_project_drive_folders" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "category" TEXT NOT NULL,
    "driveFolderId" TEXT NOT NULL,

    CONSTRAINT "pms_project_drive_folders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_project_estimate_approvals" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "revisionId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "clientTotalMinor" INTEGER NOT NULL,
    "plannedCostMinor" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "approvedBy" TEXT NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_project_estimate_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pms_project_drive_folders_productionId_category_key" ON "pms_project_drive_folders"("productionId", "category");

-- CreateIndex
CREATE UNIQUE INDEX "pms_project_estimate_approvals_revisionId_key" ON "pms_project_estimate_approvals"("revisionId");

-- CreateIndex
CREATE INDEX "pms_project_estimate_approvals_productionId_approvedAt_idx" ON "pms_project_estimate_approvals"("productionId", "approvedAt");

-- CreateIndex
CREATE UNIQUE INDEX "pms_productions_creationRequestId_key" ON "pms_productions"("creationRequestId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_project_finance_costs_productionId_estimateLineKey_key" ON "pms_project_finance_costs"("productionId", "estimateLineKey");

-- CreateIndex
CREATE UNIQUE INDEX "pms_project_supplier_invoices_productionId_driveFileId_key" ON "pms_project_supplier_invoices"("productionId", "driveFileId");

-- AddForeignKey
ALTER TABLE "pms_project_drive_folders" ADD CONSTRAINT "pms_project_drive_folders_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_estimate_approvals" ADD CONSTRAINT "pms_project_estimate_approvals_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


ALTER TABLE "pms_project_finance_costs" ADD CONSTRAINT "commitment_status_valid" CHECK ("commitmentStatus" IN ('PLANNED', 'COMMITTED'));

COMMIT;
