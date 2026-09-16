# Unlimited.Bond production hub

An internal workspace for taking production jobs from enquiry through delivery and financial close. Current direction: a clean project UI, reliable operational records in PostgreSQL, and Google Drive project folders for documents and published exports. Budgets, invoices and reconciliation are the first substantial workflow rebuild.

## Start here

- [Current brief](BRIEF.md): product decisions and scope.
- [Production hub plan](docs/production-hub/PLAN.md): detailed workflow and remaining roadmap.
- [Documentation index](docs/README.md): current references and historical records.
- [Changelog](CHANGELOG.md), [handover](HANDOVER.md), and [release records](docs/releases/README.md): what changed and what actually shipped.
- [Deployment runbook](docs/deploy.md): backup, migration, rollout and verification.

## Current stack and capabilities

React/TypeScript/Vite; Express/TypeScript; Prisma/PostgreSQL; session authentication; PM2/nginx on the existing VPS. No Next.js/Supabase migration is part of the current direction.

Home, Projects, People, Finance and Files & exports are the main navigation. Existing options, casting/location PDFs, crew, schedule, POs, selects, email and calendar remain available. Finance includes an independent supplier invoice/payment register. New projects use starter estimates, separate planned supplier costs, frozen approvals, automatic Drive folders and invoice-folder review. See the [new project workflow](docs/production-hub/NEW-PROJECT-WORKFLOW.md) for delivered scope and remaining accounting work.

The Drive integration supports a separate app-owned Google connection, verified project folder links, creating job folders, browsing, durable publication/retry and Drive-backed downloads. Connection requires Google consent. Local assets remain necessary for staging, recovery and workflows not migrated to Drive. See [Drive implementation and activation](docs/production-hub/DRIVE-IMPLEMENTATION.md) for limits and current activation status.

## Development

Use a separate development database. Install dependencies in `backend` and `frontend`; copy `backend/.env.example` to a private `.env`, set development values, and generate Prisma Client with `npm run db:generate --prefix backend`. Apply reviewed migrations to the intended development database. Run `npm run dev --prefix backend` and `npm run dev --prefix frontend` (API 3000, UI 5173).

Validation: `npm run build --prefix backend`, `npm run lint --prefix frontend`, `npm run build --prefix frontend`. Browser and isolated database checks are documented in the Drive implementation guide. Never run `db push` or development reset commands against the live database.

Production: https://agent.unlimited.bond. Deployment status is recorded per release, not inferred from a successful local build. Secrets, exports, uploaded assets and database dumps must not be committed.

The [French Hair Lab finance pilot](docs/production-hub/FINANCE-IMPLEMENTATION.md) adds independent supplier costs, invoices, allocations and recorded payments under Project → Costs, with the existing estimate editor retained. [Release evidence](docs/releases/2026-09-16-finance-register.md) distinguishes this deployed supplier register from the remaining full financial-close model.
