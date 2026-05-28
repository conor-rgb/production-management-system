CREATE TYPE "pms_option_column_type" AS ENUM (
  'SINGLE_LINE_TEXT',
  'LONG_TEXT',
  'NUMBER',
  'CURRENCY',
  'PERCENT',
  'CHECKBOX',
  'SINGLE_SELECT',
  'MULTI_SELECT',
  'DATE',
  'URL',
  'EMAIL',
  'PHONE',
  'ATTACHMENT',
  'BLACKBOOK_LINK'
);

CREATE TABLE "pms_option_columns" (
  "id" TEXT NOT NULL,
  "groupId" TEXT NOT NULL,
  "key" TEXT NOT NULL,
  "label" TEXT NOT NULL,
  "type" "pms_option_column_type" NOT NULL DEFAULT 'SINGLE_LINE_TEXT',
  "width" INTEGER NOT NULL DEFAULT 160,
  "order" INTEGER NOT NULL DEFAULT 0,
  "hidden" BOOLEAN NOT NULL DEFAULT false,
  "locked" BOOLEAN NOT NULL DEFAULT false,
  "config" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pms_option_columns_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "pms_option_column_values" (
  "id" TEXT NOT NULL,
  "candidateId" TEXT NOT NULL,
  "columnId" TEXT NOT NULL,
  "value" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMP(3) NOT NULL,

  CONSTRAINT "pms_option_column_values_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "pms_option_columns_groupId_key_key" ON "pms_option_columns"("groupId", "key");
CREATE INDEX "pms_option_columns_groupId_order_idx" ON "pms_option_columns"("groupId", "order");
CREATE UNIQUE INDEX "pms_option_column_values_candidateId_columnId_key" ON "pms_option_column_values"("candidateId", "columnId");
CREATE INDEX "pms_option_column_values_columnId_idx" ON "pms_option_column_values"("columnId");

ALTER TABLE "pms_option_columns"
  ADD CONSTRAINT "pms_option_columns_groupId_fkey"
  FOREIGN KEY ("groupId") REFERENCES "pms_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pms_option_column_values"
  ADD CONSTRAINT "pms_option_column_values_candidateId_fkey"
  FOREIGN KEY ("candidateId") REFERENCES "pms_option_candidates"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "pms_option_column_values"
  ADD CONSTRAINT "pms_option_column_values_columnId_fkey"
  FOREIGN KEY ("columnId") REFERENCES "pms_option_columns"("id") ON DELETE CASCADE ON UPDATE CASCADE;
