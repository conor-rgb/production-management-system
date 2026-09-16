ALTER TABLE "pms_productions" ADD COLUMN "driveFolderId" TEXT, ADD COLUMN "driveFolderName" TEXT;
CREATE UNIQUE INDEX "pms_productions_driveFolderId_key" ON "pms_productions"("driveFolderId");
ALTER TABLE "pms_job_files" ADD COLUMN "driveFileId" TEXT, ADD COLUMN "driveWebViewLink" TEXT,
 ADD COLUMN "driveSyncStatus" TEXT NOT NULL DEFAULT 'LOCAL', ADD COLUMN "driveSyncError" TEXT,
 ADD COLUMN "driveSyncedAt" TIMESTAMP(3), ADD COLUMN "driveLeaseUntil" TIMESTAMP(3);
CREATE UNIQUE INDEX "pms_job_files_driveFileId_key" ON "pms_job_files"("driveFileId");
CREATE TABLE "pms_drive_connection" (
 "id" TEXT NOT NULL DEFAULT 'workspace', "refreshToken" TEXT NOT NULL, "rootFolderId" TEXT NOT NULL,
 "connectedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
 CONSTRAINT "pms_drive_connection_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "pms_job_files_driveSyncStatus_uploadedAt_idx" ON "pms_job_files"("driveSyncStatus", "uploadedAt");
