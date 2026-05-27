-- CreateTable
CREATE TABLE "pms_option_deck_templates" (
    "id" TEXT NOT NULL,
    "groupId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Options deck',
    "blocks" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_option_deck_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pms_option_deck_templates_groupId_key" ON "pms_option_deck_templates"("groupId");

-- AddForeignKey
ALTER TABLE "pms_option_deck_templates" ADD CONSTRAINT "pms_option_deck_templates_groupId_fkey" FOREIGN KEY ("groupId") REFERENCES "pms_option_groups"("id") ON DELETE CASCADE ON UPDATE CASCADE;
