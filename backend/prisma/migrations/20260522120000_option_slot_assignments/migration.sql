-- CreateTable
CREATE TABLE "pms_option_slot_assignments" (
    "id" TEXT NOT NULL,
    "requirementId" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "dateId" TEXT NOT NULL,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_option_slot_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "pms_option_slot_assignments_candidateId_idx" ON "pms_option_slot_assignments"("candidateId");

-- CreateIndex
CREATE INDEX "pms_option_slot_assignments_dateId_idx" ON "pms_option_slot_assignments"("dateId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_option_slot_assignments_requirementId_dateId_key" ON "pms_option_slot_assignments"("requirementId", "dateId");

-- AddForeignKey
ALTER TABLE "pms_option_slot_assignments" ADD CONSTRAINT "pms_option_slot_assignments_requirementId_fkey" FOREIGN KEY ("requirementId") REFERENCES "pms_option_requirements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_option_slot_assignments" ADD CONSTRAINT "pms_option_slot_assignments_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "pms_option_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_option_slot_assignments" ADD CONSTRAINT "pms_option_slot_assignments_dateId_fkey" FOREIGN KEY ("dateId") REFERENCES "pms_production_dates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

