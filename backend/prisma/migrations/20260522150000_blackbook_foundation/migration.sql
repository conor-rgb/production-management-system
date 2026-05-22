-- CreateEnum
CREATE TYPE "pms_blackbook_entry_type" AS ENUM ('PERSON', 'COMPANY', 'LOCATION', 'TALENT', 'SERVICE');

-- CreateEnum
CREATE TYPE "pms_blackbook_category" AS ENUM ('CREW', 'SERVICE', 'LOCATION', 'EQUIPMENT', 'TALENT', 'TRANSPORT', 'POST', 'OTHER');

-- AlterTable
ALTER TABLE "pms_option_candidates" ADD COLUMN     "blackbookEntryId" TEXT;

-- CreateTable
CREATE TABLE "pms_blackbook_entries" (
    "id" TEXT NOT NULL,
    "entryType" "pms_blackbook_entry_type" NOT NULL DEFAULT 'PERSON',
    "category" "pms_blackbook_category" NOT NULL DEFAULT 'OTHER',
    "displayName" TEXT NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "companyName" TEXT,
    "jobTitle" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "website" TEXT,
    "tags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "notes" TEXT,
    "defaultRate" DOUBLE PRECISION,
    "rateUnit" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "dietaryNotes" TEXT,
    "dietaryFlags" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "allergens" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postcode" TEXT,
    "country" TEXT,
    "locationType" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "daylight" BOOLEAN,
    "blackout" BOOLEAN,
    "areaSqm" DOUBLE PRECISION,
    "shootingAreaSqm" DOUBLE PRECISION,
    "ceilingHeight" TEXT,
    "accessNotes" TEXT,
    "parkingNotes" TEXT,
    "travelNotes" TEXT,
    "facilities" TEXT,
    "ukAgency" TEXT,
    "frAgency" TEXT,
    "bookUrl" TEXT,
    "socialUrl" TEXT,
    "polasUrl" TEXT,
    "selfTapeUrl" TEXT,
    "modelsComUrl" TEXT,
    "height" TEXT,
    "eyes" TEXT,
    "hair" TEXT,
    "bust" TEXT,
    "waist" TEXT,
    "hips" TEXT,
    "shoe" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_blackbook_entries_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_blackbook_entries_entryType_category_idx" ON "pms_blackbook_entries"("entryType", "category");

-- CreateIndex
CREATE INDEX "pms_blackbook_entries_displayName_idx" ON "pms_blackbook_entries"("displayName");

-- CreateIndex
CREATE INDEX "pms_blackbook_entries_email_idx" ON "pms_blackbook_entries"("email");

-- CreateIndex
CREATE INDEX "pms_option_candidates_blackbookEntryId_idx" ON "pms_option_candidates"("blackbookEntryId");

-- AddForeignKey
ALTER TABLE "pms_option_candidates" ADD CONSTRAINT "pms_option_candidates_blackbookEntryId_fkey" FOREIGN KEY ("blackbookEntryId") REFERENCES "pms_blackbook_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

