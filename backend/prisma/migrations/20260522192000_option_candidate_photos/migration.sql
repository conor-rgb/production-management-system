CREATE TABLE "pms_option_candidate_photos" (
    "id" TEXT NOT NULL,
    "candidateId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "storedPath" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER,
    "height" INTEGER,
    "order" INTEGER NOT NULL DEFAULT 0,
    "caption" TEXT,
    "exportSelected" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pms_option_candidate_photos_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pms_option_candidate_photos_candidateId_order_idx" ON "pms_option_candidate_photos"("candidateId", "order");

ALTER TABLE "pms_option_candidate_photos" ADD CONSTRAINT "pms_option_candidate_photos_candidateId_fkey" FOREIGN KEY ("candidateId") REFERENCES "pms_option_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;
