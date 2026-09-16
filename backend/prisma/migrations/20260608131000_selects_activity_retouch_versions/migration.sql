CREATE TYPE "pms_still_share_role" AS ENUM (
  'CLIENT',
  'RETOUCHER'
);

CREATE TYPE "pms_still_activity_action" AS ENUM (
  'VIEWED',
  'STATUS_CHANGED',
  'RATING_CHANGED',
  'COMMENTED',
  'NOTE_RESOLVED',
  'REVIEW_SUBMITTED',
  'VERSION_UPLOADED'
);

ALTER TABLE "pms_still_share_links"
  ADD COLUMN "role" "pms_still_share_role" NOT NULL DEFAULT 'CLIENT',
  ADD COLUMN "reviewerName" TEXT,
  ADD COLUMN "reviewerEmail" TEXT;

CREATE TABLE "pms_still_image_activities" (
  "id" TEXT NOT NULL,
  "imageId" TEXT,
  "productionId" TEXT NOT NULL,
  "shareLinkId" TEXT,
  "action" "pms_still_activity_action" NOT NULL,
  "actorName" TEXT,
  "actorEmail" TEXT,
  "actorRole" "pms_still_share_role",
  "fromValue" TEXT,
  "toValue" TEXT,
  "metadata" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pms_still_image_activities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pms_still_retouch_versions" (
  "id" TEXT NOT NULL,
  "imageId" TEXT NOT NULL,
  "jobFileId" TEXT NOT NULL,
  "version" INTEGER NOT NULL,
  "label" TEXT,
  "notes" TEXT,
  "uploadedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pms_still_retouch_versions_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pms_still_image_activities_productionId_createdAt_idx" ON "pms_still_image_activities"("productionId", "createdAt");
CREATE INDEX "pms_still_image_activities_imageId_createdAt_idx" ON "pms_still_image_activities"("imageId", "createdAt");
CREATE INDEX "pms_still_image_activities_shareLinkId_idx" ON "pms_still_image_activities"("shareLinkId");

CREATE UNIQUE INDEX "pms_still_retouch_versions_imageId_version_key" ON "pms_still_retouch_versions"("imageId", "version");
CREATE INDEX "pms_still_retouch_versions_imageId_createdAt_idx" ON "pms_still_retouch_versions"("imageId", "createdAt");

ALTER TABLE "pms_still_image_activities"
  ADD CONSTRAINT "pms_still_image_activities_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "pms_still_images"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "pms_still_image_activities_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pms_still_retouch_versions"
  ADD CONSTRAINT "pms_still_retouch_versions_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "pms_still_images"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  ADD CONSTRAINT "pms_still_retouch_versions_jobFileId_fkey" FOREIGN KEY ("jobFileId") REFERENCES "pms_job_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
