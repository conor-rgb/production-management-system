-- AlterTable
ALTER TABLE "pms_option_groups" ADD COLUMN     "workstreamId" TEXT;

-- CreateIndex
CREATE INDEX "pms_option_groups_workstreamId_idx" ON "pms_option_groups"("workstreamId");

-- AddForeignKey
ALTER TABLE "pms_option_groups" ADD CONSTRAINT "pms_option_groups_workstreamId_fkey" FOREIGN KEY ("workstreamId") REFERENCES "pms_project_workstreams"("id") ON DELETE SET NULL ON UPDATE CASCADE;
