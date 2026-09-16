CREATE TYPE "pms_still_status" AS ENUM (
  'UPLOADED',
  'SHORTLIST',
  'CLIENT_SELECT',
  'TO_RETOUCH',
  'RETOUCHING',
  'CHANGES_REQUESTED',
  'APPROVED',
  'DELIVERED',
  'REJECTED'
);

CREATE TYPE "pms_still_annotation_visibility" AS ENUM (
  'INTERNAL',
  'CLIENT'
);

CREATE TABLE "pms_production_skus" (
  "id" TEXT NOT NULL,
  "productionId" TEXT NOT NULL,
  "code" TEXT NOT NULL,
  "name" TEXT,
  "description" TEXT,
  "colorway" TEXT,
  "notes" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pms_production_skus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pms_still_folders" (
  "id" TEXT NOT NULL,
  "productionId" TEXT NOT NULL,
  "parentId" TEXT,
  "name" TEXT NOT NULL,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pms_still_folders_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pms_still_images" (
  "id" TEXT NOT NULL,
  "productionId" TEXT NOT NULL,
  "jobFileId" TEXT NOT NULL,
  "folderId" TEXT,
  "status" "pms_still_status" NOT NULL DEFAULT 'UPLOADED',
  "rating" INTEGER,
  "isHero" BOOLEAN NOT NULL DEFAULT false,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "retouchSummary" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pms_still_images_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pms_still_image_skus" (
  "id" TEXT NOT NULL,
  "imageId" TEXT NOT NULL,
  "skuId" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pms_still_image_skus_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pms_still_annotations" (
  "id" TEXT NOT NULL,
  "imageId" TEXT NOT NULL,
  "x" DOUBLE PRECISION NOT NULL,
  "y" DOUBLE PRECISION NOT NULL,
  "body" TEXT NOT NULL,
  "visibility" "pms_still_annotation_visibility" NOT NULL DEFAULT 'INTERNAL',
  "resolved" BOOLEAN NOT NULL DEFAULT false,
  "authorName" TEXT,
  "authorEmail" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pms_still_annotations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pms_still_share_links" (
  "id" TEXT NOT NULL,
  "productionId" TEXT NOT NULL,
  "folderId" TEXT,
  "token" TEXT NOT NULL,
  "label" TEXT,
  "expiresAt" TIMESTAMP(3),
  "allowDownloads" BOOLEAN NOT NULL DEFAULT false,
  "watermark" BOOLEAN NOT NULL DEFAULT true,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "pms_still_share_links_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pms_production_skus_productionId_code_key" ON "pms_production_skus"("productionId", "code");
CREATE INDEX "pms_production_skus_productionId_idx" ON "pms_production_skus"("productionId");
CREATE INDEX "pms_still_folders_productionId_parentId_sortOrder_idx" ON "pms_still_folders"("productionId", "parentId", "sortOrder");
CREATE UNIQUE INDEX "pms_still_images_jobFileId_key" ON "pms_still_images"("jobFileId");
CREATE INDEX "pms_still_images_productionId_folderId_status_idx" ON "pms_still_images"("productionId", "folderId", "status");
CREATE INDEX "pms_still_images_productionId_rating_idx" ON "pms_still_images"("productionId", "rating");
CREATE UNIQUE INDEX "pms_still_image_skus_imageId_skuId_key" ON "pms_still_image_skus"("imageId", "skuId");
CREATE INDEX "pms_still_image_skus_skuId_idx" ON "pms_still_image_skus"("skuId");
CREATE INDEX "pms_still_annotations_imageId_resolved_idx" ON "pms_still_annotations"("imageId", "resolved");
CREATE UNIQUE INDEX "pms_still_share_links_token_key" ON "pms_still_share_links"("token");
CREATE INDEX "pms_still_share_links_productionId_idx" ON "pms_still_share_links"("productionId");

ALTER TABLE "pms_production_skus" ADD CONSTRAINT "pms_production_skus_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pms_still_folders" ADD CONSTRAINT "pms_still_folders_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pms_still_folders" ADD CONSTRAINT "pms_still_folders_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "pms_still_folders"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pms_still_images" ADD CONSTRAINT "pms_still_images_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pms_still_images" ADD CONSTRAINT "pms_still_images_jobFileId_fkey" FOREIGN KEY ("jobFileId") REFERENCES "pms_job_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pms_still_images" ADD CONSTRAINT "pms_still_images_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "pms_still_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "pms_still_image_skus" ADD CONSTRAINT "pms_still_image_skus_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "pms_still_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pms_still_image_skus" ADD CONSTRAINT "pms_still_image_skus_skuId_fkey" FOREIGN KEY ("skuId") REFERENCES "pms_production_skus"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pms_still_annotations" ADD CONSTRAINT "pms_still_annotations_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "pms_still_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pms_still_share_links" ADD CONSTRAINT "pms_still_share_links_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "pms_still_share_links" ADD CONSTRAINT "pms_still_share_links_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "pms_still_folders"("id") ON DELETE SET NULL ON UPDATE CASCADE;
