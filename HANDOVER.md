# Budget Module Rebuild Handover — 2026-05-11

## Built This Session

Replaced the old AICP/PO/accrual budget module with a new commercial production estimate and actuals system.

### Backend Schema
- Removed the active old budget schema:
  - `LineItemInvoice`
  - `PurchaseOrder`
  - old AICP catalog tables
  - old budget line item financial columns
- Added the new budget schema:
  - `Budget`
  - `BudgetRevision`
  - `BudgetSection`
  - `BudgetLineItem`
  - `SubCost`
  - `AdvanceInvoice`
  - `SectionTemplate`
- Added enums:
  - `BudgetStatus`
  - `RevisionStatus`
  - `SubCostStatus`
  - `AdvanceCalcType`
- Added `Production.actualSpend` and `Production.variance` for synced budget financials.
- Kept `JobFile.linkedBudgetLineId` and `ReceiptCapture.lineItemId` connected to the new `BudgetLineItem`.
- Added `JobFile` relations for `SubCost` invoice files and proof-of-payment files.
- Migration applied:
  - `20260511120000_budget_rebuild`
  - The generated unrelated `DROP TABLE "pms_sessions"` was removed before deployment.
- Prisma Client regenerated successfully.

### Backend Services
- Replaced `backend/src/services/budgetService.ts`.
- New calculations:
  - Line estimate: `(prepTravelDays + shootDays) x rate x multiplier + overtime`, with optional agency fee.
  - Section totals: estimated, actual, variance, remaining, agreed/invoiced/paid/closed counts.
  - Revision totals: subtotal, production fee, insurance, grand total, actuals, variance, secondary currency conversion, advance calculations.
  - Actuals from `SubCost` records with statuses `AGREED`, `INVOICED`, or `PAID`.
- Added budget creation for production and opportunity records.
- Added revision deep-copy flow.
- Added template application flow that replaces revision sections with template sections and zero-rate checklist line items.
- Added production total syncing from the new budget totals.
- Added opportunity-to-production budget cloning for Won opportunities.
- Added default section template seeding on startup:
  - Photo Shoot
  - Motion / Video
  - Event

### Backend Routes
- Replaced `backend/src/routes/budgets.ts` under `/api/budgets`.
- Implemented endpoints for:
  - production/opportunity budget get-or-create
  - budget-level field updates
  - revision list/create/update/read
  - section add/update/delete/reorder/template apply
  - line item create/update/delete/duplicate/reorder/sub-item
  - sub-cost create/update/delete/status update
  - advance invoice create/update/delete/list
  - section templates list/create/delete
  - PDF export
- Removed active `/api/catalog` mount from the app.
- Left `/api/catalog` as a compile-safe legacy route returning `410 Gone`.

### PDF Export
- Rebuilt `backend/src/services/budgetPdf.ts` using `pdfkit`.
- Client PDF now uses:
  - cover page
  - project details
  - firm bid summary
  - comments
  - confirmation signature blocks
  - detailed section pages
  - final summary
- Internal PDF adds internal columns and watermark.
- Production budgets still auto-file PDFs into the production `Estimates/` folder.
- Opportunity budget PDFs return generated PDF metadata/base64 because opportunities do not have a production file folder.

### Non-Budget Integrations Updated
- Receipts now create `SubCost` records instead of `LineItemInvoice`.
  - Receipt assignment uses the net ex-VAT parsed amount first.
  - Receipt files still link to the selected budget line.
  - Production totals are synced after receipt assignment.
- File preview budget-line linking now creates a receipt `SubCost` instead of posting to the removed invoice endpoint.
- Production and Dashboard financial summaries now read `estimatedTotal`, `actualTotal`, production fee, and insurance from the new budget shape.
- Opportunity list budget total enrichment now uses the new `grandTotal`.
- Settings startup seeding now calls `seedSectionTemplates()` instead of the removed catalog seed.

### Frontend
- Replaced `frontend/src/components/budgets/BudgetView.tsx`.
- New full-screen spreadsheet budget UI includes:
  - top navigation with revision selector, status pill, internal/client toggle, PDF export
  - action bar
  - pinned summary bar with subtotal, production fee, insurance, grand total, advance due
  - template picker for empty revisions
  - internal spreadsheet columns for notes, prep/travel, shoot, qty, rate, multiplier, unit, overtime, agency fee, estimated, actuals, variance, statuses
  - client spreadsheet columns for description, client notes, qty, rate, multiplier, unit, budget
  - dark section headers
  - inline editing on cells with blur-save
  - line duplication/deletion
  - sub-items
  - sub-cost panel per line item
  - cover page panel
  - advance invoice panel
  - section template panel
- Updated frontend budget types in `frontend/src/lib/types.ts`.
- Replaced Settings item catalog display with a read-only Budget Templates section showing seeded templates and their sections.
- Updated file browser receipt budget-line linking to post `SubCost` records.

## Decisions Made

- Existing AICP catalog tables were removed from active schema because the new brief replaces the catalog with production section templates.
- `SectionTemplate.sections` stores the template sections and default line item checklist as JSON so templates can vary freely by job type.
- `SubCost` is the single actuals model for invoices, receipts, expenses, and proof-of-payment links.
- The old production PO sequence remains removed from active budget behavior. Future PO behavior should be rebuilt as a sub-cost workflow if needed.
- Opportunity PDFs cannot auto-file until the opportunity becomes a production, because the filesystem is production-folder based.
- The new frontend is a functional spreadsheet-first rebuild, but not every requested polish detail is complete yet.

## Current State By Module

### Budgets
- New schema, services, routes, PDF export, templates, frontend table, sub-costs, advances, and cover fields are deployed.
- Existing old budget data was structurally migrated where columns overlapped, but old PO/invoice/catalog data was dropped by design.
- Default templates are seeded in the database.

### Receipts
- Receipt capture still works.
- Assignment now creates a paid `SubCost`.
- Receipt-created actuals contribute to line actuals and production totals through the new service.

### Files
- File browser still links files to budget lines.
- Receipt files linked to a budget line now create a `SubCost`.
- Mail attachment and preview behavior remains unchanged.

### Productions
- Production list/detail financials now calculate from new budget totals.
- Production value, actual spend, and variance can be synced from the new budget.

### Opportunities
- Opportunity list shows new budget grand total where available.
- Won opportunity flow still clones the opportunity budget into the new production budget shape.

### Settings
- Budget Templates section shows the seeded templates.
- Full custom template editor is not yet built.

## Verification

- Prisma schema validated.
- Migration applied successfully:
  - `20260511120000_budget_rebuild`
- Prisma Client regenerated.
- Backend build passes:
  - `cd backend && npm run build`
- Frontend build passes:
  - `cd frontend && npm run build`
- Frontend bundle copied to `/var/www/agent`.
- PM2 reloaded:
  - `pm2 reload 0 --update-env`
- Health check passes:
  - `curl http://localhost:3000/api/health`
- Section template seed verified:
  - `3` templates in `pms_section_templates`.

## Known Issues / Technical Debt

- The frontend budget table is functional but still needs deeper spreadsheet polish:
  - true tab-to-next-cell navigation
  - enter-to-next-row behavior
  - drag reorder
  - section manager modal
  - mobile bottom-sheet detail editor
  - inline save flash and toast refinements
- Settings has a read-only template list, not the full custom template manager.
- PDF layout matches the requested commercial structure at a first-pass level; it should be visually reviewed against the JHP sheet before client use.
- Opportunity PDF export returns generated data rather than filing to disk because opportunities have no job folder.
- Browser screenshot testing at 390px was not run; TypeScript production builds passed.
- Existing PM2 logs still contain earlier pre-reload Prisma errors about the removed `BudgetRevision.version` column. Those were from the old running process after migration and before reload.
- Google Calendar still logs existing scope warnings from the prior calendar phase; unrelated to this budget rebuild.

## Exact Next Step

Before Phase 8, do one focused budget hardening pass:
1. Open one production budget and one opportunity budget in the browser.
2. Apply each seeded template once and verify sections/line items appear.
3. Edit rate/qty/multiplier/prep/shoot cells and confirm estimated totals update.
4. Add a sub-cost and confirm actuals, variance, section totals, summary totals, and production summary update.
5. Export client and internal PDFs and compare visually against the JHP reference.

Then proceed to Phase 8 FreeAgent + Automations.
