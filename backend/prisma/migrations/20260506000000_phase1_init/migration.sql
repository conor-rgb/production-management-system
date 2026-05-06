-- Phase 1 Foundation: Create all PMS tables (pms_ prefix to avoid conflicts with legacy tables)

DO $$ BEGIN
  CREATE TYPE "OpportunityStatus" AS ENUM ('ENQUIRY', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE "ProductionStatus" AS ENUM ('PLANNING', 'CONFIRMED', 'IN_PRODUCTION', 'WRAP', 'DELIVERED', 'INVOICED', 'CLOSED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS "pms_settings" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pms_settings_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pms_settings_email_key" ON "pms_settings"("email");

CREATE TABLE IF NOT EXISTS "pms_companies" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "website" TEXT,
    "address" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pms_companies_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pms_contacts" (
    "id" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "companyId" TEXT,
    "jobTitle" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pms_contacts_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pms_opportunities" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'ENQUIRY',
    "value" DECIMAL(12,2),
    "clientName" TEXT,
    "contactId" TEXT,
    "companyId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pms_opportunities_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pms_productions" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProductionStatus" NOT NULL DEFAULT 'PLANNING',
    "opportunityId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pms_productions_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pms_production_dates" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "label" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pms_production_dates_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pms_crew_roles" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pms_crew_roles_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pms_crew_roles_name_key" ON "pms_crew_roles"("name");

CREATE TABLE IF NOT EXISTS "pms_crew_members" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "contactId" TEXT,
    "roleId" TEXT,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "dayRate" DECIMAL(10,2),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pms_crew_members_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pms_budgets" (
    "id" TEXT NOT NULL,
    "productionId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pms_budgets_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pms_budget_sections" (
    "id" TEXT NOT NULL,
    "budgetId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pms_budget_sections_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pms_budget_line_items" (
    "id" TEXT NOT NULL,
    "sectionId" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "quantity" DECIMAL(10,3) NOT NULL DEFAULT 1,
    "unitCost" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "notes" TEXT,
    "order" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pms_budget_line_items_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pms_line_item_invoices" (
    "id" TEXT NOT NULL,
    "lineItemId" TEXT NOT NULL,
    "invoiceNumber" TEXT,
    "amount" DECIMAL(12,2) NOT NULL,
    "invoiceDate" DATE,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pms_line_item_invoices_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pms_job_files" (
    "id" TEXT NOT NULL,
    "productionId" TEXT,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "mimeType" TEXT,
    "size" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pms_job_files_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pms_email_threads" (
    "id" TEXT NOT NULL,
    "productionId" TEXT,
    "subject" TEXT NOT NULL,
    "gmailThreadId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pms_email_threads_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pms_email_threads_gmailThreadId_key" ON "pms_email_threads"("gmailThreadId");

CREATE TABLE IF NOT EXISTS "pms_email_messages" (
    "id" TEXT NOT NULL,
    "threadId" TEXT NOT NULL,
    "gmailMessageId" TEXT,
    "from" TEXT NOT NULL,
    "to" TEXT,
    "subject" TEXT,
    "body" TEXT,
    "htmlBody" TEXT,
    "sentAt" TIMESTAMP(3),
    "contactId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "pms_email_messages_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "pms_email_messages_gmailMessageId_key" ON "pms_email_messages"("gmailMessageId");

-- Foreign keys (using DO blocks to skip if already exist)
DO $$ BEGIN
  ALTER TABLE "pms_contacts" ADD CONSTRAINT "pms_contacts_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "pms_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pms_opportunities" ADD CONSTRAINT "pms_opportunities_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "pms_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pms_opportunities" ADD CONSTRAINT "pms_opportunities_companyId_fkey"
    FOREIGN KEY ("companyId") REFERENCES "pms_companies"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pms_productions" ADD CONSTRAINT "pms_productions_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "pms_opportunities"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pms_production_dates" ADD CONSTRAINT "pms_production_dates_productionId_fkey"
    FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pms_crew_members" ADD CONSTRAINT "pms_crew_members_productionId_fkey"
    FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pms_crew_members" ADD CONSTRAINT "pms_crew_members_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "pms_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pms_crew_members" ADD CONSTRAINT "pms_crew_members_roleId_fkey"
    FOREIGN KEY ("roleId") REFERENCES "pms_crew_roles"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pms_budgets" ADD CONSTRAINT "pms_budgets_productionId_fkey"
    FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pms_budget_sections" ADD CONSTRAINT "pms_budget_sections_budgetId_fkey"
    FOREIGN KEY ("budgetId") REFERENCES "pms_budgets"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pms_budget_line_items" ADD CONSTRAINT "pms_budget_line_items_sectionId_fkey"
    FOREIGN KEY ("sectionId") REFERENCES "pms_budget_sections"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pms_line_item_invoices" ADD CONSTRAINT "pms_line_item_invoices_lineItemId_fkey"
    FOREIGN KEY ("lineItemId") REFERENCES "pms_budget_line_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pms_job_files" ADD CONSTRAINT "pms_job_files_productionId_fkey"
    FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pms_email_threads" ADD CONSTRAINT "pms_email_threads_productionId_fkey"
    FOREIGN KEY ("productionId") REFERENCES "pms_productions"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pms_email_messages" ADD CONSTRAINT "pms_email_messages_threadId_fkey"
    FOREIGN KEY ("threadId") REFERENCES "pms_email_threads"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pms_email_messages" ADD CONSTRAINT "pms_email_messages_contactId_fkey"
    FOREIGN KEY ("contactId") REFERENCES "pms_contacts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
