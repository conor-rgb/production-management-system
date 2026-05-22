-- CreateEnum
CREATE TYPE "pms_blackbook_address_type" AS ENUM ('WORK', 'BILLING', 'PERSONAL', 'CUSTOM');

-- CreateEnum
CREATE TYPE "pms_blackbook_address_source" AS ENUM ('MANUAL', 'GOOGLE_PLACES');

-- AlterTable
ALTER TABLE "pms_option_candidates" ADD COLUMN     "selectedAddressId" TEXT;

-- CreateTable
CREATE TABLE "pms_blackbook_addresses" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "type" "pms_blackbook_address_type" NOT NULL DEFAULT 'WORK',
    "label" TEXT,
    "isDefaultBilling" BOOLEAN NOT NULL DEFAULT false,
    "source" "pms_blackbook_address_source" NOT NULL DEFAULT 'MANUAL',
    "placeId" TEXT,
    "placeName" TEXT,
    "formattedAddress" TEXT,
    "addressLine1" TEXT,
    "addressLine2" TEXT,
    "city" TEXT,
    "region" TEXT,
    "postcode" TEXT,
    "country" TEXT,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "website" TEXT,
    "phone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_blackbook_addresses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_blackbook_addresses_entryId_idx" ON "pms_blackbook_addresses"("entryId");

-- CreateIndex
CREATE INDEX "pms_option_candidates_selectedAddressId_idx" ON "pms_option_candidates"("selectedAddressId");

-- AddForeignKey
ALTER TABLE "pms_blackbook_addresses" ADD CONSTRAINT "pms_blackbook_addresses_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "pms_blackbook_entries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_option_candidates" ADD CONSTRAINT "pms_option_candidates_selectedAddressId_fkey" FOREIGN KEY ("selectedAddressId") REFERENCES "pms_blackbook_addresses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

