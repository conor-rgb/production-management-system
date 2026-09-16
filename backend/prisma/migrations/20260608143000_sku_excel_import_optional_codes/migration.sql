DROP INDEX IF EXISTS "pms_production_skus_productionId_code_key";

ALTER TABLE "pms_production_skus"
  ALTER COLUMN "code" DROP NOT NULL,
  ADD COLUMN "materialSupplier" TEXT,
  ADD COLUMN "materialName" TEXT,
  ADD COLUMN "composition" TEXT,
  ADD COLUMN "hardware" TEXT,
  ADD COLUMN "price" TEXT,
  ADD COLUMN "sourceSheet" TEXT;

CREATE UNIQUE INDEX "pms_production_skus_productionId_code_key"
  ON "pms_production_skus"("productionId", "code")
  WHERE "code" IS NOT NULL AND "code" <> '';

CREATE INDEX "pms_production_skus_productionId_variant_idx"
  ON "pms_production_skus"("productionId", "name", "colorway", "materialName", "hardware");
