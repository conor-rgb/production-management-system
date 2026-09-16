# Working on the Unlimited.Bond production hub

Updated 16 September 2026. Read [BRIEF.md](BRIEF.md), [HANDOVER.md](HANDOVER.md) and the [documentation index](docs/README.md). The detailed plan is [docs/production-hub/PLAN.md](docs/production-hub/PLAN.md). Old brief amendments and agent instructions are archived and no longer set direction.

## Direction and constraints

- Keep the current React/Vite, Express, Prisma/PostgreSQL VPS stack. Finance-first consolidation and Drive-backed documents are the current priorities.
- PostgreSQL owns structured operations. Drive owns published files; local storage remains staging/recovery and supports unmigrated workflows.
- Preserve IDs, approved financial snapshots, manual workbook content, original files, share links and existing working generators.
- Use slim summary endpoints for lists; don't load email bodies or complete budget graphs for navigation.
- The independent supplier register and new-project estimate/Drive workflow are implemented; new projects take priority over the earlier French Hair Lab migration pilot; client billing and receipts are implemented separately from supplier costs. Client credits, replacement drafts and refund records extend that billing flow. Supplier credits/refunds and a source-aware final-review checklist are implemented. Reviewed supplier currencies, bank-settlement differences and linked crew bookings are implemented; check the latest release state. Legacy migration, automatic bank feeds and formal close remain outstanding. Never combine legacy saved totals with new-register amounts or describe the pilot as complete financial close. See docs/production-hub/FINANCE-IMPLEMENTATION.md.
- Session authentication is single-team. Existing share links do not imply project-level staff permissions.

## Working and deployment

TypeScript source lives in `backend/src` and `frontend/src`; Prisma schema/migrations in `backend/prisma`. Follow existing conventions, handle async failures visibly, and test behaviour appropriate to the change.

Use [docs/deploy.md](docs/deploy.md) for production releases. The live backend is PM2 `production-management-api`, port 3000; nginx serves `/var/www/agent`. A build is not permission to deploy: follow the user's current authorisation. The 16 September release is explicitly authorised.

Never use `prisma migrate dev`, `migrate reset` or `db push` on the live database. Inspect migration status and SQL, back up, then use `migrate deploy`. Preserve the session table. Raw SQL is permitted when justified (reviewed migrations, locks and read-only diagnostics), not as an excuse to bypass validation.

Keep `.env`, token material, business exports, uploads and DB dumps out of git and tool output. Don't enable `GMAIL_RESYNC_CLEANUP` during routine work. Don't remove assets or operational data because an old audit called a table empty. Don't run broad dependency upgrades as part of an unrelated deployment.

## Change tracking

Update CHANGELOG with concrete behaviour, validation and remaining limitations. Update HANDOVER with current state and the next actionable step. For deployments, append a dated release record with source hashes, migration outcome, backup, endpoint/browser checks and external activation state. Preserve old history in the archive; don't rewrite historical tests or figures as if newly verified.

Company/legal branding remains BOND UN LIMITED trading as unlimited.bond. Use the existing branded PDF services; don't infer tax or FreeAgent behaviour from old aspirational briefs.
