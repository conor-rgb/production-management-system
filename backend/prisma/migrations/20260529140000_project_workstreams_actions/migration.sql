-- CreateEnum
CREATE TYPE "pms_project_action_type" AS ENUM ('TASK', 'DEADLINE', 'EVENT', 'MEETING', 'TRAVEL', 'SHOOT', 'REMINDER');

-- CreateEnum
CREATE TYPE "pms_project_action_status" AS ENUM ('TODO', 'IN_PROGRESS', 'WAITING', 'DONE', 'BLOCKED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "pms_project_action_visibility" AS ENUM ('INTERNAL', 'CLIENT');

-- CreateTable
CREATE TABLE "pms_project_workstreams" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "optionGroupId" TEXT,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "visibleOnClientTimeline" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_project_workstreams_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_project_actions" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "workstreamId" TEXT,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "actionType" "pms_project_action_type" NOT NULL DEFAULT 'TASK',
    "visibility" "pms_project_action_visibility" NOT NULL DEFAULT 'INTERNAL',
    "status" "pms_project_action_status" NOT NULL DEFAULT 'TODO',
    "startAt" TIMESTAMP(3),
    "endAt" TIMESTAMP(3),
    "isAllDay" BOOLEAN NOT NULL DEFAULT true,
    "location" TEXT,
    "zoomLink" TEXT,
    "reminderMinutes" INTEGER,
    "roleRequirementId" TEXT,
    "optionCandidateId" TEXT,
    "blackbookEntryId" TEXT,
    "emailThreadId" TEXT,
    "emailMessageId" TEXT,
    "calendarEventId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_project_actions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_project_workstreams_productionId_order_idx" ON "pms_project_workstreams"("productionId", "order");

-- CreateIndex
CREATE UNIQUE INDEX "pms_project_workstreams_productionId_optionGroupId_key" ON "pms_project_workstreams"("productionId", "optionGroupId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_project_actions_calendarEventId_key" ON "pms_project_actions"("calendarEventId");

-- CreateIndex
CREATE INDEX "pms_project_actions_productionId_startAt_idx" ON "pms_project_actions"("productionId", "startAt");

-- CreateIndex
CREATE INDEX "pms_project_actions_workstreamId_idx" ON "pms_project_actions"("workstreamId");

-- CreateIndex
CREATE INDEX "pms_project_actions_roleRequirementId_idx" ON "pms_project_actions"("roleRequirementId");

-- CreateIndex
CREATE INDEX "pms_project_actions_optionCandidateId_idx" ON "pms_project_actions"("optionCandidateId");

-- CreateIndex
CREATE INDEX "pms_project_actions_blackbookEntryId_idx" ON "pms_project_actions"("blackbookEntryId");

-- CreateIndex
CREATE INDEX "pms_project_actions_emailThreadId_idx" ON "pms_project_actions"("emailThreadId");

-- CreateIndex
CREATE INDEX "pms_project_actions_emailMessageId_idx" ON "pms_project_actions"("emailMessageId");

-- AddForeignKey
ALTER TABLE "pms_project_workstreams" ADD CONSTRAINT "pms_project_workstreams_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_workstreams" ADD CONSTRAINT "pms_project_workstreams_optionGroupId_fkey" FOREIGN KEY ("optionGroupId") REFERENCES "pms_option_groups"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_actions" ADD CONSTRAINT "pms_project_actions_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_actions" ADD CONSTRAINT "pms_project_actions_workstreamId_fkey" FOREIGN KEY ("workstreamId") REFERENCES "pms_project_workstreams"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_actions" ADD CONSTRAINT "pms_project_actions_roleRequirementId_fkey" FOREIGN KEY ("roleRequirementId") REFERENCES "pms_option_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_actions" ADD CONSTRAINT "pms_project_actions_optionCandidateId_fkey" FOREIGN KEY ("optionCandidateId") REFERENCES "pms_option_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_actions" ADD CONSTRAINT "pms_project_actions_blackbookEntryId_fkey" FOREIGN KEY ("blackbookEntryId") REFERENCES "pms_blackbook_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_actions" ADD CONSTRAINT "pms_project_actions_emailThreadId_fkey" FOREIGN KEY ("emailThreadId") REFERENCES "pms_email_threads"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_actions" ADD CONSTRAINT "pms_project_actions_emailMessageId_fkey" FOREIGN KEY ("emailMessageId") REFERENCES "pms_email_messages"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_project_actions" ADD CONSTRAINT "pms_project_actions_calendarEventId_fkey" FOREIGN KEY ("calendarEventId") REFERENCES "pms_calendar_events"("id") ON DELETE SET NULL ON UPDATE CASCADE;
