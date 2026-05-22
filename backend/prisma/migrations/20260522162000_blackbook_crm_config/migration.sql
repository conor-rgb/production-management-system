-- AlterTable
ALTER TABLE "pms_blackbook_entries" ADD COLUMN     "categoryConfigId" TEXT,
ADD COLUMN     "contactId" TEXT,
ADD COLUMN     "typeIds" TEXT[] DEFAULT ARRAY[]::TEXT[];

-- CreateTable
CREATE TABLE "pms_blackbook_config_categories" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "broadType" "pms_blackbook_category" NOT NULL DEFAULT 'OTHER',
    "color" TEXT NOT NULL DEFAULT '#1a1a1f',
    "order" INTEGER NOT NULL DEFAULT 0,
    "coreFields" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_blackbook_config_categories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_blackbook_config_types" (
    "id" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_blackbook_config_types_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pms_blackbook_config_categories_slug_key" ON "pms_blackbook_config_categories"("slug");

-- CreateIndex
CREATE UNIQUE INDEX "pms_blackbook_config_types_categoryId_slug_key" ON "pms_blackbook_config_types"("categoryId", "slug");

-- CreateIndex
CREATE INDEX "pms_blackbook_entries_categoryConfigId_idx" ON "pms_blackbook_entries"("categoryConfigId");

-- CreateIndex
CREATE INDEX "pms_blackbook_entries_contactId_idx" ON "pms_blackbook_entries"("contactId");

-- AddForeignKey
ALTER TABLE "pms_blackbook_config_types" ADD CONSTRAINT "pms_blackbook_config_types_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "pms_blackbook_config_categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_blackbook_entries" ADD CONSTRAINT "pms_blackbook_entries_contactId_fkey" FOREIGN KEY ("contactId") REFERENCES "pms_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_blackbook_entries" ADD CONSTRAINT "pms_blackbook_entries_categoryConfigId_fkey" FOREIGN KEY ("categoryConfigId") REFERENCES "pms_blackbook_config_categories"("id") ON DELETE SET NULL ON UPDATE CASCADE;

