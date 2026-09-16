ALTER TYPE "CrewItineraryItemType" ADD VALUE IF NOT EXISTS 'HOTEL';

ALTER TABLE "pms_crew_itinerary_items"
ADD COLUMN "endDate" DATE,
ADD COLUMN "startTimezone" TEXT,
ADD COLUMN "endTimezone" TEXT,
ADD COLUMN "bookingUrl" TEXT,
ADD COLUMN "flightNumber" TEXT,
ADD COLUMN "trainNumber" TEXT,
ADD COLUMN "seat" TEXT,
ADD COLUMN "coach" TEXT,
ADD COLUMN "baggage" TEXT,
ADD COLUMN "passengerName" TEXT,
ADD COLUMN "roomType" TEXT,
ADD COLUMN "roomNumber" TEXT,
ADD COLUMN "checkInDetails" TEXT,
ADD COLUMN "checkOutDetails" TEXT,
ADD COLUMN "cancellationPolicy" TEXT;
