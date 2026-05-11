ALTER TABLE "pms_budget_line_items" ADD COLUMN "days" DOUBLE PRECISION DEFAULT 1;

UPDATE "pms_budget_line_items"
SET "days" = CASE
  WHEN "prepTravelDays" IS NOT NULL OR "shootDays" IS NOT NULL
    THEN COALESCE("prepTravelDays", 0) + COALESCE("shootDays", 0)
  ELSE 1
END;

UPDATE "pms_budget_line_items"
SET "qty" = COALESCE("qty", 1) * COALESCE("multiplier", 1)
WHERE COALESCE("multiplier", 1) <> 1;

UPDATE "pms_budget_line_items"
SET "agencyFeePercent" = CASE
  WHEN "agencyFeePercent" IS NULL THEN 0
  WHEN "agencyFeePercent" > 0 AND "agencyFeePercent" <= 1 THEN "agencyFeePercent" * 100
  ELSE "agencyFeePercent"
END;

UPDATE "pms_budget_line_items"
SET "estimatedTotal" = ROUND((COALESCE("qty", 1) * COALESCE("days", 1) * COALESCE("rate", 0) * (1 + (COALESCE("agencyFeePercent", 0) / 100)))::numeric, 2)::double precision,
    "variance" = ROUND(((COALESCE("qty", 1) * COALESCE("days", 1) * COALESCE("rate", 0) * (1 + (COALESCE("agencyFeePercent", 0) / 100))) - COALESCE("actualTotal", 0))::numeric, 2)::double precision;

ALTER TABLE "pms_budget_line_items" ALTER COLUMN "days" SET NOT NULL;
ALTER TABLE "pms_budget_line_items" ALTER COLUMN "agencyFeePercent" SET DEFAULT 0;
ALTER TABLE "pms_budget_line_items" DROP COLUMN "prepTravelDays";
ALTER TABLE "pms_budget_line_items" DROP COLUMN "shootDays";
ALTER TABLE "pms_budget_line_items" DROP COLUMN "multiplier";
ALTER TABLE "pms_budget_line_items" DROP COLUMN "otRate";
ALTER TABLE "pms_budget_line_items" DROP COLUMN "otHours";
