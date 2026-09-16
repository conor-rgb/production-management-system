-- CreateEnum
CREATE TYPE "CrewItineraryStatus" AS ENUM ('DRAFT', 'READY', 'SENT');

-- CreateEnum
CREATE TYPE "CrewItineraryItemType" AS ENUM ('CAR', 'TRAIN', 'FLIGHT', 'EVENT');

-- CreateTable
CREATE TABLE "pms_crew_itineraries" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "crewMemberId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "introNotes" TEXT,
    "status" "CrewItineraryStatus" NOT NULL DEFAULT 'DRAFT',
    "generatedAt" TIMESTAMP(3),
    "exportedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_crew_itineraries_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_crew_itinerary_items" (
    "id" TEXT NOT NULL,
    "itineraryId" TEXT NOT NULL,
    "type" "CrewItineraryItemType" NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "date" DATE,
    "startTime" TEXT,
    "endTime" TEXT,
    "origin" TEXT,
    "destination" TEXT,
    "provider" TEXT,
    "bookingReference" TEXT,
    "address" TEXT,
    "terminal" TEXT,
    "platform" TEXT,
    "gate" TEXT,
    "contactName" TEXT,
    "contactPhone" TEXT,
    "contactEmail" TEXT,
    "cost" DECIMAL(10,2),
    "paidBy" TEXT,
    "notes" TEXT,
    "exportVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_crew_itinerary_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_crew_itinerary_appendix_pages" (
    "id" TEXT NOT NULL,
    "itineraryId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL DEFAULT '',
    "order" INTEGER NOT NULL DEFAULT 0,
    "exportVisible" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_crew_itinerary_appendix_pages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_crew_itinerary_item_files" (
    "id" TEXT NOT NULL,
    "itemId" TEXT NOT NULL,
    "fileId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_crew_itinerary_item_files_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pms_crew_itineraries_crewMemberId_key" ON "pms_crew_itineraries"("crewMemberId");

-- CreateIndex
CREATE INDEX "pms_crew_itineraries_productionId_idx" ON "pms_crew_itineraries"("productionId");

-- CreateIndex
CREATE INDEX "pms_crew_itinerary_items_itineraryId_order_idx" ON "pms_crew_itinerary_items"("itineraryId", "order");

-- CreateIndex
CREATE INDEX "pms_crew_itinerary_appendix_pages_itineraryId_order_idx" ON "pms_crew_itinerary_appendix_pages"("itineraryId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "pms_crew_itinerary_item_files_itemId_fileId_key" ON "pms_crew_itinerary_item_files"("itemId", "fileId");

-- CreateIndex
CREATE INDEX "pms_crew_itinerary_item_files_fileId_idx" ON "pms_crew_itinerary_item_files"("fileId");

-- AddForeignKey
ALTER TABLE "pms_crew_itineraries" ADD CONSTRAINT "pms_crew_itineraries_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_crew_itineraries" ADD CONSTRAINT "pms_crew_itineraries_crewMemberId_fkey" FOREIGN KEY ("crewMemberId") REFERENCES "pms_crew_members"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_crew_itinerary_items" ADD CONSTRAINT "pms_crew_itinerary_items_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "pms_crew_itineraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_crew_itinerary_appendix_pages" ADD CONSTRAINT "pms_crew_itinerary_appendix_pages_itineraryId_fkey" FOREIGN KEY ("itineraryId") REFERENCES "pms_crew_itineraries"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_crew_itinerary_item_files" ADD CONSTRAINT "pms_crew_itinerary_item_files_itemId_fkey" FOREIGN KEY ("itemId") REFERENCES "pms_crew_itinerary_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_crew_itinerary_item_files" ADD CONSTRAINT "pms_crew_itinerary_item_files_fileId_fkey" FOREIGN KEY ("fileId") REFERENCES "pms_job_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
