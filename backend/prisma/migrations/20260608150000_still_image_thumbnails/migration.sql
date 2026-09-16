ALTER TABLE "pms_still_images"
  ADD COLUMN "thumbnailJobFileId" TEXT;

CREATE INDEX "pms_still_images_thumbnailJobFileId_idx"
  ON "pms_still_images"("thumbnailJobFileId");

ALTER TABLE "pms_still_images"
  ADD CONSTRAINT "pms_still_images_thumbnailJobFileId_fkey"
  FOREIGN KEY ("thumbnailJobFileId") REFERENCES "pms_job_files"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
