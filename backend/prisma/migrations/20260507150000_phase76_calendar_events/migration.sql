-- CreateEnum
CREATE TYPE "pms_calendar_event_type" AS ENUM ('SHOOT_DAY', 'PPM', 'RECCE', 'FITTING', 'MEETING', 'POST_DELIVERY', 'FOLLOW_UP', 'GOOGLE_SYNC', 'STANDALONE', 'OTHER');

-- CreateTable
CREATE TABLE "pms_calendar_events" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "isAllDay" BOOLEAN NOT NULL DEFAULT false,
    "location" TEXT,
    "zoomLink" TEXT,
    "notes" TEXT,
    "color" TEXT,
    "eventType" "pms_calendar_event_type" NOT NULL DEFAULT 'STANDALONE',
    "productionId" TEXT,
    "productionDateId" TEXT,
    "opportunityId" TEXT,
    "contactIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "googleCalendarEventId" TEXT,
    "googleCalendarId" TEXT,
    "syncedFromGoogle" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_calendar_events_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_calendar_events_startDate_idx" ON "pms_calendar_events"("startDate");

-- CreateIndex
CREATE INDEX "pms_calendar_events_endDate_idx" ON "pms_calendar_events"("endDate");

-- CreateIndex
CREATE INDEX "pms_calendar_events_productionId_idx" ON "pms_calendar_events"("productionId");

-- CreateIndex
CREATE INDEX "pms_calendar_events_productionDateId_idx" ON "pms_calendar_events"("productionDateId");

-- CreateIndex
CREATE INDEX "pms_calendar_events_opportunityId_idx" ON "pms_calendar_events"("opportunityId");

-- CreateIndex
CREATE INDEX "pms_calendar_events_googleCalendarEventId_idx" ON "pms_calendar_events"("googleCalendarEventId");

-- AddForeignKey
ALTER TABLE "pms_calendar_events" ADD CONSTRAINT "pms_calendar_events_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_calendar_events" ADD CONSTRAINT "pms_calendar_events_opportunityId_fkey" FOREIGN KEY ("opportunityId") REFERENCES "pms_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
