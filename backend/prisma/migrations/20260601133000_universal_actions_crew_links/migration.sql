-- Make project actions usable as universal tasks/actions, including email-only reminders.
ALTER TABLE "pms_project_actions" DROP CONSTRAINT IF EXISTS "pms_project_actions_productionId_fkey";
ALTER TABLE "pms_project_actions" ALTER COLUMN "productionId" DROP NOT NULL;
ALTER TABLE "pms_project_actions" ADD CONSTRAINT "pms_project_actions_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- Link crew-list rows back to the Blackbook/options source of truth.
ALTER TABLE "pms_crew_members" ADD COLUMN "blackbookEntryId" TEXT;
ALTER TABLE "pms_crew_members" ADD COLUMN "optionCandidateId" TEXT;
ALTER TABLE "pms_crew_members" ADD COLUMN "roleRequirementId" TEXT;
ALTER TABLE "pms_crew_members" ADD COLUMN "dietaryNotes" TEXT;
ALTER TABLE "pms_crew_members" ADD COLUMN "dietaryFlags" TEXT[] DEFAULT ARRAY[]::TEXT[];
ALTER TABLE "pms_crew_members" ADD COLUMN "detailsRequestedAt" TIMESTAMP(3);
ALTER TABLE "pms_crew_members" ADD COLUMN "detailsReceivedAt" TIMESTAMP(3);
ALTER TABLE "pms_crew_members" ADD COLUMN "callTime" TEXT;
ALTER TABLE "pms_crew_members" ADD COLUMN "wrapTime" TEXT;

CREATE INDEX "pms_crew_members_blackbookEntryId_idx" ON "pms_crew_members"("blackbookEntryId");
CREATE INDEX "pms_crew_members_optionCandidateId_idx" ON "pms_crew_members"("optionCandidateId");
CREATE INDEX "pms_crew_members_roleRequirementId_idx" ON "pms_crew_members"("roleRequirementId");

ALTER TABLE "pms_crew_members" ADD CONSTRAINT "pms_crew_members_blackbookEntryId_fkey" FOREIGN KEY ("blackbookEntryId") REFERENCES "pms_blackbook_entries"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pms_crew_members" ADD CONSTRAINT "pms_crew_members_optionCandidateId_fkey" FOREIGN KEY ("optionCandidateId") REFERENCES "pms_option_candidates"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pms_crew_members" ADD CONSTRAINT "pms_crew_members_roleRequirementId_fkey" FOREIGN KEY ("roleRequirementId") REFERENCES "pms_option_requirements"("id") ON DELETE SET NULL ON UPDATE CASCADE;
