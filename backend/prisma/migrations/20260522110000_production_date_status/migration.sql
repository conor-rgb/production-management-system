-- CreateEnum
CREATE TYPE "pms_production_date_status" AS ENUM ('PROPOSED', 'OPTIONED', 'CONFIRMED', 'RELEASED', 'CANCELLED');

-- AlterTable
ALTER TABLE "pms_production_dates" ADD COLUMN     "status" "pms_production_date_status" NOT NULL DEFAULT 'PROPOSED';

