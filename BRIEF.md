# Unlimited.Bond — current product brief

Direction reset: 16 September 2026. This replaces the earlier standalone-filesystem brief and contradictory platform proposals. The originals and their amendments remain in the [dated archive](docs/archive/2026-09-16-before-direction-reset/README.md). The detailed specification is [PLAN.md](docs/production-hub/PLAN.md).

## Product

One production workspace from enquiry to financial close, with fast tables, contextual details and clear next actions. Preserve the useful behaviour of the status sheets and working casting/location generators without copying their inconsistent data or creating another generic spreadsheet database.

The user's first daily priority is budgets, invoices and reconciliation. Files and exports belong in the project's Google Drive folder. PostgreSQL owns structured operational records, relationships and financial data; Drive owns published document binaries. Google Sheets are references or optional views, not a second writable source of truth.

## Interface

Main navigation: Home · Projects · People · Finance · Files & exports. Actions, enquiries, calendar, email, receipts/reporting and settings remain accessible. Project modules should be consistent and eventually configurable by job template; do not claim that configurability is already delivered.

Home surfaces attention and next steps. Each project has one working home, with Overview, Actions, Casting & options, Crew, Schedule, Costs and Files. Preserve specialist tools until the replacement covers their real workflow and unique data. Tables should support fast editing, keyboard use, clear saves/errors, and mobile access. Keep internal implementation detail out of ordinary production workflows.

## Financial target — partially implemented

New projects now have a [template-to-approval budget workflow](docs/production-hub/NEW-PROJECT-WORKFLOW.md), automatic Drive folders and invoice-folder review. Costs exposes Estimate, Live costs, Purchase orders, Invoices, Client billing and Reconcile through the [supplier register](docs/production-hub/FINANCE-IMPLEMENTATION.md). The [client billing workflow](docs/production-hub/CLIENT-BILLING-WORKFLOW.md) adds issued invoices, deposit balances and partial receipts, extended by [client credits and corrections](docs/production-hub/CLIENT-CREDIT-WORKFLOW.md). The [supplier reconciliation workflow](docs/production-hub/SUPPLIER-RECONCILIATION.md) adds supplier credits/refunds and a final-review checklist. The complete financial model below remains the target; existing records are not automatically migrated. An approved client estimate is an immutable commercial snapshot. Commitments, invoices, credits, allocations and payments continue independently against stable project costs. Support split invoices, multiple invoices per cost, partial payments, original currency/FX evidence and explicit close exceptions. Never count both a commitment and its matching invoice as additional cost.

Financial truth must reconcile to source documents and accepted closing figures. The sampled estimate spreadsheets contain broken references; they are not unquestioned migration baselines. Client-facing exports use a field allowlist, not hidden-column assumptions. Preserve existing budget tools for old projects. The user now prefers new projects; legacy migration is optional later work, not a launch prerequisite.

## Files and publishing

Configured root: [_PROJECTS](https://drive.google.com/drive/folders/1-0gwnfN5lGiLa4WGbC_q2nQ50l3e-iSR). Link exact existing folder IDs; don't merge similarly named jobs. New projects receive numbered category folders and explicit mappings. Legacy linked projects retain their `Production Hub` subfolder. Existing files stay where they are. Supported uploads and filed exports use persistent queue states, retries and duplicate protection; published downloads use Drive. Retain local assets during the transition.

The app needs its own Google authorisation. The assistant's Drive connection is separate. Folder permissions govern the audience; an app link does not make a document private or client-safe. Preserve working bound Apps Scripts until their code, templates and outputs have been reviewed and replacements verified.

## Technical direction

Improve the existing React/Vite + Express + Prisma/PostgreSQL VPS application incrementally. No framework replacement, Supabase migration, JWT/S3/Redis rewrite or mass ID rekey is currently scheduled. Existing session authentication remains single-team; project-level team permissions are future work. FreeAgent integration must not be described as complete merely because fields or environment keys exist.

## Delivery order

1. Release the UI/performance and Drive foundation, then complete Google consent and verify a live publishing pilot.
2. Separate estimates from the financial ledger; prove reconciliation on accepted examples.
3. Consolidate duplicate project/workbook editors while migrating manual-only content.
4. Connect bookings, people, travel, delivery and close; verify publishing parity.
5. Add structured AI suggestions only after reliable records and review controls exist.

Builds, deployments and external activation are different states. Record each in the changelog and release record. Do not describe proposed capabilities as shipped.
