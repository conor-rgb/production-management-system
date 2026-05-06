-- CreateEnum
CREATE TYPE "FreeAgentInvoiceStatus" AS ENUM ('NOT_RAISED', 'DRAFT', 'SENT', 'VIEWED', 'PAID', 'OVERDUE');

-- CreateEnum
CREATE TYPE "ProductionDateType" AS ENUM ('PPM', 'RECCE', 'FITTING', 'MEETING', 'SHOOT_DAY', 'POST_DELIVERY', 'OTHER');

-- CreateEnum
CREATE TYPE "CrewStatus" AS ENUM ('REQUESTED', 'FIRST_OPTION', 'SECOND_OPTION', 'CONFIRMED', 'RELEASED');

-- CreateEnum
CREATE TYPE "ActivityEntityType" AS ENUM ('PRODUCTION', 'OPPORTUNITY');

-- AlterTable
ALTER TABLE "pms_settings" ADD COLUMN     "jobCodeSequence" INTEGER NOT NULL DEFAULT 46,
ADD COLUMN     "jobCodeYear" INTEGER NOT NULL DEFAULT 2026;

-- AlterTable
ALTER TABLE "pms_productions" ADD COLUMN     "freeAgentInvoiceStatus" "FreeAgentInvoiceStatus" NOT NULL DEFAULT 'NOT_RAISED',
ADD COLUMN     "notes" TEXT,
ALTER COLUMN "status" SET DEFAULT 'PRE_PRO';

-- AlterTable
ALTER TABLE "pms_production_dates" ADD COLUMN     "dateType" "ProductionDateType" NOT NULL DEFAULT 'OTHER',
ADD COLUMN     "location" TEXT,
ADD COLUMN     "notes" TEXT,
ADD COLUMN     "time" TEXT,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "zoomLink" TEXT;

-- AlterTable
ALTER TABLE "pms_crew_roles" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "pms_crew_members" ADD COLUMN     "notes" TEXT,
ADD COLUMN     "numberOfDays" DECIMAL(6,2) NOT NULL DEFAULT 1,
ADD COLUMN     "status" "CrewStatus" NOT NULL DEFAULT 'REQUESTED';

-- AlterTable
ALTER TABLE "pms_budget_line_items" ADD COLUMN     "actualCost" DECIMAL(12,2) NOT NULL DEFAULT 0;

-- CreateTable
CREATE TABLE "pms_production_date_people" (
    "id" TEXT NOT NULL,
    "productionDateId" TEXT NOT NULL,
    "contactId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_production_date_people_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_activity_notes" (
    "id" TEXT NOT NULL,
    "entityType" "ActivityEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_activity_notes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_activity_tasks" (
    "id" TEXT NOT NULL,
    "entityType" "ActivityEntityType" NOT NULL,
    "entityId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "completed" BOOLEAN NOT NULL DEFAULT false,
    "completedAt" TIMESTAMP(3),
    "dueDate" DATE,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_activity_tasks_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pms_production_date_people_productionDateId_contactId_key" ON "pms_production_date_people"("productionDateId", "contactId");

-- CreateIndex
CREATE INDEX "pms_activity_notes_entityType_entityId_idx" ON "pms_activity_notes"("entityType", "entityId");

-- CreateIndex
CREATE INDEX "pms_activity_tasks_entityType_entityId_idx" ON "pms_activity_tasks"("entityType", "entityId");

-- AddForeignKey
ALTER TABLE "pms_production_date_people" ADD CONSTRAINT "pms_production_date_people_productionDateId_fkey" FOREIGN KEY ("productionDateId") REFERENCES "pms_production_dates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_production_date_people" ADD CONSTRAINT "pms_production_date_people_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "pms_contacts"("id") ON DELETE CASCADE ON UPDATE CASCADE;
