CREATE TYPE "pms_production_workbook_sheet_type" AS ENUM (
  'DASHBOARD',
  'TODO',
  'TIMELINE',
  'RUN_OF_SHOW',
  'CREW',
  'HOLDS',
  'TRAVEL',
  'HOTELS',
  'CARS',
  'EQUIPMENT',
  'DELIVERIES',
  'FILES_COMMS'
);

CREATE TYPE "pms_production_workbook_row_status" AS ENUM (
  'TODO',
  'IN_PROGRESS',
  'WAITING',
  'BLOCKED',
  'DONE',
  'CANCELLED',
  'REQUESTED',
  'FIRST_OPTION',
  'SECOND_OPTION',
  'CONFIRMED',
  'RELEASED',
  'SENT',
  'READY',
  'INTERNAL'
);

CREATE TABLE "pms_production_workbooks" (
  "id" TEXT NOT NULL,
  "productionId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "metadata" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pms_production_workbooks_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pms_production_sheets" (
  "id" TEXT NOT NULL,
  "workbookId" TEXT NOT NULL,
  "type" "pms_production_workbook_sheet_type" NOT NULL,
  "title" TEXT NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "config" JSONB NOT NULL DEFAULT '{}',
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pms_production_sheets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pms_production_sheet_rows" (
  "id" TEXT NOT NULL,
  "workbookId" TEXT NOT NULL,
  "sheetId" TEXT NOT NULL,
  "sheetType" "pms_production_workbook_sheet_type" NOT NULL,
  "order" INTEGER NOT NULL DEFAULT 0,
  "status" "pms_production_workbook_row_status",
  "title" TEXT,
  "date" DATE,
  "startAt" TIMESTAMP(3),
  "endAt" TIMESTAMP(3),
  "workstream" TEXT,
  "owner" TEXT,
  "location" TEXT,
  "notes" TEXT,
  "data" JSONB NOT NULL DEFAULT '{}',
  "sourceEntityType" TEXT,
  "sourceEntityId" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pms_production_sheet_rows_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pms_production_sheet_cells" (
  "id" TEXT NOT NULL,
  "workbookId" TEXT NOT NULL,
  "sheetId" TEXT NOT NULL,
  "rowId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "value" JSONB,
  "updatedBy" TEXT,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pms_production_sheet_cells_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pms_production_workbooks_productionId_key" ON "pms_production_workbooks"("productionId");

CREATE UNIQUE INDEX "pms_production_sheets_workbookId_type_key" ON "pms_production_sheets"("workbookId", "type");
CREATE INDEX "pms_production_sheets_workbookId_order_idx" ON "pms_production_sheets"("workbookId", "order");

CREATE UNIQUE INDEX "pms_production_sheet_rows_workbookId_sheetType_sourceEntityType_sourceEntityId_key"
  ON "pms_production_sheet_rows"("workbookId", "sheetType", "sourceEntityType", "sourceEntityId");
CREATE INDEX "pms_production_sheet_rows_workbookId_sheetType_order_idx"
  ON "pms_production_sheet_rows"("workbookId", "sheetType", "order");
CREATE INDEX "pms_production_sheet_rows_sheetId_order_idx" ON "pms_production_sheet_rows"("sheetId", "order");
CREATE INDEX "pms_production_sheet_rows_sourceEntityType_sourceEntityId_idx"
  ON "pms_production_sheet_rows"("sourceEntityType", "sourceEntityId");

CREATE UNIQUE INDEX "pms_production_sheet_cells_rowId_key_key" ON "pms_production_sheet_cells"("rowId", "key");
CREATE INDEX "pms_production_sheet_cells_workbookId_idx" ON "pms_production_sheet_cells"("workbookId");
CREATE INDEX "pms_production_sheet_cells_sheetId_idx" ON "pms_production_sheet_cells"("sheetId");

ALTER TABLE "pms_production_workbooks"
  ADD CONSTRAINT "pms_production_workbooks_productionId_fkey"
  FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pms_production_sheets"
  ADD CONSTRAINT "pms_production_sheets_workbookId_fkey"
  FOREIGN KEY ("workbookId") REFERENCES "pms_production_workbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pms_production_sheet_rows"
  ADD CONSTRAINT "pms_production_sheet_rows_workbookId_fkey"
  FOREIGN KEY ("workbookId") REFERENCES "pms_production_workbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pms_production_sheet_rows"
  ADD CONSTRAINT "pms_production_sheet_rows_sheetId_fkey"
  FOREIGN KEY ("sheetId") REFERENCES "pms_production_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pms_production_sheet_cells"
  ADD CONSTRAINT "pms_production_sheet_cells_workbookId_fkey"
  FOREIGN KEY ("workbookId") REFERENCES "pms_production_workbooks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pms_production_sheet_cells"
  ADD CONSTRAINT "pms_production_sheet_cells_sheetId_fkey"
  FOREIGN KEY ("sheetId") REFERENCES "pms_production_sheets"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pms_production_sheet_cells"
  ADD CONSTRAINT "pms_production_sheet_cells_rowId_fkey"
  FOREIGN KEY ("rowId") REFERENCES "pms_production_sheet_rows"("id") ON DELETE CASCADE ON UPDATE CASCADE;
