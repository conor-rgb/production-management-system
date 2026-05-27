ALTER TABLE "pms_option_candidates" ADD COLUMN "latitude" DOUBLE PRECISION;
ALTER TABLE "pms_option_candidates" ADD COLUMN "longitude" DOUBLE PRECISION;
ALTER TABLE "pms_option_candidates" ADD COLUMN "mapImagePath" TEXT;
ALTER TABLE "pms_option_candidates" ADD COLUMN "mapImageUpdatedAt" TIMESTAMP(3);
