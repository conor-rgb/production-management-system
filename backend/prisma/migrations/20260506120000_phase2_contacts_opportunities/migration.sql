-- Phase 2: Contacts + Opportunities enhancements
-- Only touches pms_* tables; leaves legacy tables untouched.

-- New enum types
DO $$ BEGIN CREATE TYPE "ContactType" AS ENUM ('CLIENT', 'SUPPLIER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "ContactSource" AS ENUM ('REFERRAL', 'DIRECT', 'SOCIAL', 'PREVIOUS_JOB', 'OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "OppSource" AS ENUM ('EMAIL', 'WHATSAPP', 'DM', 'REFERRAL', 'OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN CREATE TYPE "LostReason" AS ENUM ('COMPETITOR_WON', 'BUDGET_PULLED', 'NO_RESPONSE', 'TIMING', 'OTHER'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- PmsJobType: separate from legacy "JobType" which has different values
DO $$ BEGIN CREATE TYPE "PmsJobType" AS ENUM ('STILLS', 'MOTION', 'EVENTS'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;
-- Stage: separate from legacy "OpportunityStage" which has different values
DO $$ BEGIN CREATE TYPE "Stage" AS ENUM ('ENQUIRY', 'BIDDING', 'QUOTED', 'WON', 'LOST'); EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- Enhance pms_contacts
ALTER TABLE "pms_contacts"
  ADD COLUMN IF NOT EXISTS "type"            "ContactType"   NOT NULL DEFAULT 'CLIENT',
  ADD COLUMN IF NOT EXISTS "source"          "ContactSource" NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS "tags"            TEXT[]          NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS "lastContactedAt" TIMESTAMP(3);

-- Rebuild pms_opportunities with new columns
-- First drop the old status column (was OpportunityStatus enum), add new stage column
ALTER TABLE "pms_opportunities"
  DROP COLUMN IF EXISTS "status",
  ADD COLUMN IF NOT EXISTS "stage"        "Stage"      NOT NULL DEFAULT 'ENQUIRY',
  ADD COLUMN IF NOT EXISTS "brand"        TEXT,
  ADD COLUMN IF NOT EXISTS "jobType"      "PmsJobType",
  ADD COLUMN IF NOT EXISTS "source"       "OppSource"  NOT NULL DEFAULT 'OTHER',
  ADD COLUMN IF NOT EXISTS "dateReceived" DATE,
  ADD COLUMN IF NOT EXISTS "followUpDate" DATE,
  ADD COLUMN IF NOT EXISTS "lostReason"   "LostReason",
  ADD COLUMN IF NOT EXISTS "lostNote"     TEXT,
  ADD COLUMN IF NOT EXISTS "notes"        TEXT;

-- Add new columns to pms_productions
ALTER TABLE "pms_productions"
  ADD COLUMN IF NOT EXISTS "clientName" TEXT,
  ADD COLUMN IF NOT EXISTS "brand"      TEXT,
  ADD COLUMN IF NOT EXISTS "jobType"    "PmsJobType",
  ADD COLUMN IF NOT EXISTS "jobCode"    TEXT,
  ADD COLUMN IF NOT EXISTS "value"      DECIMAL(12,2),
  ADD COLUMN IF NOT EXISTS "contactId"  TEXT;

DO $$ BEGIN
  ALTER TABLE "pms_productions" ADD CONSTRAINT "pms_productions_jobCode_key" UNIQUE ("jobCode");
EXCEPTION WHEN duplicate_table THEN NULL;
END $$;

-- Add opportunityId to email threads
ALTER TABLE "pms_email_threads"
  ADD COLUMN IF NOT EXISTS "opportunityId" TEXT;

-- New tables for opportunity comms timeline
CREATE TABLE IF NOT EXISTS "pms_opportunity_notes" (
  "id"            TEXT        NOT NULL,
  "opportunityId" TEXT        NOT NULL,
  "body"          TEXT        NOT NULL,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pms_opportunity_notes_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "pms_opportunity_tasks" (
  "id"            TEXT        NOT NULL,
  "opportunityId" TEXT        NOT NULL,
  "body"          TEXT        NOT NULL,
  "completed"     BOOLEAN     NOT NULL DEFAULT false,
  "completedAt"   TIMESTAMP(3),
  "dueDate"       DATE,
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pms_opportunity_tasks_pkey" PRIMARY KEY ("id")
);

-- Foreign keys for new tables
DO $$ BEGIN
  ALTER TABLE "pms_opportunity_notes" ADD CONSTRAINT "pms_opportunity_notes_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "pms_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  ALTER TABLE "pms_opportunity_tasks" ADD CONSTRAINT "pms_opportunity_tasks_opportunityId_fkey"
    FOREIGN KEY ("opportunityId") REFERENCES "pms_opportunities"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
