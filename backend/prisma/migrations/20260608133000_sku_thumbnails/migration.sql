ALTER TABLE "pms_production_skus"
  ADD COLUMN "thumbnailJobFileId" TEXT;

CREATE INDEX "pms_production_skus_thumbnailJobFileId_idx" ON "pms_production_skus"("thumbnailJobFileId");

ALTER TABLE "pms_production_skus"
  ADD CONSTRAINT "pms_production_skus_thumbnailJobFileId_fkey" FOREIGN KEY ("thumbnailJobFileId") REFERENCES "pms_job_files"("id") ON DELETE SET NULL ON UPDATE CASCADE;
