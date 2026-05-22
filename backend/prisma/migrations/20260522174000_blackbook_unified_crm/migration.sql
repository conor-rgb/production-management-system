-- CreateEnum
CREATE TYPE "pms_blackbook_lifecycle_status" AS ENUM ('TARGET', 'IN_TOUCH', 'CLIENT', 'PAST_CLIENT', 'SUPPLIER', 'PREFERRED_SUPPLIER', 'DO_NOT_USE', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "pms_blackbook_outreach_status" AS ENUM ('NOT_CONTACTED', 'CONTACTED', 'REPLIED', 'FOLLOW_UP', 'NOT_INTERESTED', 'CONVERTED', 'ARCHIVED');

-- AlterTable
ALTER TABLE "pms_blackbook_entries" ADD COLUMN     "companyEntryId" TEXT,
ADD COLUMN     "lifecycleStatus" "pms_blackbook_lifecycle_status" NOT NULL DEFAULT 'IN_TOUCH';

-- CreateTable
CREATE TABLE "pms_blackbook_target_lists" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isArchived" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_blackbook_target_lists_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_blackbook_target_list_entries" (
    "id" TEXT NOT NULL,
    "listId" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "status" "pms_blackbook_outreach_status" NOT NULL DEFAULT 'NOT_CONTACTED',
    "notes" TEXT,
    "nextFollowUpAt" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_blackbook_target_list_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_blackbook_target_list_entries_entryId_idx" ON "pms_blackbook_target_list_entries"("entryId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_blackbook_target_list_entries_listId_entryId_key" ON "pms_blackbook_target_list_entries"("listId", "entryId");

-- CreateIndex
CREATE INDEX "pms_blackbook_entries_lifecycleStatus_idx" ON "pms_blackbook_entries"("lifecycleStatus");

-- CreateIndex
CREATE INDEX "pms_blackbook_entries_companyEntryId_idx" ON "pms_blackbook_entries"("companyEntryId");

-- AddForeignKey
ALTER TABLE "pms_blackbook_target_list_entries" ADD CONSTRAINT "pms_blackbook_target_list_entries_listId_fkey" FOREIGN KEY ("listId") REFERENCES "pms_blackbook_target_lists"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_blackbook_target_list_entries" ADD CONSTRAINT "pms_blackbook_target_list_entries_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "pms_blackbook_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_blackbook_entries" ADD CONSTRAINT "pms_blackbook_entries_companyEntryId_fkey" FOREIGN KEY ("companyEntryId") REFERENCES "pms_blackbook_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

