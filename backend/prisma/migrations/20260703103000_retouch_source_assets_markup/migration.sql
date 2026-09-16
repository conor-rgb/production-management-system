-- CreateEnum
CREATE TYPE "pms_still_source_asset_type" AS ENUM ('RAW', 'TIFF', 'EIP', 'PSD', 'DRIVE_FOLDER', 'OTHER');

-- AlterTable
ALTER TABLE "pms_still_annotations" ADD COLUMN "markup" JSONB;

-- CreateTable
CREATE TABLE "pms_still_source_assets" (
    "id" TEXT NOT NULL,
    "imageId" TEXT NOT NULL,
    "jobFileId" TEXT,
    "type" "pms_still_source_asset_type" NOT NULL DEFAULT 'OTHER',
    "label" TEXT,
    "externalUrl" TEXT,
    "sizeBytes" INTEGER,
    "mimeType" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_still_source_assets_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_still_source_assets_imageId_type_idx" ON "pms_still_source_assets"("imageId", "type");

-- CreateIndex
CREATE INDEX "pms_still_source_assets_jobFileId_idx" ON "pms_still_source_assets"("jobFileId");

-- AddForeignKey
ALTER TABLE "pms_still_source_assets" ADD CONSTRAINT "pms_still_source_assets_imageId_fkey" FOREIGN KEY ("imageId") REFERENCES "pms_still_images"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_still_source_assets" ADD CONSTRAINT "pms_still_source_assets_jobFileId_fkey" FOREIGN KEY ("jobFileId") REFERENCES "pms_job_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
