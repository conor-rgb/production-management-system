# API route reference

Updated 16 September 2026 from `backend/src/server.ts` and nested route mounts. The [original inventory](../archive/2026-09-16-before-direction-reset/docs/rebuild-audit/API_ROUTES.md) is retained.

Protected groups: auth/me, dashboard, opportunities, productions, budgets, contacts, companies, files, drive, email, receipts, calendar, project-actions, production-workbooks, settings and options. Public surfaces are health, login/logout, public options/supplier-onboarding/selects and the existing email Google callback. Drive callbacks require a signed-in session and validate OAuth state, including when dispatched through the shared email callback. `/api/drive/oauth/callback` remains an optional dedicated route.

## Current additions and corrected inventory

- `GET /api/productions/summary`: slim project/index contract; does not return message bodies, files or budget line graphs.
- `GET /api/project-actions`: global/per-project action list used by Home and Actions.
- `/api/drive`: connection state, OAuth, root folders, project link/create-folder/browse/publish. See [Drive API details](../production-hub/DRIVE-IMPLEMENTATION.md).
- `/api/production-workbooks`: mounted transitional workbook API, not a future-only feature.
- `/api/productions/:id/selects`: authenticated selects routes are mounted inside productions. The July statement that selects.ts was unmounted is obsolete.
- File preview/download use Drive for SYNCED records and local files for unpublished records. Published/queued local rename/move/delete is blocked.

Existing groups retain enquiry/production/crew/dates, budget revisions/lines/subcosts/POs, Blackbook/options, email/drafts, receipts, calendar, supplier onboarding, selects and settings workflows. These routes are not proof of a separate invoice/payment ledger or complete FreeAgent integration.

Generate a fresh inventory when changing routes: `rg -n 'router\.(get|post|patch|put|delete)|app\.(get|post|use)' backend/src/routes backend/src/server.ts`. Verify nested mounts as well as server.ts. `catalog.ts` remains outside the mounted route surface.

## Supplier finance pilot

Session-protected `/api/project-finance` exposes cross-project summaries, `/:productionId` register reads and `/:productionId/actions/:action` mutations. Read-only GETs, transaction locks, request deduplication, record versions and audit history protect the independent supplier register. See [finance implementation](../production-hub/FINANCE-IMPLEMENTATION.md).

## New-project workflow extension

Authenticated `/api/project-workspace` creates templated projects and exposes estimate save/approve/version actions, client exports and Drive setup retry. `/api/project-finance/:productionId/drive-inbox` lists the mapped invoice folder. Details and constraints: [new project workflow](../production-hub/NEW-PROJECT-WORKFLOW.md).

## Supplier PO actions

The authenticated finance action endpoint accepts `po.create`, `po.update`, `po.issue`, `po.cancel` and `po.retry-document`. `GET /api/project-finance/:productionId/purchase-orders/:id/preview` renders a draft-only PDF without filing or messaging. Legacy PO mutations reject finance-managed IDs. [PO workflow](../production-hub/PURCHASE-ORDER-WORKFLOW.md).

## Client billing extension — 16 September 2026

Authenticated project-finance actions now include client.create/update/issue/void/receipt/reverse/retry-document. GET /api/project-finance/:productionId/client-invoices/:id/preview renders a draft-only PDF. Register and summary reads include separate client balances; shared idempotence, project locking and version checks apply. See [workflow](../production-hub/CLIENT-BILLING-WORKFLOW.md).

## Client credits — 16 September 2026

Project finance adds client.credit, client.replacement and client.refund actions. Existing client.update/issue/void/preview/document retry support credit drafts; client.reverse corrects either cash direction. Credits use existing authenticated routes and project locks; original IDs are scoped to the current project. Read totals include credited net and separate refund-due gross. See [workflow](../production-hub/CLIENT-CREDIT-WORKFLOW.md).

## Supplier reconciliation — 16 September 2026

Authenticated GET /api/project-finance/:productionId/reconciliation performs explicit ledger/Drive final-review checks. Invoice create/update accepts credit drafts with originalInvoiceId; allocation/approval enforce original net/tax/cost caps. New invoice.review and payment.refund actions retain audit history. Register reads expose duplicate/PO variance flags and separate refunds due. See [workflow](../production-hub/SUPPLIER-RECONCILIATION.md).
