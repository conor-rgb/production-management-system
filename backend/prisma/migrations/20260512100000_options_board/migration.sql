-- CreateEnum
CREATE TYPE "pms_option_status" AS ENUM ('RECOMMENDED', 'OPTION', 'SHORTLISTED', 'NOT_AVAILABLE');

-- CreateEnum
CREATE TYPE "pms_option_availability" AS ENUM ('AVAILABLE', 'UNAVAILABLE', 'TBC', 'UNKNOWN');

-- CreateTable
CREATE TABLE "pms_options_boards" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "title" TEXT NOT NULL DEFAULT 'Options',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_options_boards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_options_categories" (
    "id" TEXT NOT NULL,
    "boardId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "emoji" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_options_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_options" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subtitle" TEXT,
    "website" TEXT,
    "contactName" TEXT,
    "contactEmail" TEXT,
    "contactPhone" TEXT,
    "rate" DOUBLE PRECISION,
    "rateUnit" TEXT,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "status" "pms_option_status" NOT NULL DEFAULT 'OPTION',
    "isAvailable" "pms_option_availability" NOT NULL DEFAULT 'UNKNOWN',
    "internalNotes" TEXT,
    "clientNotes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "libraryEntryId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_options_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_option_photos" (
    "id" TEXT NOT NULL,
    "optionId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "caption" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_option_photos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pms_options_boards_productionId_key" ON "pms_options_boards"("productionId");

-- AddForeignKey
ALTER TABLE "pms_options_boards" ADD CONSTRAINT "pms_options_boards_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_options_categories" ADD CONSTRAINT "pms_options_categories_boardId_fkey" FOREIGN KEY ("boardId") REFERENCES "pms_options_boards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_options" ADD CONSTRAINT "pms_options_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "pms_options_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_option_photos" ADD CONSTRAINT "pms_option_photos_optionId_fkey" FOREIGN KEY ("optionId") REFERENCES "pms_options"("id") ON DELETE CASCADE ON UPDATE CASCADE;

