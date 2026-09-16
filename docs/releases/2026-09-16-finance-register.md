# Finance register release — 16 September 2026

Status: **deployed and live-verified** at 2026-09-16T13:00:47.156Z. The user authorised work on budgets, invoices and reconciliation and selected French Hair Lab as the pilot. No in-app AI was requested.

## Delivered scope

Project Costs now exposes Estimate, Live costs, Invoices and Reconcile. Independent supplier commitments, invoices, net allocations and recorded gross payments preserve estimate revision history. Invoice correction and payment reversal retain an audit history. The Finance index shows separately labelled register forecast/balance. Details and limits: [implementation](../production-hub/FINANCE-IMPLEMENTATION.md).

## Validation

- Backend/frontend builds and targeted frontend lint.
- Prisma schema validation; only `20260916140000_project_finance_ledger` pending at preflight (72 earlier migrations applied).
- Isolated PostgreSQL test applies the actual additive migration to the prior schema.
- Integer amounts, request retry deduplication, duplicate invoice prevention, currency validation, project/supplier allocation boundaries, complete allocation before approval, stale/concurrent updates, partial payments, reversals, split/multiple invoices, summary/detail agreement and unchanged approved estimate fixtures.
- Browser test exercises cost → invoice → allocation → approval → partial payment → reload → reconciliation, mobile width and zero runtime errors.
- Existing Finance/Drive browser regression passes.

## Pilot and limits

French Hair Lab is a GBP draft estimate with zero supplier SubCost rows in its current revision. Read-only inspection only; no real commitments, invoices, payments or folder links were created. The app job code differs from its apparent Drive folder and remains unresolved.

This is a supplier register pilot. Existing PO/receipt workflows are not migrated or automatically linked. Credit notes, FX, client receipts, multi-invoice payment allocations and full approved-revenue/margin/close reporting remain outstanding. No financial-close claim is made from an empty exception list.

## Deployment evidence

- Release `20260916T125527Z`; source SHA-256 `fda1df941a01b0086867a3f35230a57c08aecd73405ad3a9cb15c92f6645b97e` across 195 source/config/migration files. [Source manifest](2026-09-16-finance-source-manifest.json).
- Protected pre-deployment backup: `/srv/backups/production-management-system/20260916T125527Z-finance-register`. Custom PostgreSQL dump verified with pg_restore; temporary test schemas excluded. Source/disk snapshot, private environment, nginx config and exact served frontend retained. Existing operational assets remain in place. The source/disk snapshot follows local builds; it does not reconstruct previously loaded PM2 JavaScript. The earlier Drive release snapshot remains available for compatible rollback.
- Applied only `20260916140000_project_finance_ledger`; all 73 migrations now applied. Reloaded PM2, verified local health, atomically published frontend index and saved PM2 configuration.
- [Live checks](2026-09-16-finance-live-check.json): authenticated summary/register APIs, Home, Finance, Files, French Hair Lab cost views/editor opening and mobile width passed; zero browser runtime errors. No form was submitted to live financial endpoints.
- Pilot register response: 281 bytes / 45 ms in one observed request. This is an empty-register observation, not a large-job performance benchmark. Unauthenticated finance requests returned 401. Drive remained connected.
- No Git commit/push: shared checkout contains pre-existing work. Historical docs and earlier release records remain preserved.

## Next pilot step

Review and enter a real French Hair Lab commitment/invoice, compare amounts against its accepted source and record a real payment only with payment evidence. Then integrate existing POs/receipts and reviewed legacy migration. Keep credits, FX and client receipts outside the claimed completion scope until their own records and controls exist.
