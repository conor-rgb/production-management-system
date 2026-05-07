-- DropForeignKey
ALTER TABLE "pms_job_files" DROP CONSTRAINT "pms_job_files_productionId_fkey";

-- AlterTable
ALTER TABLE "pms_job_files" ALTER COLUMN "productionId" DROP NOT NULL;

-- AddForeignKey
ALTER TABLE "pms_job_files" ADD CONSTRAINT "pms_job_files_productionId_fkey" FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
