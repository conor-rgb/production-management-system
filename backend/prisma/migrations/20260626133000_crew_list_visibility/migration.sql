ALTER TABLE "pms_option_groups"
ADD COLUMN "hiddenFromCrewList" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "pms_crew_members"
ADD COLUMN "hiddenFromCrewList" BOOLEAN NOT NULL DEFAULT false;
