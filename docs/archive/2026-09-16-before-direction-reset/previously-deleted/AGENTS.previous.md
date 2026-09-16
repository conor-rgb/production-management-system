# Production Management System - Complete Project Context

## Table of Contents
1. [Executive Overview](#executive-overview)
2. [Core Principles](#core-principles)
3. [Technology Stack](#technology-stack)
4. [System Architecture](#system-architecture)
5. [Database Schema](#database-schema)
6. [API Structure](#api-structure)
7. [Authentication & Authorization](#authentication--authorization)
8. [Core Features](#core-features)
9. [Integration Specifications](#integration-specifications)
10. [User Interface Guidelines](#user-interface-guidelines)
11. [Development Phases](#development-phases)

---

## Executive Overview

### Project Vision
A comprehensive, zero-friction production management platform for unlimited.bond—a full-service production agency handling stills, motion, and events. The system manages the complete lifecycle from initial client brief through final delivery and invoicing.

### Key Objectives
- **Eliminate fragmentation**: Single source of truth replacing Google Sheets and disparate tools
- **Zero-friction workflows**: ADHD-friendly design with minimal cognitive load
- **Production-grade reliability**: Built for real-world time-sensitive production environments
- **Client transparency**: Real-time portal visibility with producer control
- **Financial accuracy**: Deep FreeAgent integration for seamless accounting

### User Personas
1. **Admin Producer** (Conor): Full system access, manages all projects, team oversight
2. **Producer**: Manages assigned projects, client communication, approvals, invoicing
3. **Coordinator**: Handles logistics, tasks, day-to-day operations, limited financial view
4. **Accountant**: Financial oversight across all projects, FreeAgent sync, payments
5. **Client**: Portal access to their projects, approvals, status visibility

---

## Core Principles

### Design Philosophy
1. **Zero-Friction Workflows**
   - Minimal clicks to accomplish tasks
   - Smart defaults everywhere
   - Predictive assistance (AI where helpful)
   - Clear visual hierarchies
   - No unnecessary navigation depth

2. **ADHD-Friendly Design**
   - Information presented progressively (not all at once)
   - Clear status indicators with color coding
   - Persistent context (don't make user remember things)
   - Minimal distractions
   - Focus on one task at a time

3. **Production-Grade Reliability**
   - System handles critical time-sensitive work
   - No data loss tolerance
   - Clear error messages with recovery paths
   - Offline capability for shoot days (mobile)
   - Fast performance (no waiting)

4. **Single Source of Truth**
   - FreeAgent is the source of truth for accounting/tax
   - Production system is the source of truth for operations
   - Bidirectional sync maintains consistency
   - Conflicts resolved automatically with clear rules

5. **Role-Appropriate Access**
   - Users see exactly what they need, nothing more
   - Permissions enforce business rules
   - Project-level access control
   - Client portal is read-only + approvals

---

## Technology Stack

### Backend
```
Runtime: Node.js v20+ LTS
Language: TypeScript 5.0+
Framework: Express.js 4.18+
ORM: Prisma 5.0+
Database: PostgreSQL 15+
Authentication: JWT (jsonwebtoken)
Password Hashing: bcrypt
Validation: Zod
Email: SendGrid API
File Storage: AWS S3 (or compatible like DigitalOcean Spaces)
PDF Generation: Puppeteer (headless Chrome)
Queue: Bull (Redis-backed) for background jobs
Testing: Jest + Supertest
```

### Frontend
```
Build Tool: Vite 5.0+
Framework: React 18+ with TypeScript
State: Zustand (lightweight, simple)
Routing: React Router v6
Styling: Tailwind CSS 3.0+
Components: shadcn/ui (Radix UI primitives)
Forms: React Hook Form + Zod
HTTP Client: Axios
Real-time: Socket.io-client (WebSockets)
Calendar: FullCalendar or React Big Calendar
Date Handling: date-fns
File Upload: React Dropzone
Icons: Lucide React
```

### Infrastructure
```
Hosting: VPS (DigitalOcean, Linode, or similar)
Reverse Proxy: Nginx
SSL: Let's Encrypt (Certbot)
Process Manager: PM2
Database Backups: Automated daily with rotation
Monitoring: Simple uptime monitoring initially
Logging: Winston (structured JSON logs)
CI/CD: GitHub Actions (optional for Phase 1)
```

### External APIs & Services
```
FreeAgent API: OAuth2 + REST API
Gmail API: OAuth2 for email automation
Google Maps API: Geocoding, Maps, Places, Routes
OCR: Google Cloud Vision (for receipt scanning)
AI/LLM: OpenAI GPT-4 or Anthropic Claude API (for scheduling agent)
```

---

## System Architecture

### High-Level Architecture
```
┌─────────────────────────────────────────────────────────────┐
│                      Client Browser                          │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  React Frontend (SPA)                                │   │
│  │  - Producer/Coordinator/Accountant Interface         │   │
│  │  - Client Portal Interface                           │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                         HTTPS
                            │
┌─────────────────────────────────────────────────────────────┐
│                      Nginx (Reverse Proxy)                   │
│  - SSL Termination                                          │
│  - Static File Serving                                      │
│  - Rate Limiting                                            │
└─────────────────────────────────────────────────────────────┘
                            │
                            │
┌─────────────────────────────────────────────────────────────┐
│                  Express.js API Server                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Routes Layer                                        │   │
│  │  - Authentication                                    │   │
│  │  - Authorization Middleware                          │   │
│  │  - Input Validation (Zod)                           │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Controllers Layer                                   │   │
│  │  - Business Logic Orchestration                      │   │
│  │  - Request/Response Handling                         │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Services Layer                                      │   │
│  │  - Core Business Logic                               │   │
│  │  - Data Transformation                               │   │
│  │  - External API Calls                                │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │  Database Layer (Prisma ORM)                         │   │
│  │  - Query Building                                    │   │
│  │  - Migrations                                        │   │
│  │  - Type Safety                                       │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                            │
                ┌───────────┴───────────┐
                │                       │
    ┌───────────────────┐    ┌──────────────────┐
    │   PostgreSQL      │    │   Redis          │
    │   - Primary Data  │    │   - Queue Jobs   │
    │   - Transactions  │    │   - Sessions     │
    └───────────────────┘    └──────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                  External Services                           │
│  - FreeAgent API (Accounting)                               │
│  - Gmail API (Email automation)                             │
│  - Google Maps API (Location services)                      │
│  - AWS S3 (File storage)                                    │
│  - OpenAI/Claude API (AI scheduling agent)                  │
└─────────────────────────────────────────────────────────────┘
```

### Directory Structure
```
production-management-system/
├── backend/
│   ├── src/
│   │   ├── config/
│   │   │   ├── database.ts          # Prisma client initialization
│   │   │   ├── redis.ts             # Redis client configuration
│   │   │   ├── s3.ts                # S3 client configuration
│   │   │   └── constants.ts         # App-wide constants
│   │   ├── controllers/
│   │   │   ├── authController.ts
│   │   │   ├── usersController.ts
│   │   │   ├── projectsController.ts
│   │   │   ├── clientsController.ts
│   │   │   ├── suppliersController.ts
│   │   │   ├── crewController.ts
│   │   │   ├── talentController.ts
│   │   │   ├── estimatesController.ts
│   │   │   ├── invoicesController.ts
│   │   │   ├── expensesController.ts
│   │   │   ├── optionsController.ts
│   │   │   ├── tasksController.ts
│   │   │   ├── calendarController.ts
│   │   │   ├── filesController.ts
│   │   │   ├── travelController.ts
│   │   │   ├── portalController.ts
│   │   │   ├── pdfExportController.ts
│   │   │   └── freeagentController.ts
│   │   ├── services/
│   │   │   ├── authService.ts
│   │   │   ├── userService.ts
│   │   │   ├── projectService.ts
│   │   │   ├── emailService.ts
│   │   │   ├── gmailService.ts
│   │   │   ├── freeagentService.ts
│   │   │   ├── pdfService.ts
│   │   │   ├── optionsService.ts
│   │   │   ├── aiSchedulingService.ts
│   │   │   ├── mapsService.ts
│   │   │   └── fileStorageService.ts
│   │   ├── middleware/
│   │   │   ├── authMiddleware.ts    # JWT verification
│   │   │   ├── rbacMiddleware.ts    # Role-based access control
│   │   │   ├── validationMiddleware.ts
│   │   │   ├── errorHandler.ts
│   │   │   ├── rateLimiter.ts
│   │   │   └── logger.ts
│   │   ├── routes/
│   │   │   ├── index.ts             # Route aggregator
│   │   │   ├── authRoutes.ts
│   │   │   ├── userRoutes.ts
│   │   │   ├── projectRoutes.ts
│   │   │   ├── clientRoutes.ts
│   │   │   ├── supplierRoutes.ts
│   │   │   ├── crewRoutes.ts
│   │   │   ├── talentRoutes.ts
│   │   │   ├── estimateRoutes.ts
│   │   │   ├── invoiceRoutes.ts
│   │   │   ├── expenseRoutes.ts
│   │   │   ├── optionRoutes.ts
│   │   │   ├── taskRoutes.ts
│   │   │   ├── calendarRoutes.ts
│   │   │   ├── fileRoutes.ts
│   │   │   ├── travelRoutes.ts
│   │   │   ├── portalRoutes.ts
│   │   │   ├── pdfRoutes.ts
│   │   │   └── freeagentRoutes.ts
│   │   ├── utils/
│   │   │   ├── jwt.ts               # JWT utilities
│   │   │   ├── encryption.ts        # bcrypt utilities
│   │   │   ├── validators.ts        # Zod schemas
│   │   │   ├── emailTemplates.ts    # Email HTML templates
│   │   │   ├── pdfTemplates.ts      # PDF HTML templates
│   │   │   ├── dateHelpers.ts
│   │   │   ├── stringHelpers.ts
│   │   │   └── permissions.ts       # Permission checking utilities
│   │   ├── types/
│   │   │   ├── express.d.ts         # Express type extensions
│   │   │   ├── api.types.ts         # API request/response types
│   │   │   └── database.types.ts    # Database-specific types
│   │   ├── jobs/                    # Background jobs
│   │   │   ├── emailQueue.ts
│   │   │   ├── freeagentSyncQueue.ts
│   │   │   ├── pdfGenerationQueue.ts
│   │   │   └── reminderQueue.ts
│   │   ├── server.ts                # Express app setup
│   │   └── index.ts                 # Entry point
│   ├── prisma/
│   │   ├── schema.prisma            # Database schema
│   │   ├── migrations/              # Migration history
│   │   └── seed.ts                  # Seed data
│   ├── tests/
│   │   ├── unit/
│   │   ├── integration/
│   │   └── setup.ts
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   ├── tsconfig.json
│   └── jest.config.js
│
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── ui/                  # shadcn/ui components
│   │   │   │   ├── button.tsx
│   │   │   │   ├── input.tsx
│   │   │   │   ├── dialog.tsx
│   │   │   │   ├── table.tsx
│   │   │   │   ├── form.tsx
│   │   │   │   ├── select.tsx
│   │   │   │   ├── calendar.tsx
│   │   │   │   ├── toast.tsx
│   │   │   │   └── ...
│   │   │   ├── layout/
│   │   │   │   ├── Layout.tsx       # Main layout wrapper
│   │   │   │   ├── Sidebar.tsx
│   │   │   │   ├── Topbar.tsx
│   │   │   │   └── PortalLayout.tsx
│   │   │   ├── auth/
│   │   │   │   ├── LoginForm.tsx
│   │   │   │   ├── ResetPassword.tsx
│   │   │   │   └── ProtectedRoute.tsx
│   │   │   ├── projects/
│   │   │   │   ├── ProjectsList.tsx
│   │   │   │   ├── ProjectCard.tsx
│   │   │   │   ├── ProjectDetail.tsx
│   │   │   │   ├── CreateProjectDialog.tsx
│   │   │   │   └── ProjectTimeline.tsx
│   │   │   ├── clients/
│   │   │   │   ├── ClientsList.tsx
│   │   │   │   ├── ClientDialog.tsx
│   │   │   │   └── ClientDetail.tsx
│   │   │   ├── crew/
│   │   │   │   ├── CrewList.tsx
│   │   │   │   ├── CrewDialog.tsx
│   │   │   │   └── CrewDetail.tsx
│   │   │   ├── talent/
│   │   │   │   ├── TalentList.tsx
│   │   │   │   ├── TalentDialog.tsx
│   │   │   │   ├── TalentCard.tsx
│   │   │   │   └── TalentPortfolio.tsx
│   │   │   ├── options/
│   │   │   │   ├── OptionsManager.tsx
│   │   │   │   ├── OptionEmailDialog.tsx
│   │   │   │   ├── OptionTracker.tsx
│   │   │   │   └── TalentOptionsPresenter.tsx
│   │   │   ├── estimates/
│   │   │   │   ├── EstimateBuilder.tsx
│   │   │   │   ├── LineItemsEditor.tsx
│   │   │   │   └── EstimatePreview.tsx
│   │   │   ├── invoices/
│   │   │   │   ├── InvoicesList.tsx
│   │   │   │   ├── InvoiceGenerator.tsx
│   │   │   │   └── PaymentTracker.tsx
│   │   │   ├── calendar/
│   │   │   │   ├── CalendarView.tsx
│   │   │   │   ├── EventDialog.tsx
│   │   │   │   └── AISchedulingChat.tsx
│   │   │   ├── portal/
│   │   │   │   ├── ClientDashboard.tsx
│   │   │   │   ├── ProjectOverview.tsx
│   │   │   │   ├── TalentOptionsView.tsx
│   │   │   │   ├── BudgetView.tsx
│   │   │   │   └── DeliverablesView.tsx
│   │   │   └── shared/
│   │   │       ├── LoadingSpinner.tsx
│   │   │       ├── ErrorBoundary.tsx
│   │   │       ├── StatusBadge.tsx
│   │   │       ├── DataTable.tsx
│   │   │       └── FileUploader.tsx
│   │   ├── hooks/
│   │   │   ├── useAuth.ts
│   │   │   ├── useProjects.ts
│   │   │   ├── useClients.ts
│   │   │   ├── useOptions.ts
│   │   │   ├── useWebSocket.ts
│   │   │   └── usePermissions.ts
│   │   ├── contexts/
│   │   │   ├── AuthContext.tsx
│   │   │   ├── WebSocketContext.tsx
│   │   │   └── ThemeContext.tsx
│   │   ├── stores/
│   │   │   ├── authStore.ts
│   │   │   ├── projectStore.ts
│   │   │   └── notificationStore.ts
│   │   ├── lib/
│   │   │   ├── api.ts               # Axios instance & interceptors
│   │   │   ├── queryClient.ts       # React Query setup
│   │   │   ├── socket.ts            # Socket.io client
│   │   │   └── utils.ts             # Helper functions
│   │   ├── pages/
│   │   │   ├── Login.tsx
│   │   │   ├── Dashboard.tsx
│   │   │   ├── Projects.tsx
│   │   │   ├── ProjectDetail.tsx
│   │   │   ├── Clients.tsx
│   │   │   ├── Crew.tsx
│   │   │   ├── Talent.tsx
│   │   │   ├── Calendar.tsx
│   │   │   ├── Settings.tsx
│   │   │   └── portal/
│   │   │       ├── PortalDashboard.tsx
│   │   │       └── PortalProject.tsx
│   │   ├── types/
│   │   │   ├── api.types.ts
│   │   │   ├── models.types.ts
│   │   │   └── ui.types.ts
│   │   ├── App.tsx
│   │   ├── main.tsx
│   │   └── router.tsx
│   ├── public/
│   ├── index.html
│   ├── .env.example
│   ├── .gitignore
│   ├── package.json
│   ├── tsconfig.json
│   ├── tailwind.config.js
│   ├── postcss.config.js
│   └── vite.config.ts
│
├── docs/
│   ├── API.md                       # API documentation
│   ├── DEPLOYMENT.md                # Deployment guide
│   ├── DATABASE.md                  # Database schema docs
│   └── DEVELOPMENT.md               # Development setup
│
├── .gitignore
├── README.md
└── docker-compose.yml               # Optional: for local dev
```

---

## Database Schema

### Core Principles
- Use UUIDs for primary keys (security, distributed systems)
- Soft deletes where appropriate (archived_at timestamp)
- Timestamps: created_at, updated_at on all tables
- Foreign keys with appropriate cascade rules
- Indexes on frequently queried fields
- Enums for fixed value sets (stored as strings in Prisma)

### Prisma Schema
```prisma
// prisma/schema.prisma

generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

// ============================================================================
// USER MANAGEMENT & AUTHENTICATION
// ============================================================================

enum UserRole {
  ADMIN_PRODUCER
  PRODUCER
  COORDINATOR
  ACCOUNTANT
  CLIENT
}

enum UserType {
  INTERNAL_STAFF
  CLIENT_PORTAL
  SUPPLIER_PORTAL
  TALENT_PORTAL
}

model User {
  id                String    @id @default(uuid())
  email             String    @unique
  passwordHash      String    @map("password_hash")
  fullName          String    @map("full_name")
  phone             String?
  role              UserRole
  userType          UserType  @default(INTERNAL_STAFF) @map("user_type")
  department        String?   // production, finance, creative
  employmentStatus  String?   @map("employment_status") // full-time, freelance, contractor
  startDate         DateTime? @map("start_date")
  active            Boolean   @default(true)
  profilePhoto      String?   @map("profile_photo")
  bio               String?
  twoFactorEnabled  Boolean   @default(false) @map("two_factor_enabled")
  twoFactorMethod   String?   @map("two_factor_method") // email, sms
  lastLoginAt       DateTime? @map("last_login_at")
  passwordResetToken String?  @map("password_reset_token")
  passwordResetExpires DateTime? @map("password_reset_expires")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  // Relationships
  projectsOwned         Project[]           @relation("ProjectOwner")
  projectAssignments    ProjectAssignment[]
  tasksCreated          Task[]              @relation("TaskCreator")
  tasksAssigned         Task[]              @relation("TaskAssignee")
  clientAccounts        Client[]            @relation("ClientPortalUser")
  
  @@map("users")
}

// ============================================================================
// PROJECTS
// ============================================================================

enum ProjectType {
  EVENT
  STILLS
  MOTION
  HYBRID
}

enum ProjectStatus {
  INQUIRY
  CONFIRMED
  IN_PRODUCTION
  DELIVERED
  INVOICED
  CLOSED
  ARCHIVED
}

model Project {
  id                  String        @id @default(uuid())
  code                String        @unique // PRJ-2025-001
  name                String
  description         String?       @db.Text
  type                ProjectType
  status              ProjectStatus @default(INQUIRY)
  clientId            String        @map("client_id")
  briefReceived       DateTime?     @map("brief_received")
  shootDates          Json?         @map("shoot_dates") // Array of date ranges
  deliveryDeadline    DateTime?     @map("delivery_deadline")
  budgetTotal         Decimal?      @map("budget_total") @db.Decimal(10, 2)
  actualCosts         Decimal?      @map("actual_costs") @db.Decimal(10, 2)
  ownerId             String        @map("owner_id")
  portalEnabled       Boolean       @default(false) @map("portal_enabled")
  archivedAt          DateTime?     @map("archived_at")
  createdAt           DateTime      @default(now()) @map("created_at")
  updatedAt           DateTime      @updatedAt @map("updated_at")

  // Relationships
  client              Client        @relation(fields: [clientId], references: [id])
  owner               User          @relation("ProjectOwner", fields: [ownerId], references: [id])
  assignments         ProjectAssignment[]
  briefs              Brief[]
  estimates           Estimate[]
  contracts           Contract[]
  budgetLines         BudgetLine[]
  expenses            Expense[]
  invoices            Invoice[]
  crewBookings        CrewBooking[]
  talentBookings      TalentBooking[]
  options             Option[]
  tasks               Task[]
  calendarEvents      CalendarEvent[]
  shotLists           ShotList[]
  travelItineraries   TravelItinerary[]
  files               File[]
  deliverables        Deliverable[]

  @@index([clientId])
  @@index([status])
  @@index([ownerId])
  @@map("projects")
}

model ProjectAssignment {
  id              String   @id @default(uuid())
  projectId       String   @map("project_id")
  userId          String   @map("user_id")
  roleOnProject   String   @map("role_on_project") // Producer, Coordinator, etc.
  startDate       DateTime? @map("start_date")
  endDate         DateTime? @map("end_date")
  permissions     Json?    // Project-specific permission overrides
  createdAt       DateTime @default(now()) @map("created_at")

  // Relationships
  project         Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  user            User     @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@unique([projectId, userId])
  @@index([projectId])
  @@index([userId])
  @@map("project_assignments")
}

model Brief {
  id                  String   @id @default(uuid())
  projectId           String   @map("project_id")
  version             Int      @default(1)
  content             String   @db.Text
  deliverables        Json?    // Structured deliverables specification
  creativeRequirements String? @db.Text @map("creative_requirements")
  technicalSpecs      Json?    @map("technical_specs")
  approvalStatus      String   @default("draft") @map("approval_status")
  approvedAt          DateTime? @map("approved_at")
  approvedBy          String?  @map("approved_by")
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  // Relationships
  project             Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@map("briefs")
}

// ============================================================================
// CLIENTS
// ============================================================================

enum ClientType {
  DIRECT_BRAND
  AGENCY
  CORPORATE
}

model Client {
  id                    String     @id @default(uuid())
  freeagentContactId    String?    @unique @map("freeagent_contact_id")
  companyName           String     @map("company_name")
  tradingName           String?    @map("trading_name")
  clientType            ClientType @map("client_type")
  primaryContactName    String     @map("primary_contact_name")
  primaryContactEmail   String     @map("primary_contact_email")
  primaryContactPhone   String?    @map("primary_contact_phone")
  billingEmail          String?    @map("billing_email")
  billingAddress        String?    @db.Text @map("billing_address")
  paymentTerms          String     @default("net30") @map("payment_terms") // net30, net60, net90
  defaultMarkup         Decimal?   @map("default_markup") @db.Decimal(5, 2)
  defaultAgencyFee      Decimal?   @map("default_agency_fee") @db.Decimal(5, 2)
  creditStatus          String?    @map("credit_status")
  creditLimit           Decimal?   @map("credit_limit") @db.Decimal(10, 2)
  communicationPreference String?  @map("communication_preference") // portal, email, both
  clientTier            String?    @map("client_tier") // A, B, C
  notes                 String?    @db.Text
  portalEnabled         Boolean    @default(false) @map("portal_enabled")
  logo                  String?
  brandAssets           Json?      @map("brand_assets")
  active                Boolean    @default(true)
  createdAt             DateTime   @default(now()) @map("created_at")
  updatedAt             DateTime   @updatedAt @map("updated_at")

  // Relationships
  projects              Project[]
  invoices              Invoice[]
  portalUsers           User[]     @relation("ClientPortalUser")

  @@index([freeagentContactId])
  @@index([primaryContactEmail])
  @@map("clients")
}

// ============================================================================
// SUPPLIERS
// ============================================================================

enum SupplierCategory {
  VENUE
  CATERING
  EQUIPMENT_RENTAL
  TRANSPORT
  POST_PRODUCTION
  TALENT_AGENCY
  CREW_AGENCY
  PRINTING
  PROPS
  WARDROBE
  OTHER
}

model Supplier {
  id                  String           @id @default(uuid())
  freeagentContactId  String?          @unique @map("freeagent_contact_id")
  companyName         String           @map("company_name")
  category            SupplierCategory
  contactName         String?          @map("contact_name")
  email               String?
  phone               String?
  address             String?          @db.Text
  paymentTerms        String?          @map("payment_terms")
  taxStatus           String?          @map("tax_status") // VAT registered, self-employed
  vatNumber           String?          @map("vat_number")
  bankDetails         Json?            @map("bank_details") // Encrypted
  insuranceExpiry     DateTime?        @map("insurance_expiry")
  notes               String?          @db.Text
  reliabilityRating   Int?             @map("reliability_rating") @db.SmallInt // 1-5
  qualityRating       Int?             @map("quality_rating") @db.SmallInt
  priceRating         Int?             @map("price_rating") @db.SmallInt
  wouldUseAgain       Boolean?         @map("would_use_again")
  active              Boolean          @default(true)
  createdAt           DateTime         @default(now()) @map("created_at")
  updatedAt           DateTime         @updatedAt @map("updated_at")

  // Relationships
  expenses            Expense[]
  contracts           Contract[]

  @@index([category])
  @@index([freeagentContactId])
  @@map("suppliers")
}

// ============================================================================
// CREW MEMBERS
// ============================================================================

enum TaxStatus {
  PAYE
  SELF_EMPLOYED
  LTD_COMPANY
}

model CrewMember {
  id                    String    @id @default(uuid())
  fullName              String    @map("full_name")
  preferredName         String?   @map("preferred_name")
  email                 String    @unique
  mobile                String?
  landline              String?
  homeAddress           String?   @db.Text @map("home_address")
  emergencyContactName  String?   @map("emergency_contact_name")
  emergencyContactPhone String?   @map("emergency_contact_phone")
  dateOfBirth           DateTime? @map("date_of_birth") @db.Date
  photo                 String?
  
  // Professional
  primaryRole           String    @map("primary_role")
  secondarySkills       String[]  @map("secondary_skills")
  experienceLevel       String    @map("experience_level") // Junior, Mid, Senior, Lead
  specializations       String[]
  languages             String[]
  bio                   String?   @db.Text
  portfolioLink         String?   @map("portfolio_link")
  
  // Financial
  dayRate               Decimal?  @map("day_rate") @db.Decimal(10, 2)
  halfDayRate           Decimal?  @map("half_day_rate") @db.Decimal(10, 2)
  overtimeRate          Decimal?  @map("overtime_rate") @db.Decimal(10, 2)
  kitFee                Decimal?  @map("kit_fee") @db.Decimal(10, 2)
  currency              String    @default("GBP")
  paymentTerms          String?   @map("payment_terms")
  taxStatus             TaxStatus @map("tax_status")
  companyRegNumber      String?   @map("company_reg_number")
  bankDetails           Json?     @map("bank_details") // Encrypted
  vatNumber             String?   @map("vat_number")
  
  // Documents & Compliance
  publicLiabilityInsurance String? @map("public_liability_insurance")
  insuranceExpiry       DateTime? @map("insurance_expiry")
  rightToWork           Json?     @map("right_to_work")
  dbsCheck              Json?     @map("dbs_check")
  certifications        Json?
  passportCopy          String?   @map("passport_copy")
  
  // Equipment
  equipmentList         Json?     @map("equipment_list")
  equipmentInsurance    Json?     @map("equipment_insurance")
  
  // Logistics
  dietaryRequirements   String?   @map("dietary_requirements")
  accessibilityNeeds    String?   @map("accessibility_needs")
  hasVehicle            Boolean   @default(false) @map("has_vehicle")
  vehicleDetails        Json?     @map("vehicle_details")
  parkingRequirements   String?   @map("parking_requirements")
  
  // Performance
  rating                Decimal?  @db.Decimal(3, 2) // 0.00 to 5.00
  projectsCompleted     Int       @default(0) @map("projects_completed")
  responseRate          Decimal?  @map("response_rate") @db.Decimal(5, 2) // Percentage
  avgResponseTime       Int?      @map("avg_response_time") // Minutes
  availabilitySuccessRate Decimal? @map("availability_success_rate") @db.Decimal(5, 2)
  notes                 String?   @db.Text
  wouldHireAgain        Boolean?  @map("would_hire_again")
  
  active                Boolean   @default(true)
  createdAt             DateTime  @default(now()) @map("created_at")
  updatedAt             DateTime  @updatedAt @map("updated_at")

  // Relationships
  bookings              CrewBooking[]
  options               Option[]

  @@index([email])
  @@index([primaryRole])
  @@map("crew_members")
}

model CrewBooking {
  id                String    @id @default(uuid())
  projectId         String    @map("project_id")
  crewMemberId      String    @map("crew_member_id")
  roleOnProject     String    @map("role_on_project")
  bookingDates      Json      @map("booking_dates") // Array of date ranges
  callTimes         Json?     @map("call_times")
  rate              Decimal   @db.Decimal(10, 2)
  kitFee            Decimal?  @map("kit_fee") @db.Decimal(10, 2)
  status            String    @default("inquiry") // inquiry, option_held, confirmed, completed, invoiced, paid
  optionSentAt      DateTime? @map("option_sent_at")
  responseAt        DateTime? @map("response_at")
  confirmedAt       DateTime? @map("confirmed_at")
  contractRef       String?   @map("contract_ref")
  paymentSchedule   Json?     @map("payment_schedule")
  paymentStatus     String?   @map("payment_status")
  daysWorked        Int?      @map("days_worked")
  overtimeHours     Decimal?  @map("overtime_hours") @db.Decimal(5, 2)
  performanceNotes  String?   @db.Text @map("performance_notes")
  wouldWorkAgain    Boolean?  @map("would_work_again")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  // Relationships
  project           Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  crewMember        CrewMember   @relation(fields: [crewMemberId], references: [id])

  @@index([projectId])
  @@index([crewMemberId])
  @@index([status])
  @@map("crew_bookings")
}

// ============================================================================
// TALENT PROFILES
// ============================================================================

enum TalentType {
  MODEL
  ACTOR
  PRESENTER
  INFLUENCER
  HAND_MODEL
  DANCER
  VOICE_ARTIST
  EXTRA
}

model TalentProfile {
  id                    String      @id @default(uuid())
  fullName              String      @map("full_name")
  stageName             String?     @map("stage_name")
  dateOfBirth           DateTime?   @map("date_of_birth") @db.Date
  ageRange              String?     @map("age_range")
  genderIdentity        String?     @map("gender_identity")
  pronouns              String?
  ethnicity             String?
  location              String?
  languages             String[]
  email                 String?
  phone                 String?
  socialMedia           Json?       @map("social_media") // Instagram, TikTok, etc.
  socialFollowing       Json?       @map("social_following") // Follower counts
  
  // Physical Specifications
  height                String?
  clothingSizes         Json?       @map("clothing_sizes") // UK, EU, US sizes
  shoeSize              String?     @map("shoe_size")
  hairColor             String?     @map("hair_color")
  hairLength            String?     @map("hair_length")
  eyeColor              String?     @map("eye_color")
  distinguishingFeatures String?    @db.Text @map("distinguishing_features")
  buildType             String?     @map("build_type")
  
  // Professional
  talentType            TalentType  @map("talent_type")
  experienceLevel       String      @map("experience_level")
  specialSkills         String[]    @map("special_skills")
  agencyName            String?     @map("agency_name")
  agencyContact         String?     @map("agency_contact")
  agentName             String?     @map("agent_name")
  agentEmail            String?     @map("agent_email")
  agentPhone            String?     @map("agent_phone")
  unionMembership       String?     @map("union_membership")
  
  // Portfolio
  compCardFront         String?     @map("comp_card_front")
  compCardBack          String?     @map("comp_card_back")
  portfolioImages       String[]    @map("portfolio_images")
  videoShowreel         String?     @map("video_showreel")
  previousCampaigns     Json?       @map("previous_campaigns")
  
  // Rates & Terms
  dayRate               Decimal?    @map("day_rate") @db.Decimal(10, 2)
  halfDayRate           Decimal?    @map("half_day_rate") @db.Decimal(10, 2)
  hourlyRate            Decimal?    @map("hourly_rate") @db.Decimal(10, 2)
  usageRightsBaseFee    Decimal?    @map("usage_rights_base_fee") @db.Decimal(10, 2)
  buyoutTerms           Json?       @map("buyout_terms")
  exclusivityFees       Json?       @map("exclusivity_fees")
  socialMediaPostingFee Decimal?    @map("social_media_posting_fee") @db.Decimal(10, 2)
  agencyCommission      Decimal?    @map("agency_commission") @db.Decimal(5, 2)
  
  // Restrictions
  existingExclusivity   Json?       @map("existing_exclusivity")
  categoryRestrictions  String[]    @map("category_restrictions")
  
  // Documents
  modelRelease          String?     @map("model_release")
  workPermits           Json?       @map("work_permits")
  parentalConsent       String?     @map("parental_consent") // If minor
  rightToWork           Json?       @map("right_to_work")
  
  // Performance
  rating                Decimal?    @db.Decimal(3, 2)
  projectsCompleted     Int         @default(0) @map("projects_completed")
  responseRate          Decimal?    @map("response_rate") @db.Decimal(5, 2)
  avgResponseTime       Int?        @map("avg_response_time")
  reliabilityScore      Decimal?    @map("reliability_score") @db.Decimal(3, 2)
  notes                 String?     @db.Text
  
  active                Boolean     @default(true)
  createdAt             DateTime    @default(now()) @map("created_at")
  updatedAt             DateTime    @updatedAt @map("updated_at")

  // Relationships
  bookings              TalentBooking[]
  options               Option[]

  @@index([talentType])
  @@index([agencyName])
  @@map("talent_profiles")
}

model TalentBooking {
  id                String    @id @default(uuid())
  projectId         String    @map("project_id")
  talentId          String    @map("talent_id")
  roleOnProject     String    @map("role_on_project")
  bookingDates      Json      @map("booking_dates")
  callTimes         Json?     @map("call_times")
  rate              Decimal   @db.Decimal(10, 2)
  usageTerms        Json?     @map("usage_terms")
  status            String    @default("inquiry")
  optionSentAt      DateTime? @map("option_sent_at")
  responseAt        DateTime? @map("response_at")
  confirmedAt       DateTime? @map("confirmed_at")
  contractRef       String?   @map("contract_ref")
  releaseStatus     String?   @map("release_status")
  paymentSchedule   Json?     @map("payment_schedule")
  paymentStatus     String?   @map("payment_status")
  performanceNotes  String?   @db.Text @map("performance_notes")
  wouldBookAgain    Boolean?  @map("would_book_again")
  createdAt         DateTime  @default(now()) @map("created_at")
  updatedAt         DateTime  @updatedAt @map("updated_at")

  // Relationships
  project           Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  talent            TalentProfile  @relation(fields: [talentId], references: [id])

  @@index([projectId])
  @@index([talentId])
  @@index([status])
  @@map("talent_bookings")
}

// ============================================================================
// OPTIONS SYSTEM
// ============================================================================

enum OptionType {
  CREW
  TALENT
  SUPPLIER
  VENUE
}

enum OptionStatus {
  DRAFT
  SENT
  OPENED
  REPLIED
  AVAILABLE
  DECLINED
  CONFIRMED
  RELEASED
}

model Option {
  id                  String       @id @default(uuid())
  projectId           String       @map("project_id")
  roleRequired        String       @map("role_required")
  optionType          OptionType   @map("option_type")
  
  // Polymorphic relationship - only one will be set
  crewMemberId        String?      @map("crew_member_id")
  talentId            String?      @map("talent_id")
  supplierId          String?      @map("supplier_id")
  locationId          String?      @map("location_id")
  
  briefSummary        String?      @db.Text @map("brief_summary")
  datesRequired       Json         @map("dates_required")
  rateIndication      Decimal?     @map("rate_indication") @db.Decimal(10, 2)
  showRate            Boolean      @default(true) @map("show_rate")
  priorityLevel       String       @map("priority_level") // first_choice, backup, third_option
  status              OptionStatus @default(DRAFT)
  
  // Email tracking
  sentAt              DateTime?    @map("sent_at")
  emailOpened         Boolean      @default(false) @map("email_opened")
  openedAt            DateTime?    @map("opened_at")
  responseAt          DateTime?    @map("response_at")
  responseMethod      String?      @map("response_method") // email, phone, sms
  availabilityResult  String?      @map("availability_result") // available, declined, maybe, no_response
  responseContent     String?      @db.Text @map("response_content")
  declineReason       String?      @db.Text @map("decline_reason")
  
  // Gmail integration
  gmailMessageId      String?      @map("gmail_message_id")
  gmailThreadId       String?      @map("gmail_thread_id")
  
  // Follow-up
  followUpScheduled   DateTime?    @map("follow_up_scheduled")
  followUpSent        Boolean      @default(false) @map("follow_up_sent")
  autoReleaseDate     DateTime?    @map("auto_release_date")
  releasedAt          DateTime?    @map("released_at")
  
  producerNotes       String?      @db.Text @map("producer_notes")
  clientVisible       Boolean      @default(false) @map("client_visible")
  
  createdAt           DateTime     @default(now()) @map("created_at")
  updatedAt           DateTime     @updatedAt @map("updated_at")

  // Relationships
  project             Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  crewMember          CrewMember?  @relation(fields: [crewMemberId], references: [id])
  talent              TalentProfile? @relation(fields: [talentId], references: [id])
  supplier            Supplier?    @relation(fields: [supplierId], references: [id])
  location            Location?    @relation(fields: [locationId], references: [id])

  @@index([projectId])
  @@index([status])
  @@index([crewMemberId])
  @@index([talentId])
  @@map("options")
}

// ============================================================================
// LOCATIONS & VENUES
// ============================================================================

enum LocationType {
  STUDIO
  OUTDOOR
  VENUE
  HOTEL
  RESTAURANT
  OFFICE
  AIRPORT
  LANDMARK
}

model Location {
  id                  String       @id @default(uuid())
  name                String
  type                LocationType
  address             String       @db.Text
  latitude            Decimal?     @db.Decimal(10, 8)
  longitude           Decimal?     @db.Decimal(11, 8)
  contactName         String?      @map("contact_name")
  contactEmail        String?      @map("contact_email")
  contactPhone        String?      @map("contact_phone")
  accessInstructions  String?      @db.Text @map("access_instructions")
  parkingInfo         String?      @db.Text @map("parking_info")
  facilities          Json?        // wifi, catering, toilets, etc.
  technicalSpecs      Json?        @map("technical_specs")
  capacity            Json?        // people, equipment
  costStructure       Json?        @map("cost_structure")
  supplierId          String?      @map("supplier_id")
  permitRequired      Boolean      @default(false) @map("permit_required")
  permitDetails       String?      @db.Text @map("permit_details")
  restrictions        String?      @db.Text
  photos              String[]
  floorPlans          String[]     @map("floor_plans")
  scoutNotes          String?      @db.Text @map("scout_notes")
  weatherConsiderations String?    @db.Text @map("weather_considerations")
  rating              Decimal?     @db.Decimal(3, 2)
  wouldUseAgain       Boolean?     @map("would_use_again")
  active              Boolean      @default(true)
  createdAt           DateTime     @default(now()) @map("created_at")
  updatedAt           DateTime     @updatedAt @map("updated_at")

  // Relationships
  supplier            Supplier?    @relation(fields: [supplierId], references: [id])
  options             Option[]
  calendarEvents      CalendarEvent[]

  @@index([type])
  @@index([supplierId])
  @@map("locations")
}

// ============================================================================
// FINANCIAL - ESTIMATES
// ============================================================================

enum EstimateStatus {
  DRAFT
  SENT
  CLIENT_REVIEW
  APPROVED
  REJECTED
  CONVERTED
}

model Estimate {
  id                  String         @id @default(uuid())
  projectId           String         @map("project_id")
  version             Int            @default(1)
  estimateDate        DateTime       @default(now()) @map("estimate_date")
  validUntil          DateTime?      @map("valid_until")
  status              EstimateStatus @default(DRAFT)
  freeagentEstimateId String?        @unique @map("freeagent_estimate_id")
  
  subtotal            Decimal        @db.Decimal(10, 2)
  agencyFees          Decimal        @default(0) @db.Decimal(10, 2) @map("agency_fees")
  vat                 Decimal        @default(0) @db.Decimal(10, 2)
  total               Decimal        @db.Decimal(10, 2)
  
  notes               String?        @db.Text
  termsConditions     String?        @db.Text @map("terms_conditions")
  paymentTerms        String?        @map("payment_terms")
  
  approvedAt          DateTime?      @map("approved_at")
  approvedBy          String?        @map("approved_by")
  approverName        String?        @map("approver_name")
  signedDocument      String?        @map("signed_document")
  convertedAt         DateTime?      @map("converted_at")
  
  createdAt           DateTime       @default(now()) @map("created_at")
  updatedAt           DateTime       @updatedAt @map("updated_at")

  // Relationships
  project             Project        @relation(fields: [projectId], references: [id], onDelete: Cascade)
  lineItems           EstimateLineItem[]
  budgetLines         BudgetLine[]

  @@index([projectId])
  @@index([status])
  @@map("estimates")
}

model EstimateLineItem {
  id                  String   @id @default(uuid())
  estimateId          String   @map("estimate_id")
  category            String   // Talent, Crew, Production, etc.
  subCategory         String?  @map("sub_category")
  description         String   @db.Text
  quantity            Decimal  @db.Decimal(10, 2)
  unit                String   // day, hour, item, person
  unitRate            Decimal  @db.Decimal(10, 2) @map("unit_rate")
  subtotal            Decimal  @db.Decimal(10, 2)
  clientFacingRate    Decimal  @db.Decimal(10, 2) @map("client_facing_rate")
  internalCost        Decimal? @db.Decimal(10, 2) @map("internal_cost")
  buffer              Decimal? @db.Decimal(10, 2)
  billableToClient    Boolean  @default(true) @map("billable_to_client")
  notes               String?  @db.Text
  sortOrder           Int      @default(0) @map("sort_order")
  
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  // Relationships
  estimate            Estimate @relation(fields: [estimateId], references: [id], onDelete: Cascade)

  @@index([estimateId])
  @@map("estimate_line_items")
}

// ============================================================================
// FINANCIAL - BUDGET TRACKING
// ============================================================================

model BudgetLine {
  id                  String   @id @default(uuid())
  projectId           String   @map("project_id")
  estimateId          String?  @map("estimate_id")
  estimateLineItemId  String?  @map("estimate_line_item_id")
  category            String
  description         String   @db.Text
  budgetedAmount      Decimal  @db.Decimal(10, 2) @map("budgeted_amount")
  committedAmount     Decimal  @default(0) @db.Decimal(10, 2) @map("committed_amount")
  actualAmount        Decimal  @default(0) @db.Decimal(10, 2) @map("actual_amount")
  variance            Decimal  @default(0) @db.Decimal(10, 2)
  variancePercent     Decimal  @default(0) @db.Decimal(5, 2) @map("variance_percent")
  overageApproved     Boolean  @default(false) @map("overage_approved")
  overageJustification String? @db.Text @map("overage_justification")
  locked              Boolean  @default(false)
  
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  // Relationships
  project             Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  estimate            Estimate? @relation(fields: [estimateId], references: [id])
  expenses            Expense[]

  @@index([projectId])
  @@index([estimateId])
  @@map("budget_lines")
}

// ============================================================================
// FINANCIAL - EXPENSES
// ============================================================================

enum ExpenseStatus {
  PENDING
  APPROVED
  PAID
  REJECTED
}

model Expense {
  id                  String        @id @default(uuid())
  projectId           String        @map("project_id")
  supplierId          String?       @map("supplier_id")
  budgetLineId        String?       @map("budget_line_id")
  category            String
  expenseDate         DateTime      @map("expense_date")
  description         String        @db.Text
  netAmount           Decimal       @db.Decimal(10, 2) @map("net_amount")
  vatAmount           Decimal       @default(0) @db.Decimal(10, 2) @map("vat_amount")
  grossAmount         Decimal       @db.Decimal(10, 2) @map("gross_amount")
  currency            String        @default("GBP")
  status              ExpenseStatus @default(PENDING)
  paymentMethod       String?       @map("payment_method")
  paymentReference    String?       @map("payment_reference")
  paymentDate         DateTime?     @map("payment_date")
  
  receiptDocument     String?       @map("receipt_document")
  freeagentBillId     String?       @unique @map("freeagent_bill_id")
  
  rebillableToClient  Boolean       @default(false) @map("rebillable_to_client")
  clientApprovalRequired Boolean    @default(false) @map("client_approval_required")
  clientApprovalStatus String?      @map("client_approval_status")
  markup              Decimal?      @db.Decimal(5, 2)
  clientCost          Decimal?      @db.Decimal(10, 2) @map("client_cost")
  
  reimbursement       Boolean       @default(false)
  reimbursedTo        String?       @map("reimbursed_to")
  reimbursedDate      DateTime?     @map("reimbursed_date")
  
  notes               String?       @db.Text
  createdBy           String        @map("created_by")
  approvedBy          String?       @map("approved_by")
  approvedAt          DateTime?     @map("approved_at")
  
  createdAt           DateTime      @default(now()) @map("created_at")
  updatedAt           DateTime      @updatedAt @map("updated_at")

  // Relationships
  project             Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  supplier            Supplier?     @relation(fields: [supplierId], references: [id])
  budgetLine          BudgetLine?   @relation(fields: [budgetLineId], references: [id])

  @@index([projectId])
  @@index([supplierId])
  @@index([status])
  @@index([budgetLineId])
  @@map("expenses")
}

// ============================================================================
// FINANCIAL - INVOICES
// ============================================================================

enum InvoiceType {
  ADVANCE
  PROGRESS
  COMPLETION
  REBILLABLE
  FINAL
}

enum InvoiceStatus {
  DRAFT
  SENT
  VIEWED
  APPROVED
  PAID
  OVERDUE
  CANCELLED
}

model Invoice {
  id                  String        @id @default(uuid())
  invoiceNumber       String        @unique @map("invoice_number")
  projectId           String        @map("project_id")
  clientId            String        @map("client_id")
  invoiceType         InvoiceType   @map("invoice_type")
  invoiceDate         DateTime      @map("invoice_date")
  dueDate             DateTime      @map("due_date")
  status              InvoiceStatus @default(DRAFT)
  freeagentInvoiceId  String?       @unique @map("freeagent_invoice_id")
  
  subtotal            Decimal       @db.Decimal(10, 2)
  agencyFees          Decimal       @default(0) @db.Decimal(10, 2) @map("agency_fees")
  vat                 Decimal       @default(0) @db.Decimal(10, 2)
  total               Decimal       @db.Decimal(10, 2)
  
  advancePercent      Decimal?      @db.Decimal(5, 2) @map("advance_percent")
  
  sentAt              DateTime?     @map("sent_at")
  viewedAt            DateTime?     @map("viewed_at")
  approvedAt          DateTime?     @map("approved_at")
  paidAt              DateTime?     @map("paid_at")
  
  pdfDocument         String?       @map("pdf_document")
  notes               String?       @db.Text
  
  portalVisible       Boolean       @default(true) @map("portal_visible")
  
  createdAt           DateTime      @default(now()) @map("created_at")
  updatedAt           DateTime      @updatedAt @map("updated_at")

  // Relationships
  project             Project       @relation(fields: [projectId], references: [id], onDelete: Cascade)
  client              Client        @relation(fields: [clientId], references: [id])
  lineItems           InvoiceLineItem[]
  payments            Payment[]
  reminders           InvoiceReminder[]

  @@index([projectId])
  @@index([clientId])
  @@index([status])
  @@index([dueDate])
  @@map("invoices")
}

model InvoiceLineItem {
  id                  String   @id @default(uuid())
  invoiceId           String   @map("invoice_id")
  description         String   @db.Text
  quantity            Decimal  @db.Decimal(10, 2)
  unitPrice           Decimal  @db.Decimal(10, 2) @map("unit_price")
  amount              Decimal  @db.Decimal(10, 2)
  isRebillable        Boolean  @default(false) @map("is_rebillable")
  sortOrder           Int      @default(0) @map("sort_order")

  // Relationships
  invoice             Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@index([invoiceId])
  @@map("invoice_line_items")
}

model Payment {
  id                  String   @id @default(uuid())
  invoiceId           String   @map("invoice_id")
  paymentDate         DateTime @map("payment_date")
  amount              Decimal  @db.Decimal(10, 2)
  paymentMethod       String   @map("payment_method")
  reference           String?
  bankTransactionId   String?  @map("bank_transaction_id")
  notes               String?  @db.Text
  
  createdAt           DateTime @default(now()) @map("created_at")

  // Relationships
  invoice             Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@index([invoiceId])
  @@map("payments")
}

model InvoiceReminder {
  id                  String   @id @default(uuid())
  invoiceId           String   @map("invoice_id")
  reminderType        String   @map("reminder_type") // friendly, due_tomorrow, overdue_3, overdue_7, final
  sentAt              DateTime @map("sent_at")
  emailSubject        String   @map("email_subject")
  emailBody           String   @db.Text @map("email_body")

  // Relationships
  invoice             Invoice  @relation(fields: [invoiceId], references: [id], onDelete: Cascade)

  @@index([invoiceId])
  @@map("invoice_reminders")
}

// ============================================================================
// CONTRACTS
// ============================================================================

enum ContractType {
  CLIENT_CONTRACT
  CREW_DEAL_MEMO
  TALENT_CONTRACT
  SUPPLIER_PO
  LOCATION_AGREEMENT
  TALENT_RELEASE
  NDA
}

model Contract {
  id                  String       @id @default(uuid())
  projectId           String       @map("project_id")
  contractType        ContractType @map("contract_type")
  supplierId          String?      @map("supplier_id")
  
  title               String
  scopeOfWork         String?      @db.Text @map("scope_of_work")
  deliverables        String?      @db.Text
  paymentSchedule     Json?        @map("payment_schedule")
  totalValue          Decimal?     @db.Decimal(10, 2) @map("total_value")
  cancellationTerms   String?      @db.Text @map("cancellation_terms")
  insuranceRequired   String?      @db.Text @map("insurance_required")
  liabilityClauses    String?      @db.Text @map("liability_clauses")
  usageRights         Json?        @map("usage_rights")
  exclusivityTerms    Json?        @map("exclusivity_terms")
  confidentiality     String?      @db.Text
  
  status              String       @default("draft") // draft, sent, signed, active, completed, terminated
  signedDate          DateTime?    @map("signed_date")
  signatory           String?
  documentPath        String?      @map("document_path")
  
  templateUsed        String?      @map("template_used")
  expiryDate          DateTime?    @map("expiry_date")
  renewalTerms        String?      @db.Text @map("renewal_terms")
  
  createdAt           DateTime     @default(now()) @map("created_at")
  updatedAt           DateTime     @updatedAt @map("updated_at")

  // Relationships
  project             Project      @relation(fields: [projectId], references: [id], onDelete: Cascade)
  supplier            Supplier?    @relation(fields: [supplierId], references: [id])

  @@index([projectId])
  @@index([contractType])
  @@map("contracts")
}

// ============================================================================
// PRODUCTION - TASKS
// ============================================================================

enum TaskCategory {
  PRE_PRODUCTION
  SHOOT_DAY_PREP
  SHOOT_DAY
  POST_PRODUCTION
  ADMIN
  TRAVEL
  LOGISTICS
  FINANCIAL
  CLIENT_COMMUNICATION
}

enum TaskStatus {
  NOT_STARTED
  IN_PROGRESS
  BLOCKED
  COMPLETED
  CANCELLED
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
  URGENT
}

model Task {
  id                  String       @id @default(uuid())
  projectId           String?      @map("project_id")
  title               String
  description         String?      @db.Text
  category            TaskCategory
  assignedToId        String       @map("assigned_to_id")
  createdById         String       @map("created_by_id")
  dueDate             DateTime?    @map("due_date")
  priority            TaskPriority @default(MEDIUM)
  status              TaskStatus   @default(NOT_STARTED)
  completedAt         DateTime?    @map("completed_at")
  timeEstimate        Int?         @map("time_estimate") // Minutes
  actualTime          Int?         @map("actual_time") // Minutes
  
  checklistItems      Json?        @map("checklist_items")
  notes               String?      @db.Text
  attachments         String[]
  
  calendarEventId     String?      @map("calendar_event_id")
  budgetLineId        String?      @map("budget_line_id")
  
  roleVisibility      String[]     @map("role_visibility")
  clientVisible       Boolean      @default(false) @map("client_visible")
  aiGenerated         Boolean      @default(false) @map("ai_generated")
  
  recurrence          Json?        // For repeating tasks
  
  createdAt           DateTime     @default(now()) @map("created_at")
  updatedAt           DateTime     @updatedAt @map("updated_at")

  // Relationships
  project             Project?     @relation(fields: [projectId], references: [id], onDelete: Cascade)
  assignedTo          User         @relation("TaskAssignee", fields: [assignedToId], references: [id])
  createdBy           User         @relation("TaskCreator", fields: [createdById], references: [id])
  dependencies        TaskDependency[] @relation("DependentTask")
  blockedBy           TaskDependency[] @relation("BlockingTask")

  @@index([projectId])
  @@index([assignedToId])
  @@index([status])
  @@index([dueDate])
  @@map("tasks")
}

model TaskDependency {
  id                  String   @id @default(uuid())
  taskId              String   @map("task_id")
  dependsOnTaskId     String   @map("depends_on_task_id")
  
  createdAt           DateTime @default(now()) @map("created_at")

  // Relationships
  task                Task     @relation("DependentTask", fields: [taskId], references: [id], onDelete: Cascade)
  dependsOnTask       Task     @relation("BlockingTask", fields: [dependsOnTaskId], references: [id], onDelete: Cascade)

  @@unique([taskId, dependsOnTaskId])
  @@map("task_dependencies")
}

// ============================================================================
// PRODUCTION - CALENDAR
// ============================================================================

enum CalendarEventType {
  MEETING
  SHOOT_DAY
  DEADLINE
  TRAVEL
  MILESTONE
  TASK_DUE
  CLIENT_APPROVAL
  DELIVERY
  PAYMENT
}

model CalendarEvent {
  id                  String            @id @default(uuid())
  projectId           String?           @map("project_id")
  eventType           CalendarEventType @map("event_type")
  title               String
  description         String?           @db.Text
  startDateTime       DateTime          @map("start_date_time")
  endDateTime         DateTime          @map("end_date_time")
  allDay              Boolean           @default(false) @map("all_day")
  
  locationId          String?           @map("location_id")
  locationDetails     String?           @db.Text @map("location_details")
  
  attendees           Json?             // Array of user IDs, external emails
  requiredAttendees   String[]          @map("required_attendees")
  optionalAttendees   String[]          @map("optional_attendees")
  
  relatedTasks        String[]          @map("related_tasks") // Task IDs
  travelRequired      Boolean           @default(false) @map("travel_required")
  equipmentRequired   Json?             @map("equipment_required")
  
  callTime            DateTime?         @map("call_time")
  wrapTime            DateTime?         @map("wrap_time")
  weatherBackup       String?           @db.Text @map("weather_backup")
  
  status              String            @default("scheduled") // scheduled, confirmed, in_progress, completed, cancelled
  cancellationReason  String?           @db.Text @map("cancellation_reason")
  rescheduledTo       String?           @map("rescheduled_to") // New event ID
  
  roleVisibility      String[]          @map("role_visibility")
  clientVisible       Boolean           @default(false) @map("client_visible")
  
  googleCalendarId    String?           @map("google_calendar_id")
  outlookCalendarId   String?           @map("outlook_calendar_id")
  
  reminderSettings    Json?             @map("reminder_settings")
  notes               String?           @db.Text
  
  createdAt           DateTime          @default(now()) @map("created_at")
  updatedAt           DateTime          @updatedAt @map("updated_at")

  // Relationships
  project             Project?          @relation(fields: [projectId], references: [id], onDelete: Cascade)
  location            Location?         @relation(fields: [locationId], references: [id])

  @@index([projectId])
  @@index([eventType])
  @@index([startDateTime])
  @@map("calendar_events")
}

// ============================================================================
// PRODUCTION - SHOT LISTS
// ============================================================================

model ShotList {
  id                  String   @id @default(uuid())
  projectId           String   @map("project_id")
  shotNumber          String   @map("shot_number")
  description         String   @db.Text
  shotType            String?  @map("shot_type")
  locationSetup       String?  @map("location_setup")
  lightingNotes       String?  @db.Text @map("lighting_notes")
  stylingNotes        String?  @db.Text @map("styling_notes")
  propsRequired       String?  @db.Text @map("props_required")
  talentInShot        String[] @map("talent_in_shot")
  estimatedTime       Int?     @map("estimated_time") // Minutes
  priority            String   @default("normal") // must_have, nice_to_have
  status              String   @default("not_started") // not_started, in_progress, completed, approved
  referenceImages     String[] @map("reference_images")
  photographerNotes   String?  @db.Text @map("photographer_notes")
  clientApprovalRequired Boolean @default(false) @map("client_approval_required")
  clientApproved      Boolean? @map("client_approved")
  completed           Boolean  @default(false)
  finalFileRef        String?  @map("final_file_ref")
  sortOrder           Int      @default(0) @map("sort_order")
  
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  // Relationships
  project             Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@map("shot_lists")
}

// ============================================================================
// TRAVEL & LOGISTICS
// ============================================================================

enum TravelSegmentType {
  FLIGHT
  TRAIN
  CAR
  TAXI
  ACCOMMODATION
  FERRY
  WALKING
}

model TravelItinerary {
  id                  String   @id @default(uuid())
  projectId           String   @map("project_id")
  personId            String   @map("person_id") // User ID, crew ID, or talent ID
  personType          String   @map("person_type") // user, crew, talent
  travelPurpose       String   @map("travel_purpose")
  status              String   @default("draft") // draft, confirmed, in_progress, completed
  totalCost           Decimal? @db.Decimal(10, 2) @map("total_cost")
  clientRebillable    Boolean  @default(false) @map("client_rebillable")
  shareableLink       String?  @map("shareable_link")
  
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  // Relationships
  project             Project  @relation(fields: [projectId], references: [id], onDelete: Cascade)
  segments            TravelSegment[]

  @@index([projectId])
  @@map("travel_itineraries")
}

model TravelSegment {
  id                    String            @id @default(uuid())
  itineraryId           String            @map("itinerary_id")
  segmentNumber         Int               @map("segment_number")
  segmentType           TravelSegmentType @map("segment_type")
  
  departureLocation     String            @map("departure_location")
  departureAddress      String?           @db.Text @map("departure_address")
  departureLatitude     Decimal?          @db.Decimal(10, 8) @map("departure_latitude")
  departureLongitude    Decimal?          @db.Decimal(11, 8) @map("departure_longitude")
  departureDateTime     DateTime          @map("departure_date_time")
  
  arrivalLocation       String            @map("arrival_location")
  arrivalAddress        String?           @db.Text @map("arrival_address")
  arrivalLatitude       Decimal?          @db.Decimal(10, 8) @map("arrival_latitude")
  arrivalLongitude      Decimal?          @db.Decimal(11, 8) @map("arrival_longitude")
  arrivalDateTime       DateTime          @map("arrival_date_time")
  
  duration              Int?              // Minutes
  distance              Decimal?          @db.Decimal(10, 2) // Miles or KM
  
  transportProvider     String?           @map("transport_provider")
  bookingReference      String?           @map("booking_reference")
  confirmationDocs      String?           @map("confirmation_docs")
  cost                  Decimal?          @db.Decimal(10, 2)
  budgetLineId          String?           @map("budget_line_id")
  bookingStatus         String            @default("requested") @map("booking_status")
  
  seatRoomNumber        String?           @map("seat_room_number")
  specialRequirements   String?           @db.Text @map("special_requirements")
  contactInfo           Json?             @map("contact_info")
  notes                 String?           @db.Text
  
  createdAt             DateTime          @default(now()) @map("created_at")
  updatedAt             DateTime          @updatedAt @map("updated_at")

  // Relationships
  itinerary             TravelItinerary   @relation(fields: [itineraryId], references: [id], onDelete: Cascade)

  @@index([itineraryId])
  @@map("travel_segments")
}

// ============================================================================
// FILES & DOCUMENTS
// ============================================================================

enum FileCategory {
  BRIEF
  CONTRACT
  INVOICE
  RECEIPT
  REFERENCE
  DELIVERABLE
  CALL_SHEET
  PERMIT
  INSURANCE
  RELEASE
  TRAVEL_DOC
  TECHNICAL_SPEC
  COMP_CARD
  PORTFOLIO
  OTHER
}

model File {
  id                  String       @id @default(uuid())
  projectId           String?      @map("project_id")
  category            FileCategory
  fileName            String       @map("file_name")
  originalFileName    String       @map("original_file_name")
  fileType            String       @map("file_type")
  fileSize            Int          @map("file_size") // Bytes
  storagePath         String       @map("storage_path")
  uploadedById        String       @map("uploaded_by_id")
  uploadDate          DateTime     @default(now()) @map("upload_date")
  version             Int          @default(1)
  replacesFileId      String?      @map("replaces_file_id")
  description         String?      @db.Text
  
  relatedEntityType   String?      @map("related_entity_type") // invoice, contract, expense, etc.
  relatedEntityId     String?      @map("related_entity_id")
  
  accessPermissions   String[]     @map("access_permissions") // Role names
  clientVisible       Boolean      @default(false) @map("client_visible")
  clientDownloads     Int          @default(0) @map("client_downloads")
  
  expiryDate          DateTime?    @map("expiry_date")
  archived            Boolean      @default(false)
  archivedAt          DateTime?    @map("archived_at")
  
  createdAt           DateTime     @default(now()) @map("created_at")
  updatedAt           DateTime     @updatedAt @map("updated_at")

  // Relationships
  project             Project?     @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([category])
  @@index([uploadedById])
  @@map("files")
}

// ============================================================================
// DELIVERABLES
// ============================================================================

enum DeliverableStatus {
  NOT_STARTED
  IN_PROGRESS
  CLIENT_REVIEW
  APPROVED
  DELIVERED
}

model Deliverable {
  id                  String             @id @default(uuid())
  projectId           String             @map("project_id")
  specification       String             @db.Text
  deliverableType     String             @map("deliverable_type") // images, videos, raw_files, social_media, print
  fileFormatRequired  String?            @map("file_format_required")
  resolutionRequired  String?            @map("resolution_required")
  colorSpaceRequired  String?            @map("color_space_required")
  quantityRequired    Int?               @map("quantity_required")
  namingConvention    String?            @db.Text @map("naming_convention")
  deliveryPlatform    String?            @map("delivery_platform")
  dueDate             DateTime?          @map("due_date")
  status              DeliverableStatus  @default(NOT_STARTED)
  deliveryDate        DateTime?          @map("delivery_date")
  clientApprovalDate  DateTime?          @map("client_approval_date")
  revisionRounds      Int                @default(0) @map("revision_rounds")
  filesDelivered      String[]           @map("files_delivered") // File IDs
  clientAccessLink    String?            @map("client_access_link")
  downloadTracking    Json?              @map("download_tracking")
  archived            Boolean            @default(false)
  
  createdAt           DateTime           @default(now()) @map("created_at")
  updatedAt           DateTime           @updatedAt @map("updated_at")

  // Relationships
  project             Project            @relation(fields: [projectId], references: [id], onDelete: Cascade)

  @@index([projectId])
  @@index([status])
  @@map("deliverables")
}

// ============================================================================
// FREEAGENT INTEGRATION
// ============================================================================

model FreeAgentAuth {
  id                  String   @id @default(uuid())
  accessToken         String   @db.Text @map("access_token")
  refreshToken        String   @db.Text @map("refresh_token")
  expiresAt           DateTime @map("expires_at")
  scope               String?
  companyId           String?  @map("company_id")
  connectionStatus    String   @default("connected") @map("connection_status")
  lastSyncAt          DateTime? @map("last_sync_at")
  syncErrors          Json?    @map("sync_errors")
  
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  @@map("freeagent_auth")
}

model FreeAgentSyncLog {
  id                  String   @id @default(uuid())
  syncType            String   @map("sync_type") // contacts, estimates, invoices, bills
  direction           String   // pull, push, bidirectional
  entityType          String   @map("entity_type")
  entityId            String   @map("entity_id")
  freeagentId         String?  @map("freeagent_id")
  status              String   // success, failed, partial
  errorMessage        String?  @db.Text @map("error_message")
  recordsProcessed    Int      @default(0) @map("records_processed")
  recordsFailed       Int      @default(0) @map("records_failed")
  
  syncedAt            DateTime @default(now()) @map("synced_at")

  @@index([syncType])
  @@index([entityType])
  @@index([status])
  @@map("freeagent_sync_logs")
}

// ============================================================================
// GMAIL INTEGRATION
// ============================================================================

model GmailAuth {
  id                  String   @id @default(uuid())
  userId              String   @unique @map("user_id")
  accessToken         String   @db.Text @map("access_token")
  refreshToken        String   @db.Text @map("refresh_token")
  expiresAt           DateTime @map("expires_at")
  scope               String?
  email               String
  watchExpiration     DateTime? @map("watch_expiration")
  historyId           String?  @map("history_id")
  
  createdAt           DateTime @default(now()) @map("created_at")
  updatedAt           DateTime @updatedAt @map("updated_at")

  @@map("gmail_auth")
}

model EmailTracking {
  id                  String    @id @default(uuid())
  projectId           String?   @map("project_id")
  optionId            String?   @map("option_id")
  gmailMessageId      String    @map("gmail_message_id")
  gmailThreadId       String    @map("gmail_thread_id")
  subject             String
  recipient           String
  sentAt              DateTime  @map("sent_at")
  opened              Boolean   @default(false)
  openedAt            DateTime? @map("opened_at")
  openCount           Int       @default(0) @map("open_count")
  clicked             Boolean   @default(false)
  clickedAt           DateTime? @map("clicked_at")
  replied             Boolean   @default(false)
  repliedAt           DateTime? @map("replied_at")
  replyContent        String?   @db.Text @map("reply_content")
  
  createdAt           DateTime  @default(now()) @map("created_at")

  @@index([gmailMessageId])
  @@index([gmailThreadId])
  @@index([optionId])
  @@map("email_tracking")
}

// ============================================================================
// PDF EXPORTS
// ============================================================================

enum PdfExportType {
  COMPLETE_STATUS_UPDATE
  TALENT_OPTIONS
  CREW_UPDATE
  LOCATION_OPTIONS
  BUDGET_SUMMARY
  CUSTOM
}

model PdfExport {
  id                  String        @id @default(uuid())
  projectId           String        @map("project_id")
  exportType          PdfExportType @map("export_type")
  versionNumber       Int           @map("version_number")
  title               String
  content             Json          // Structure of what's included
  generatedBy         String        @map("generated_by")
  filePath            String        @map("file_path")
  fileSize            Int           @map("file_size")
  recipients          String[]
  distributedAt       DateTime?     @map("distributed_at")
  
  createdAt           DateTime      @default(now()) @map("created_at")

  @@index([projectId])
  @@index([exportType])
  @@map("pdf_exports")
}

// ============================================================================
// SYSTEM CONFIGURATION
// ============================================================================

model SystemSetting {
  id                  String   @id @default(uuid())
  key                 String   @unique
  value               String   @db.Text
  category            String   // email, freeagent, general, etc.
  description         String?  @db.Text
  updatedBy           String   @map("updated_by")
  updatedAt           DateTime @updatedAt @map("updated_at")

  @@index([category])
  @@map("system_settings")
}
```

---

## API Structure

### REST API Conventions

**Base URL**: `https://api.unlimited.bond` or `http://localhost:3000/api` (dev)

**Response Format**:
```typescript
// Success Response
{
  success: true,
  data: { ... },
  message?: string
}

// Error Response
{
  success: false,
  error: {
    code: string,
    message: string,
    details?: any
  }
}

// Paginated Response
{
  success: true,
  data: [...],
  pagination: {
    total: number,
    page: number,
    limit: number,
    totalPages: number
  }
}
```

**HTTP Status Codes**:
- `200 OK`: Successful GET
- `201 Created`: Successful POST
- `204 No Content`: Successful DELETE
- `400 Bad Request`: Validation error
- `401 Unauthorized`: Missing/invalid token
- `403 Forbidden`: Insufficient permissions
- `404 Not Found`: Resource doesn't exist
- `409 Conflict`: Resource conflict (e.g., duplicate)
- `422 Unprocessable Entity`: Business logic validation failed
- `429 Too Many Requests`: Rate limit exceeded
- `500 Internal Server Error`: Server error

### API Endpoints

#### Authentication
```
POST   /api/auth/register        # Admin only: Create new user
POST   /api/auth/login           # Login with email/password
POST   /api/auth/refresh         # Refresh JWT token
POST   /api/auth/logout          # Logout (invalidate refresh token)
POST   /api/auth/forgot-password # Request password reset
POST   /api/auth/reset-password  # Reset password with token
GET    /api/auth/me              # Get current user profile
PATCH  /api/auth/me              # Update current user profile
```

#### Users
```
GET    /api/users                # List all users (admin only)
GET    /api/users/:id            # Get user by ID
PATCH  /api/users/:id            # Update user
DELETE /api/users/:id            # Deactivate user (admin only)
POST   /api/users/:id/permissions # Set project permissions
```

#### Projects
```
GET    /api/projects             # List projects (filtered by permissions)
POST   /api/projects             # Create project
GET    /api/projects/:id         # Get project details
PATCH  /api/projects/:id         # Update project
DELETE /api/projects/:id         # Archive project
POST   /api/projects/:id/assign  # Assign user to project
DELETE /api/projects/:id/assign/:userId # Remove user from project
GET    /api/projects/:id/team    # Get project team
GET    /api/projects/:id/budget  # Get project budget summary
GET    /api/projects/:id/timeline # Get project timeline
```

#### Clients
```
GET    /api/clients              # List all clients
POST   /api/clients              # Create client
GET    /api/clients/:id          # Get client details
PATCH  /api/clients/:id          # Update client
DELETE /api/clients/:id          # Deactivate client
GET    /api/clients/:id/projects # Get client's projects
GET    /api/clients/:id/invoices # Get client's invoices
```

#### Suppliers
```
GET    /api/suppliers            # List all suppliers
POST   /api/suppliers            # Create supplier
GET    /api/suppliers/:id        # Get supplier details
PATCH  /api/suppliers/:id        # Update supplier
DELETE /api/suppliers/:id        # Deactivate supplier
GET    /api/suppliers/:id/expenses # Get supplier expenses
```

#### Crew
```
GET    /api/crew                 # List all crew members
POST   /api/crew                 # Create crew member
GET    /api/crew/:id             # Get crew member details
PATCH  /api/crew/:id             # Update crew member
DELETE /api/crew/:id             # Deactivate crew member
GET    /api/crew/:id/bookings    # Get crew member's bookings
GET    /api/crew/:id/availability # Get crew member's availability (project-specific)
POST   /api/crew/search          # Search crew by criteria
```

#### Talent
```
GET    /api/talent               # List all talent
POST   /api/talent               # Create talent profile
GET    /api/talent/:id           # Get talent details
PATCH  /api/talent/:id           # Update talent profile
DELETE /api/talent/:id           # Deactivate talent
GET    /api/talent/:id/bookings  # Get talent's bookings
GET    /api/talent/:id/portfolio # Get talent's portfolio images
POST   /api/talent/search        # Search talent by criteria
```

#### Options
```
GET    /api/projects/:projectId/options # List project options
POST   /api/projects/:projectId/options # Create options inquiry
GET    /api/options/:id          # Get option details
PATCH  /api/options/:id          # Update option status
POST   /api/options/:id/send     # Send option email
POST   /api/options/:id/follow-up # Send follow-up
DELETE /api/options/:id          # Release option
POST   /api/options/:id/confirm  # Confirm option (convert to booking)
```

#### Estimates
```
GET    /api/projects/:projectId/estimates # List project estimates
POST   /api/projects/:projectId/estimates # Create estimate
GET    /api/estimates/:id        # Get estimate details
PATCH  /api/estimates/:id        # Update estimate
DELETE /api/estimates/:id        # Delete estimate (draft only)
POST   /api/estimates/:id/send   # Send to client
POST   /api/estimates/:id/approve # Client approval
POST   /api/estimates/:id/convert # Convert to project booking
```

#### Budget
```
GET    /api/projects/:projectId/budget # Get project budget
POST   /api/projects/:projectId/budget/lines # Add budget line
PATCH  /api/budget-lines/:id     # Update budget line
GET    /api/projects/:projectId/budget/variance # Get variance report
POST   /api/projects/:projectId/budget/reallocate # Reallocate budget
```

#### Expenses
```
GET    /api/projects/:projectId/expenses # List project expenses
POST   /api/projects/:projectId/expenses # Log expense
GET    /api/expenses/:id         # Get expense details
PATCH  /api/expenses/:id         # Update expense
DELETE /api/expenses/:id         # Delete expense
POST   /api/expenses/:id/approve # Approve expense
POST   /api/expenses/:id/mark-rebillable # Mark as client rebillable
```

#### Invoices
```
GET    /api/projects/:projectId/invoices # List project invoices
POST   /api/projects/:projectId/invoices # Generate invoice
GET    /api/invoices/:id         # Get invoice details
PATCH  /api/invoices/:id         # Update invoice
POST   /api/invoices/:id/send    # Send to client
POST   /api/invoices/:id/payment # Record payment
GET    /api/invoices/:id/pdf     # Download invoice PDF
POST   /api/invoices/:id/reminder # Send payment reminder
```

#### Tasks
```
GET    /api/projects/:projectId/tasks # List project tasks
POST   /api/projects/:projectId/tasks # Create task
GET    /api/tasks/:id            # Get task details
PATCH  /api/tasks/:id            # Update task
DELETE /api/tasks/:id            # Delete task
POST   /api/tasks/:id/complete   # Mark as complete
GET    /api/tasks/my-tasks       # Get current user's tasks
```

#### Calendar
```
GET    /api/projects/:projectId/calendar # Get project calendar events
POST   /api/projects/:projectId/calendar # Create calendar event
GET    /api/calendar/events/:id  # Get event details
PATCH  /api/calendar/events/:id  # Update event
DELETE /api/calendar/events/:id  # Delete event
GET    /api/calendar/my-calendar # Get current user's calendar
POST   /api/calendar/ai-suggest  # AI scheduling suggestions
```

#### Travel
```
GET    /api/projects/:projectId/travel # List project travel itineraries
POST   /api/projects/:projectId/travel # Create itinerary
GET    /api/travel/:id           # Get itinerary details
PATCH  /api/travel/:id           # Update itinerary
DELETE /api/travel/:id           # Delete itinerary
POST   /api/travel/:id/segments  # Add travel segment
GET    /api/travel/:id/pdf       # Download itinerary PDF
GET    /api/travel/:id/share     # Get shareable link
```

#### Files
```
GET    /api/projects/:projectId/files # List project files
POST   /api/projects/:projectId/files # Upload file
GET    /api/files/:id            # Get file details
GET    /api/files/:id/download   # Download file
PATCH  /api/files/:id            # Update file metadata
DELETE /api/files/:id            # Delete file
POST   /api/files/:id/versions   # Upload new version
```

#### Client Portal
```
GET    /api/portal/projects      # List client's projects
GET    /api/portal/projects/:id  # Get project details (client view)
GET    /api/portal/projects/:id/options # Get talent/location options
POST   /api/portal/projects/:id/options/:optionId/approve # Approve option
GET    /api/portal/projects/:id/budget # Get budget summary
GET    /api/portal/projects/:id/deliverables # Get deliverables
POST   /api/portal/projects/:id/deliverables/:id/approve # Approve deliverable
GET    /api/portal/projects/:id/files # Get client-visible files
POST   /api/portal/messages      # Send message to team
```

#### PDF Exports
```
POST   /api/projects/:projectId/pdf # Generate PDF
GET    /api/projects/:projectId/pdf/:id # Download PDF
GET    /api/projects/:projectId/pdf/history # Get PDF export history
POST   /api/projects/:projectId/pdf/schedule # Schedule automated PDF
```

#### FreeAgent
```
GET    /api/freeagent/auth-url   # Get OAuth URL
GET    /api/freeagent/callback   # OAuth callback
POST   /api/freeagent/sync/contacts # Sync contacts
POST   /api/freeagent/sync/estimates # Sync estimates
POST   /api/freeagent/sync/invoices # Sync invoices
POST   /api/freeagent/sync/bills # Sync bills
GET    /api/freeagent/status     # Get connection status
DELETE /api/freeagent/disconnect # Disconnect FreeAgent
```

#### Gmail
```
GET    /api/gmail/auth-url       # Get OAuth URL
GET    /api/gmail/callback       # OAuth callback
GET    /api/gmail/status         # Get connection status
POST   /api/gmail/watch          # Setup push notifications
DELETE /api/gmail/disconnect     # Disconnect Gmail
```

### Query Parameters

**Standard Query Parameters** (for list endpoints):
```
GET /api/projects?page=1&limit=20&sort=createdAt:desc&status=in_production

page: Page number (default: 1)
limit: Items per page (default: 20, max: 100)
sort: Sort field and direction (field:asc or field:desc)
search: Full-text search query
[fieldName]: Filter by field value
```

**Examples**:
```
# Search and filter
GET /api/crew?search=photographer&rating=4.5+&location=london

# Date range
GET /api/projects?createdAfter=2025-01-01&createdBefore=2025-12-31

# Multiple values
GET /api/projects?status=in_production,confirmed

# Nested includes
GET /api/projects/:id?include=client,estimates,tasks
```

---

## Authentication & Authorization

### JWT Authentication Flow

**Login Process**:
1. User submits email/password
2. Server validates credentials
3. Server generates two tokens:
   - **Access Token**: Short-lived (15 minutes), contains user ID and role
   - **Refresh Token**: Long-lived (7 days), stored in database
4. Both tokens returned to client
5. Client stores access token in memory, refresh token in httpOnly cookie

**Token Structure**:
```typescript
// Access Token Payload
{
  userId: string,
  email: string,
  role: UserRole,
  iat: number,
  exp: number
}

// Refresh Token Payload
{
  userId: string,
  tokenId: string, // Unique ID for this refresh token
  iat: number,
  exp: number
}
```

**Refresh Flow**:
1. Access token expires
2. Client sends refresh token to `/api/auth/refresh`
3. Server validates refresh token (checks database)
4. Server generates new access token
5. Optional: Generate new refresh token (rotation)

**Protected Routes**:
```typescript
// Middleware example
async function authMiddleware(req, res, next) {
  const token = req.headers.authorization?.replace('Bearer ', '');
  
  if (!token) {
    return res.status(401).json({ error: 'No token provided' });
  }
  
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token' });
  }
}
```

### Role-Based Access Control (RBAC)

**Permission Checking**:
```typescript
// Permission middleware
function requireRole(...allowedRoles: UserRole[]) {
  return (req, res, next) => {
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Insufficient permissions' });
    }
    next();
  };
}

// Usage
app.get('/api/users', 
  authMiddleware, 
  requireRole('ADMIN_PRODUCER'), 
  usersController.list
);
```

**Project-Level Permissions**:
```typescript
// Check if user can access specific project
async function canAccessProject(userId: string, projectId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  
  // Admin Producer can access all projects
  if (user.role === 'ADMIN_PRODUCER') return true;
  
  // Accountant can access all projects (read-only enforced elsewhere)
  if (user.role === 'ACCOUNTANT') return true;
  
  // Check project assignment
  const assignment = await prisma.projectAssignment.findUnique({
    where: {
      projectId_userId: { projectId, userId }
    }
  });
  
  return !!assignment;
}
```

**Resource-Level Permissions**:
```typescript
// Can user edit this resource?
function canEditProject(user: User, project: Project): boolean {
  if (user.role === 'ADMIN_PRODUCER') return true;
  if (user.role === 'PRODUCER' && project.ownerId === user.id) return true;
  
  // Check if user is assigned to project with edit rights
  const assignment = project.assignments.find(a => a.userId === user.id);
  if (assignment?.permissions?.canEdit) return true;
  
  return false;
}
```

---

## Core Features

### Phase 1: Foundation (Months 1-2)

**Goals**: Establish core database structure, authentication, and basic CRUD operations.

**Deliverables**:

1. **Database Setup**
   - Prisma schema for core entities
   - Initial migrations
   - Seed data script (test users, sample data)

2. **User Authentication**
   - User registration (admin-only)
   - Login with JWT
   - Password hashing with bcrypt
   - Refresh token flow
   - Password reset via email

3. **User Management**
   - List users (admin only)
   - View user profile
   - Update user profile
   - Deactivate users
   - Role assignment

4. **Projects Module**
   - Create project
   - List projects (filtered by role/assignment)
   - View project details
   - Update project
   - Archive project
   - Assign team members
   - Project code auto-generation (PRJ-YYYY-NNN)

5. **Clients Module**
   - CRUD operations
   - Search and filter clients
   - Link clients to projects
   - Store FreeAgent contact ID (for future sync)

6. **Suppliers Module**
   - CRUD operations
   - Categorize suppliers
   - Search and filter suppliers
   - Store FreeAgent contact ID

7. **Crew Module**
   - CRUD operations with extensive fields
   - Tabbed form interface (Basic Info, Professional, Financial, Documents)
   - Search and filter by role, skills, location, rate
   - Rating system

8. **Talent Module**
   - CRUD operations with talent-specific fields
   - Portfolio image management
   - Search and filter by type, look, agency
   - Comp card upload

9. **RBAC System**
   - Permission middleware for routes
   - Role-based filtering of data
   - Project-level access control

10. **FreeAgent Integration (Basic)**
    - OAuth2 authentication with FreeAgent
    - One-way contact sync (pull from FreeAgent)
    - Store access/refresh tokens
    - Manual sync trigger button

**Technical Implementation Notes**:

**Auto-Generated Project Codes**:
```typescript
async function generateProjectCode(): Promise<string> {
  const year = new Date().getFullYear();
  
  // Get count of projects this year
  const count = await prisma.project.count({
    where: {
      code: {
        startsWith: `PRJ-${year}-`
      }
    }
  });
  
  const nextNumber = (count + 1).toString().padStart(3, '0');
  return `PRJ-${year}-${nextNumber}`;
}
```

**Password Reset Flow**:
```typescript
// 1. User requests reset
POST /api/auth/forgot-password
{ email: "user@example.com" }

// 2. Generate token, store in database, send email
const resetToken = crypto.randomBytes(32).toString('hex');
const hashedToken = await bcrypt.hash(resetToken, 10);

await prisma.user.update({
  where: { email },
  data: {
    passwordResetToken: hashedToken,
    passwordResetExpires: new Date(Date.now() + 3600000) // 1 hour
  }
});

// Send email with link: https://app.unlimited.bond/reset-password?token={resetToken}

// 3. User clicks link, submits new password
POST /api/auth/reset-password
{ token: "...", newPassword: "..." }

// 4. Validate token, update password, clear reset fields
```

**FreeAgent Contact Sync**:
```typescript
async function syncContactsFromFreeAgent() {
  const contacts = await freeagentClient.getContacts();
  
  for (const contact of contacts) {
    // Determine if client or supplier
    const isClient = contact.contact_type === 'customer';
    
    if (isClient) {
      await prisma.client.upsert({
        where: { freeagentContactId: contact.id },
        create: {
          freeagentContactId: contact.id,
          companyName: contact.organisation_name,
          primaryContactEmail: contact.email,
          // ... map other fields
        },
        update: {
          companyName: contact.organisation_name,
          // ... update relevant fields
        }
      });
    } else {
      await prisma.supplier.upsert({
        where: { freeagentContactId: contact.id },
        create: {
          freeagentContactId: contact.id,
          companyName: contact.organisation_name,
          // ... map other fields
        },
        update: {
          // ... update relevant fields
        }
      });
    }
  }
}
```

---

### Phase 2-10: Remaining Features

Due to the extensive nature of the remaining phases, I'll provide high-level overviews. Each phase should have detailed implementation specifications created before development begins.

**Phase 2: Financial Systems (Month 3)**
- Estimates creation with line items
- Budget tracking (real-time variance)
- Invoice generation
- Expense logging with receipt uploads
- Client-rebillable expenses workflow
- FreeAgent sync (estimates, invoices, bills)

**Phase 3: Options & Booking (Month 4)**
- Options system (crew, talent, supplier, location)
- Gmail API integration (send, track, parse responses)
- Option email templates with personalization
- Automatic follow-up system
- Booking confirmation workflows
- Release emails

**Phase 4: Client Portal (Month 5)**
- Client authentication and portal access
- Project dashboard (client view)
- Options visibility and approval UI
- Budget summary view
- Deliverables access
- Real-time updates (WebSockets)
- Messaging system

**Phase 5: Production Tools (Month 6)**
- Tasks and to-dos with dependencies
- Multi-view calendar system
- Call sheet auto-generation
- Travel itinerary builder
- Shot lists
- Crew timesheets

**Phase 6: PDF Exports (Month 7)**
- PDF generation engine (Puppeteer)
- Branded templates (all types)
- Customization interface
- Scheduled exports
- Email distribution
- Version control

**Phase 7: Advanced Integrations & AI (Months 8-9)**
- Google Maps API (full integration)
- Route optimization
- AI scheduling agent (GPT-4/Claude API)
- Task generation from project analysis
- Dependency mapping
- Problem detection
- Natural language interface

**Phase 8: Optimization (Month 10)**
- Performance optimization
- Database query optimization
- Caching strategies
- Frontend bundle optimization
- Mobile responsiveness improvements
- User experience refinements

**Phase 9: Training & Launch (Month 11)**
- Team training
- Documentation
- Client portal training for clients
- Gradual rollout
- Feedback collection

**Phase 10: Post-Launch (Month 12+)**
- Bug fixes
- Feature requests
- AI training improvements
- Additional integrations
- Scaling

---

## Integration Specifications

### FreeAgent API

**Base URL**: `https://api.freeagent.com/v2`

**Authentication**: OAuth2

**Key Endpoints**:
```
GET  /contacts                    # List contacts
GET  /contacts/:id                # Get contact
POST /contacts                    # Create contact
PUT  /contacts/:id                # Update contact

GET  /estimates                   # List estimates
POST /estimates                   # Create estimate
PUT  /estimates/:id               # Update estimate

GET  /invoices                    # List invoices
POST /invoices                    # Create invoice
PUT  /invoices/:id                # Update invoice
POST /invoices/:id/send_email     # Send invoice

GET  /bills                       # List bills
POST /bills                       # Create bill
```

**Rate Limits**: 1000 requests per hour

**Webhook Events** (if available):
- `contact.created`
- `contact.updated`
- `invoice.sent`
- `invoice.paid`

### Gmail API

**Base URL**: `https://gmail.googleapis.com/gmail/v1`

**Authentication**: OAuth2

**Key Endpoints**:
```
POST /users/me/messages/send      # Send email
GET  /users/me/messages           # List messages
GET  /users/me/messages/:id       # Get message
GET  /users/me/threads/:id        # Get thread
POST /users/me/watch              # Setup push notifications
```

**Send Email**:
```typescript
const message = {
  to: 'recipient@example.com',
  subject: 'Option Inquiry',
  html: '<p>Email body...</p>'
};

// Encode as base64url
const raw = Buffer.from(
  `To: ${message.to}\n` +
  `Subject: ${message.subject}\n` +
  `Content-Type: text/html; charset=utf-8\n\n` +
  message.html
).toString('base64url');

await gmail.users.messages.send({
  userId: 'me',
  requestBody: { raw }
});
```

**Push Notifications**:
```typescript
// Setup watch
await gmail.users.watch({
  userId: 'me',
  requestBody: {
    topicName: 'projects/YOUR_PROJECT/topics/gmail-notifications',
    labelIds: ['INBOX']
  }
});

// Handle webhook
app.post('/api/gmail/webhook', async (req, res) => {
  const data = JSON.parse(
    Buffer.from(req.body.message.data, 'base64').toString()
  );
  
  // Process new messages
  await processNewEmails(data.historyId);
  
  res.status(200).send();
});
```

### Google Maps API

**Required APIs**:
- Geocoding API
- Maps JavaScript API
- Places API
- Routes API (for travel optimization)

**Geocoding Example**:
```typescript
import { Client } from "@googlemaps/google-maps-services-js";

const client = new Client({});

async function geocodeAddress(address: string) {
  const response = await client.geocode({
    params: {
      address,
      key: process.env.GOOGLE_MAPS_API_KEY
    }
  });
  
  return {
    latitude: response.data.results[0].geometry.location.lat,
    longitude: response.data.results[0].geometry.location.lng,
    formattedAddress: response.data.results[0].formatted_address
  };
}
```

**Route Optimization**:
```typescript
async function optimizeRoute(waypoints: string[]) {
  const response = await client.directions({
    params: {
      origin: waypoints[0],
      destination: waypoints[waypoints.length - 1],
      waypoints: waypoints.slice(1, -1),
      optimize: true,
      key: process.env.GOOGLE_MAPS_API_KEY
    }
  });
  
  return response.data.routes[0];
}
```

---

## User Interface Guidelines

### Design System

**Colors**:
```css
/* Primary */
--primary: #0F172A; /* Dark slate */
--primary-foreground: #F8FAFC;

/* Secondary */
--secondary: #64748B; /* Slate */
--secondary-foreground: #F8FAFC;

/* Accent */
--accent: #3B82F6; /* Blue */
--accent-foreground: #F8FAFC;

/* Status Colors */
--success: #10B981; /* Green */
--warning: #F59E0B; /* Amber */
--error: #EF4444; /* Red */
--info: #3B82F6; /* Blue */

/* Neutral */
--background: #FFFFFF;
--foreground: #0F172A;
--muted: #F1F5F9;
--muted-foreground: #64748B;
--border: #E2E8F0;
```

**Typography**:
```css
/* Font Family */
font-family: 'Inter', system-ui, sans-serif;

/* Sizes */
--text-xs: 0.75rem;    /* 12px */
--text-sm: 0.875rem;   /* 14px */
--text-base: 1rem;     /* 16px */
--text-lg: 1.125rem;   /* 18px */
--text-xl: 1.25rem;    /* 20px */
--text-2xl: 1.5rem;    /* 24px */
--text-3xl: 1.875rem;  /* 30px */
--text-4xl: 2.25rem;   /* 36px */
```

**Spacing**:
```css
/* Use Tailwind spacing scale (0.25rem = 4px) */
--spacing-1: 0.25rem;   /* 4px */
--spacing-2: 0.5rem;    /* 8px */
--spacing-3: 0.75rem;   /* 12px */
--spacing-4: 1rem;      /* 16px */
--spacing-6: 1.5rem;    /* 24px */
--spacing-8: 2rem;      /* 32px */
--spacing-12: 3rem;     /* 48px */
```

### Component Patterns

**Status Badges**:
```tsx
// Color coding for project status
const statusColors = {
  inquiry: 'bg-blue-100 text-blue-800',
  confirmed: 'bg-green-100 text-green-800',
  in_production: 'bg-purple-100 text-purple-800',
  delivered: 'bg-indigo-100 text-indigo-800',
  invoiced: 'bg-yellow-100 text-yellow-800',
  closed: 'bg-gray-100 text-gray-800'
};

<Badge className={statusColors[project.status]}>
  {project.status.replace('_', ' ').toUpperCase()}
</Badge>
```

**Data Tables**:
- Sortable columns
- Filterable columns
- Pagination
- Row actions (view, edit, delete)
- Bulk actions
- Empty states

**Forms**:
- Clear labels
- Inline validation
- Error messages below fields
- Required field indicators (*)
- Help text where needed
- Submit/Cancel buttons (right-aligned)

**Loading States**:
- Skeleton loaders for content
- Spinners for actions
- Progress bars for uploads
- Optimistic UI updates

**Empty States**:
- Descriptive message
- Call to action
- Relevant icon or illustration

### Responsive Breakpoints
```css
/* Tailwind breakpoints */
sm: 640px   /* Tablet portrait */
md: 768px   /* Tablet landscape */
lg: 1024px  /* Desktop */
xl: 1280px  /* Large desktop */
2xl: 1536px /* Extra large desktop */
```

**Mobile-First Approach**:
- Design for mobile first
- Progressively enhance for larger screens
- Collapsible sidebar on mobile
- Bottom navigation on mobile
- Touch-friendly tap targets (44x44px minimum)

### Accessibility

- **ARIA labels** on interactive elements
- **Keyboard navigation** support
- **Focus indicators** visible
- **Color contrast** WCAG AA compliant
- **Alt text** on images
- **Skip links** for main content
- **Screen reader** friendly

---

## Development Phases

### Phase 1: Foundation (Detailed)

**Duration**: 2 months

**Week 1-2: Project Setup & Database**
- Initialize monorepo structure
- Set up backend (Node.js, TypeScript, Express, Prisma)
- Set up frontend (Vite, React, TypeScript, Tailwind)
- Configure ESLint, Prettier
- Set up PostgreSQL database
- Create Prisma schema for Phase 1 entities
- Run initial migrations
- Set up development environment

**Week 3-4: Authentication System**
- Implement JWT authentication
- User registration (admin only)
- Login/logout
- Refresh token flow
- Password reset via email
- Auth middleware
- Protected routes

**Week 5-6: Projects Module**
- Projects CRUD backend
- Projects CRUD frontend
- Project code auto-generation
- Team assignment
- RBAC enforcement
- Project list with filters
- Project detail page

**Week 7-8: Clients & Suppliers**
- Clients CRUD (backend + frontend)
- Suppliers CRUD (backend + frontend)
- Search and filter functionality
- Link to projects

**Week 9-10: Crew & Talent**
- Crew CRUD with extensive fields
- Talent CRUD with portfolio
- Search and filter
- Image uploads (S3 integration)
- Tabbed form interfaces

**Week 11-12: FreeAgent Integration & Testing**
- OAuth2 setup
- Contact sync (one-way)
- Manual sync trigger
- End-to-end testing
- Bug fixes
- Documentation

**Phase 1 Completion Criteria**:
- [x] Admin can create users with roles (admin-only register endpoint)
- [x] Users can login and receive JWT
- [x] Permissions work correctly by role (basic API RBAC + project access filtering)
- [x] Projects can be created and assigned
- [x] Clients and suppliers can be managed
- [x] Crew and talent databases are functional
- [ ] FreeAgent connection works
- [ ] Deployed to VPS

---

## Environment Variables
```bash
# Database
DATABASE_URL="postgresql://user:password@localhost:5432/production_mgmt"

# JWT
JWT_SECRET="your-jwt-secret-key-min-32-chars"
JWT_REFRESH_SECRET="your-jwt-refresh-secret-key"
JWT_EXPIRES_IN="15m"
JWT_REFRESH_EXPIRES_IN="7d"

# Server
NODE_ENV="development" # development, production
PORT="3000"
FRONTEND_URL="http://localhost:5173"

# Email (SendGrid)
SENDGRID_API_KEY="your-sendgrid-api-key"
FROM_EMAIL="noreply@unlimited.bond"

# File Storage (AWS S3 or compatible)
S3_BUCKET="production-mgmt-files"
S3_REGION="eu-west-2"
S3_ACCESS_KEY="your-access-key"
S3_SECRET_KEY="your-secret-key"
S3_ENDPOINT="" # For DigitalOcean Spaces or other S3-compatible

# FreeAgent
FREEAGENT_CLIENT_ID="your-freeagent-client-id"
FREEAGENT_CLIENT_SECRET="your-freeagent-client-secret"
FREEAGENT_REDIRECT_URI="https://app.unlimited.bond/auth/freeagent/callback"
FREEAGENT_SANDBOX="true" # Use sandbox for development

# Gmail API
GMAIL_CLIENT_ID="your-gmail-client-id"
GMAIL_CLIENT_SECRET="your-gmail-client-secret"
GMAIL_REDIRECT_URI="https://app.unlimited.bond/auth/gmail/callback"

# Google Maps
GOOGLE_MAPS_API_KEY="your-google-maps-api-key"

# AI/LLM (for scheduling agent)
OPENAI_API_KEY="your-openai-api-key"
# or
ANTHROPIC_API_KEY="your-anthropic-api-key"

# Redis (for queues)
REDIS_URL="redis://localhost:6379"

# Monitoring (optional)
SENTRY_DSN=""
```

---

## Success Metrics

**Phase 1 Success Metrics**:
- All core entities can be created/edited/viewed
- Authentication is secure and working
- Permissions correctly restrict access
- FreeAgent connection established
- System is deployed and accessible
- No critical bugs
- Basic documentation exists

**Long-Term Success Metrics** (post full implementation):
- Time saved: 40% reduction in administrative time
- Invoice generation: 80% faster
- Budget variance: Within ±5%
- Client portal usage: 80%+ of clients
- Payment collection: 20% faster
- Team satisfaction: 4.5/5 or higher
- System uptime: 99.9%

---

## Notes for Claude Code

### Building Incrementally

1. **Start with database schema first** - Get the foundation right
2. **Build vertical slices** - Complete one feature (backend + frontend + test) before moving to next
3. **Test as you go** - Don't accumulate untested code
4. **Commit frequently** - Small, focused commits with clear messages
5. **Document as you build** - Add code comments and update docs

### Code Quality Standards

- **TypeScript strict mode** enabled
- **ESLint** configured and passing
- **Prettier** for consistent formatting
- **Unit tests** for business logic
- **Integration tests** for API endpoints
- **E2E tests** for critical user flows

### Performance Considerations

- **Database queries**: Use `select` to limit fields, `include` strategically
- **Pagination**: Always paginate list endpoints
- **Caching**: Cache frequently accessed data (Redis)
- **Indexes**: Add database indexes on queried fields
- **N+1 queries**: Use Prisma `include` to avoid
- **File uploads**: Stream large files, don't load into memory

### Security Checklist

- [ ] SQL injection protected (Prisma prevents this)
- [ ] XSS protected (React escapes by default)
- [ ] CSRF tokens on state-changing operations
- [ ] Rate limiting on auth endpoints
- [ ] Input validation on all endpoints (Zod)
- [ ] Passwords hashed with bcrypt (12+ rounds)
- [ ] Secrets in environment variables (never hardcoded)
- [ ] HTTPS enforced in production
- [ ] CORS configured correctly
- [ ] Security headers set (helmet middleware)

---

## Glossary

**Option**: A non-binding inquiry to check availability (crew, talent, supplier, location)

**Booking**: Confirmed assignment of crew/talent to a project

**Deal Memo**: Contract for crew members

**Comp Card**: Model portfolio card (digitals)

**Usage Rights**: Terms for how images/videos can be used

**Buyout**: Unlimited usage rights purchase

**Rebillable Expense**: Cost passed through to client with markup

**Call Sheet**: Detailed shoot day schedule and information

**Call Time**: When crew/talent must arrive

**Wrap Time**: When shoot ends

**Shot List**: Detailed list of planned photographs/shots

**Deliverables**: Final files provided to client

**Estimate**: Project cost proposal

**Variance**: Difference between budgeted and actual costs

**Contingency**: Buffer budget for unexpected costs

**Agency Fee**: unlimited.bond's commission (10% talent, 20% production)

---

This comprehensive project context should give Claude Code everything needed to build the system correctly. Reference specific sections as needed during development.

## Implementation Status (Verified Against Repo)

### Backend
- Auth flow: bootstrap, login, refresh, admin-only register, forgot/reset password.
- Users: list/update/deactivate (admin-only).
- Projects: CRUD, project code generation, archive, team assignments.
- Clients, suppliers, crew, talent: CRUD.
- Dashboard: summary stats endpoint.

### Frontend
- Login page with token storage.
- Reset password page (request + set new password).
- Projects list/detail pages.
- Clients list/detail pages.
- Dashboard/home page shell.

### Not Yet Implemented (From Spec)
- FreeAgent integration, Gmail API integration.
- Estimates/invoices/expenses, options/booking, client portal.
- File uploads (S3), PDFs, tasks/calendar, AI scheduling.
- Role-based UI surfaces for crew/talent/suppliers management.

## Current Status

Core Phase 1 API surface is implemented (auth, users, projects, clients, suppliers, crew, talent), but frontend coverage is limited and email delivery still relies on pending SendGrid configuration.

## Completed

- Backend reset-password endpoints exist (`/auth/forgot-password`, `/auth/reset-password`).
- Reset password email template exists.
- Frontend reset password page exists at `/reset-password`.
- Basic dashboard stats endpoint exists.
- Projects, clients, suppliers, crew, talent APIs exist (CRUD).
- Frontend CRUD screens exist for suppliers, crew, and talent.
- Project team assignment UI exists on project detail.
- Supplier, crew, and talent detail/edit screens exist.
- Client and project detail screens include edit forms.
- Client deactivation and project archive actions are available in the UI.
- Global toast notifications added for create/update/archive flows.
- FreeAgent OAuth, status, and manual contact sync endpoints are implemented with a dashboard trigger.
- FreeAgent migration applied and Prisma client generated on the server.

## In Progress

- Configure SendGrid API credentials in `/srv/production-management-system/backend/.env`.
- Confirm `FRONTEND_URL` and `FROM_EMAIL` are set for reset links in `/srv/production-management-system/backend/.env`.
- Verify reset password email delivery end-to-end (SendGrid -> inbox -> reset link -> new password).
- Add backend env template docs for mail settings (`SENDGRID_API_KEY`, `FROM_EMAIL`, `FRONTEND_URL`).
- Add regression coverage for reset password flow (API + UI).

## Next

- Validate email sender identity in SendGrid (avoid `403 Forbidden` on send).
- Add monitoring or logging around reset flow failures.

## Maintenance Workflow (Keep AGENTS.md Current)

1. Cross-check repo reality against this doc (scan `backend/prisma/schema.prisma`, `backend/src/routes`, `frontend/src/pages`).
2. Update "Implementation Status" and "Current Status" to match what exists in code.
3. Mark Phase 1 Completion Criteria checkboxes when features are verifiably implemented.
4. Add/refresh "In Progress" and "Next" items based on gaps in the repo.
5. Keep env var names aligned with actual code (`FROM_EMAIL` vs docs, etc.).
