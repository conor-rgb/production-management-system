-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('ADMIN_PRODUCER', 'PRODUCER', 'COORDINATOR', 'ACCOUNTANT', 'CLIENT');

-- CreateEnum
CREATE TYPE "UserType" AS ENUM ('INTERNAL_STAFF', 'CLIENT_PORTAL', 'SUPPLIER_PORTAL', 'TALENT_PORTAL');

-- CreateEnum
CREATE TYPE "ProjectType" AS ENUM ('EVENT', 'STILLS', 'MOTION', 'HYBRID');

-- CreateEnum
CREATE TYPE "ProjectStatus" AS ENUM ('INQUIRY', 'CONFIRMED', 'IN_PRODUCTION', 'DELIVERED', 'INVOICED', 'CLOSED', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "ClientType" AS ENUM ('DIRECT_BRAND', 'AGENCY', 'CORPORATE');

-- CreateEnum
CREATE TYPE "SupplierCategory" AS ENUM ('VENUE', 'CATERING', 'EQUIPMENT_RENTAL', 'TRANSPORT', 'POST_PRODUCTION', 'TALENT_AGENCY', 'CREW_AGENCY', 'PRINTING', 'PROPS', 'WARDROBE', 'OTHER');

-- CreateEnum
CREATE TYPE "TaxStatus" AS ENUM ('PAYE', 'SELF_EMPLOYED', 'LTD_COMPANY');

-- CreateEnum
CREATE TYPE "TalentType" AS ENUM ('MODEL', 'ACTOR', 'PRESENTER', 'INFLUENCER', 'HAND_MODEL', 'DANCER', 'VOICE_ARTIST', 'EXTRA');

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "password_hash" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "phone" TEXT,
    "role" "UserRole" NOT NULL,
    "user_type" "UserType" NOT NULL DEFAULT 'INTERNAL_STAFF',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "password_reset_token" TEXT,
    "password_reset_expires" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "clients" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "client_type" "ClientType" NOT NULL,
    "primary_contact_name" TEXT NOT NULL,
    "primary_contact_email" TEXT NOT NULL,
    "primary_contact_phone" TEXT,
    "freeagent_contact_id" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "clients_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "company_name" TEXT NOT NULL,
    "category" "SupplierCategory" NOT NULL,
    "freeagent_contact_id" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "projects" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "type" "ProjectType" NOT NULL,
    "status" "ProjectStatus" NOT NULL DEFAULT 'INQUIRY',
    "client_id" TEXT NOT NULL,
    "owner_id" TEXT NOT NULL,
    "archived_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "projects_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "project_assignments" (
    "id" TEXT NOT NULL,
    "project_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "role_on_project" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "project_assignments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "crew_members" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "mobile" TEXT,
    "primary_role" TEXT NOT NULL,
    "experience_level" TEXT,
    "tax_status" "TaxStatus",
    "day_rate" DECIMAL(10,2),
    "half_day_rate" DECIMAL(10,2),
    "overtime_rate" DECIMAL(10,2),
    "kit_fee" DECIMAL(10,2),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "crew_members_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "talent_profiles" (
    "id" TEXT NOT NULL,
    "full_name" TEXT NOT NULL,
    "stage_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "talent_type" "TalentType" NOT NULL,
    "experience_level" TEXT,
    "day_rate" DECIMAL(10,2),
    "half_day_rate" DECIMAL(10,2),
    "hourly_rate" DECIMAL(10,2),
    "notes" TEXT,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "talent_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "revoked_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "freeagent_credentials" (
    "id" TEXT NOT NULL DEFAULT 'default',
    "access_token" TEXT NOT NULL,
    "refresh_token" TEXT NOT NULL,
    "expires_at" TIMESTAMP(3) NOT NULL,
    "account_id" TEXT,
    "oauth_state" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freeagent_credentials_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "clients_freeagent_contact_id_key" ON "clients"("freeagent_contact_id");

-- CreateIndex
CREATE INDEX "clients_primary_contact_email_idx" ON "clients"("primary_contact_email");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_freeagent_contact_id_key" ON "suppliers"("freeagent_contact_id");

-- CreateIndex
CREATE INDEX "suppliers_category_idx" ON "suppliers"("category");

-- CreateIndex
CREATE UNIQUE INDEX "projects_code_key" ON "projects"("code");

-- CreateIndex
CREATE INDEX "projects_client_id_idx" ON "projects"("client_id");

-- CreateIndex
CREATE INDEX "projects_status_idx" ON "projects"("status");

-- CreateIndex
CREATE INDEX "projects_owner_id_idx" ON "projects"("owner_id");

-- CreateIndex
CREATE INDEX "project_assignments_project_id_idx" ON "project_assignments"("project_id");

-- CreateIndex
CREATE INDEX "project_assignments_user_id_idx" ON "project_assignments"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "project_assignments_project_id_user_id_key" ON "project_assignments"("project_id", "user_id");

-- CreateIndex
CREATE UNIQUE INDEX "crew_members_email_key" ON "crew_members"("email");

-- CreateIndex
CREATE INDEX "crew_members_email_idx" ON "crew_members"("email");

-- CreateIndex
CREATE INDEX "crew_members_primary_role_idx" ON "crew_members"("primary_role");

-- CreateIndex
CREATE INDEX "talent_profiles_talent_type_idx" ON "talent_profiles"("talent_type");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_expires_at_idx" ON "refresh_tokens"("expires_at");

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_client_id_fkey" FOREIGN KEY ("client_id") REFERENCES "clients"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "projects" ADD CONSTRAINT "projects_owner_id_fkey" FOREIGN KEY ("owner_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_project_id_fkey" FOREIGN KEY ("project_id") REFERENCES "projects"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "project_assignments" ADD CONSTRAINT "project_assignments_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
