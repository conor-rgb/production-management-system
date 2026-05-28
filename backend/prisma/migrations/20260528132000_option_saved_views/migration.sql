CREATE TABLE "pms_option_saved_views" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "icon" TEXT NOT NULL DEFAULT '▦',
    "baseView" TEXT NOT NULL DEFAULT 'grid',
    "filters" JSONB,
    "sortKey" TEXT NOT NULL DEFAULT 'manual',
    "sortDirection" TEXT NOT NULL DEFAULT 'asc',
    "columnState" JSONB,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_option_saved_views_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "pms_option_saved_views_groupId_order_idx" ON "pms_option_saved_views"("groupId", "order");

ALTER TABLE "pms_option_saved_views" ADD CONSTRAINT "pms_option_saved_views_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "pms_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
