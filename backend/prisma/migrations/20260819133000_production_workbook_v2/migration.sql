ALTER TYPE "pms_production_workbook_sheet_type" ADD VALUE IF NOT EXISTS 'SCOPE_DATES';
ALTER TYPE "pms_production_workbook_sheet_type" ADD VALUE IF NOT EXISTS 'ROLE_PLAN';
ALTER TYPE "pms_production_workbook_sheet_type" ADD VALUE IF NOT EXISTS 'OPTIONS_HOLDS';
ALTER TYPE "pms_production_workbook_sheet_type" ADD VALUE IF NOT EXISTS 'CONFIRMED_TEAM';
ALTER TYPE "pms_production_workbook_sheet_type" ADD VALUE IF NOT EXISTS 'LOCATIONS';
ALTER TYPE "pms_production_workbook_sheet_type" ADD VALUE IF NOT EXISTS 'ARTISTS_TALENT';
ALTER TYPE "pms_production_workbook_sheet_type" ADD VALUE IF NOT EXISTS 'CATERING';
ALTER TYPE "pms_production_workbook_sheet_type" ADD VALUE IF NOT EXISTS 'TASKS_CHASES';

ALTER TYPE "pms_production_workbook_row_status" ADD VALUE IF NOT EXISTS 'PARKED';
ALTER TYPE "pms_production_workbook_row_status" ADD VALUE IF NOT EXISTS 'NEEDS_CHASE';
