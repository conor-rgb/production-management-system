-- CreateEnum
CREATE TYPE "pms_option_requirement_type" AS ENUM ('CREW', 'SERVICE', 'LOCATION', 'EQUIPMENT', 'TALENT', 'TRANSPORT', 'POST', 'OTHER');

-- CreateEnum
CREATE TYPE "pms_option_requirement_state" AS ENUM ('ACTIVE', 'PARKED', 'RELEASED');

-- CreateEnum
CREATE TYPE "pms_option_candidate_state" AS ENUM ('ACTIVE', 'PARKED', 'RELEASED');

-- CreateEnum
CREATE TYPE "pms_candidate_date_hold_status" AS ENUM ('REQUESTED', 'FIRST_OPTION', 'SECOND_OPTION', 'CONFIRMED', 'RELEASED', 'UNAVAILABLE', 'NA');

-- CreateTable
CREATE TABLE "pms_option_groups" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "pms_option_requirement_type" NOT NULL DEFAULT 'OTHER',
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_option_groups_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_option_requirements" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "displayLabel" TEXT NOT NULL,
    "type" "pms_option_requirement_type" NOT NULL DEFAULT 'OTHER',
    "slotNumber" INTEGER NOT NULL DEFAULT 1,
    "activeState" "pms_option_requirement_state" NOT NULL DEFAULT 'ACTIVE',
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_option_requirements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_requirement_date_needs" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "dateId" TEXT NOT NULL,
    "isRequired" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_requirement_date_needs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_option_candidates" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "website" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "rate" DOUBLE PRECISION,
    "rateUnit" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "activeState" "pms_option_candidate_state" NOT NULL DEFAULT 'ACTIVE',
    "internalNotes" TEXT,
    "clientNotes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_option_candidates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_candidate_date_statuses" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "dateId" TEXT NOT NULL,
    "status" "pms_candidate_date_hold_status" NOT NULL DEFAULT 'REQUESTED',
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_candidate_date_statuses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_option_groups_productionId_order_idx" ON "pms_option_groups"("productionId", "order");

-- CreateIndex
CREATE INDEX "pms_option_requirements_productionId_order_idx" ON "pms_option_requirements"("productionId", "order");

-- CreateIndex
CREATE INDEX "pms_option_requirements_groupId_idx" ON "pms_option_requirements"("groupId");

-- CreateIndex
CREATE INDEX "pms_requirement_date_needs_dateId_idx" ON "pms_requirement_date_needs"("dateId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_requirement_date_needs_requirementId_dateId_key" ON "pms_requirement_date_needs"("requirementId", "dateId");

-- CreateIndex
CREATE INDEX "pms_option_candidates_productionId_idx" ON "pms_option_candidates"("productionId");

-- CreateIndex
CREATE INDEX "pms_option_candidates_groupId_order_idx" ON "pms_option_candidates"("groupId", "order");

-- CreateIndex
CREATE INDEX "pms_candidate_date_statuses_dateId_idx" ON "pms_candidate_date_statuses"("dateId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_candidate_date_statuses_candidateId_dateId_key" ON "pms_candidate_date_statuses"("candidateId", "dateId");

-- AddForeignKey
ALTER TABLE "pms_option_groups" ADD CONSTRAINT "pms_option_groups_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_option_requirements" ADD CONSTRAINT "pms_option_requirements_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_option_requirements" ADD CONSTRAINT "pms_option_requirements_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "pms_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_requirement_date_needs" ADD CONSTRAINT "pms_requirement_date_needs_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "pms_option_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_requirement_date_needs" ADD CONSTRAINT "pms_requirement_date_needs_dateId_fkey" FOREIGN KEY ("dateId") REFERENCES "pms_production_dates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_option_candidates" ADD CONSTRAINT "pms_option_candidates_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_option_candidates" ADD CONSTRAINT "pms_option_candidates_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "pms_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_candidate_date_statuses" ADD CONSTRAINT "pms_candidate_date_statuses_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "pms_option_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_candidate_date_statuses" ADD CONSTRAINT "pms_candidate_date_statuses_dateId_fkey" FOREIGN KEY ("dateId") REFERENCES "pms_production_dates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

