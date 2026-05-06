-- CreateEnum
CREATE TYPE "EmailProvider" AS ENUM ('GOOGLE', 'IMAP');

-- DropForeignKey
ALTER TABLE "pms_email_messages" DROP CONSTRAINT "pms_email_messages_contactId_fkey";

-- DropForeignKey
ALTER TABLE "pms_email_threads" DROP CONSTRAINT "pms_email_threads_productionId_fkey";

-- DropIndex
DROP INDEX "pms_email_messages_gmailMessageId_key";

-- DropIndex
DROP INDEX "pms_email_threads_gmailThreadId_key";

-- AlterTable
ALTER TABLE "pms_budget_line_items" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pms_budgets" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pms_companies" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pms_contacts" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pms_crew_members" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pms_crew_roles" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pms_email_messages" DROP COLUMN "body",
DROP COLUMN "contactId",
DROP COLUMN "from",
DROP COLUMN "gmailMessageId",
DROP COLUMN "htmlBody",
DROP COLUMN "to",
ADD COLUMN     "attachments" JSONB NOT NULL DEFAULT '[]',
ADD COLUMN     "bccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "bodyHtml" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "bodyText" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "ccAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "externalMessageId" TEXT NOT NULL,
ADD COLUMN     "fromAddress" TEXT NOT NULL,
ADD COLUMN     "fromName" TEXT,
ADD COLUMN     "hasAttachments" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isFromMe" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "toAddresses" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL,
ALTER COLUMN "subject" SET NOT NULL,
ALTER COLUMN "sentAt" SET NOT NULL;

-- AlterTable
ALTER TABLE "pms_email_threads" DROP COLUMN "gmailThreadId",
DROP COLUMN "opportunityId",
DROP COLUMN "productionId",
ADD COLUMN     "accountId" TEXT,
ADD COLUMN     "externalThreadId" TEXT NOT NULL,
ADD COLUMN     "isArchived" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isFlagged" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isRead" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "lastMessageAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "linkedContactId" TEXT,
ADD COLUMN     "linkedOpportunityId" TEXT,
ADD COLUMN     "linkedProductionId" TEXT,
ADD COLUMN     "participants" TEXT[] DEFAULT ARRAY[]::TEXT[],
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pms_opportunities" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pms_opportunity_notes" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pms_opportunity_tasks" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pms_production_dates" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pms_productions" ALTER COLUMN "updatedAt" DROP DEFAULT;

-- AlterTable
ALTER TABLE "pms_settings" ADD COLUMN     "defaultEmailSignature" TEXT NOT NULL DEFAULT '',
ALTER COLUMN "updatedAt" DROP DEFAULT;

-- DropEnum
DROP TYPE "OpportunityStatus";

-- CreateTable
CREATE TABLE "pms_email_accounts" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "emailAddress" TEXT NOT NULL,
    "provider" "EmailProvider" NOT NULL,
    "imapHost" TEXT,
    "imapPort" INTEGER,
    "smtpHost" TEXT,
    "smtpPort" INTEGER,
    "username" TEXT,
    "encryptedPassword" TEXT,
    "encryptedAccessToken" TEXT,
    "encryptedRefreshToken" TEXT,
    "tokenExpiry" TIMESTAMP(3),
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "isPrimary" BOOLEAN NOT NULL DEFAULT false,
    "lastSyncedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_email_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pms_email_templates" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "defaultCc" TEXT,
    "defaultBcc" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pms_email_templates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "pms_email_messages_externalMessageId_key" ON "pms_email_messages"("externalMessageId");

-- CreateIndex
CREATE INDEX "pms_email_threads_lastMessageAt_idx" ON "pms_email_threads"("lastMessageAt");

-- CreateIndex
CREATE INDEX "pms_email_threads_linkedContactId_idx" ON "pms_email_threads"("linkedContactId");

-- CreateIndex
CREATE INDEX "pms_email_threads_linkedOpportunityId_idx" ON "pms_email_threads"("linkedOpportunityId");

-- CreateIndex
CREATE INDEX "pms_email_threads_linkedProductionId_idx" ON "pms_email_threads"("linkedProductionId");

-- CreateIndex
CREATE UNIQUE INDEX "pms_email_threads_accountId_externalThreadId_key" ON "pms_email_threads"("accountId", "externalThreadId");

-- AddForeignKey
ALTER TABLE "pms_email_threads" ADD CONSTRAINT "pms_email_threads_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "pms_email_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_email_threads" ADD CONSTRAINT "pms_email_threads_linkedContactId_fkey" FOREIGN KEY ("linkedContactId") REFERENCES "pms_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_email_threads" ADD CONSTRAINT "pms_email_threads_linkedOpportunityId_fkey" FOREIGN KEY ("linkedOpportunityId") REFERENCES "pms_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pms_email_threads" ADD CONSTRAINT "pms_email_threads_linkedProductionId_fkey" FOREIGN KEY ("linkedProductionId") REFERENCES "pms_productions"("id") ON DELETE SET NULL ON UPDATE CASCADE;

