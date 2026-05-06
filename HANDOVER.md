# Phase 5 Handover — Budgets, Bid Estimates, Catalog, and Revisions

## Built

### Backend Schema And Migration
- Added Phase 5 budget schema through Prisma migration `20260506180000_phase5_budgets_catalog_revisions`.
- Added `Budget`, `BudgetRevision`, `BudgetSection`, expanded `BudgetLineItem`, `LineItemInvoice`, `CatalogItem`, `CatalogGroup`, and `CatalogGroupItem`.
- Budgets can belong to either a Production or an Opportunity. The service enforces one parent only.
- Added `BudgetRevisionStatus` and `InvoiceStatus` enums.
- Added `Opportunity.budgets` and `JobFile.invoices` relations.
- Existing Phase 4 file metadata remains intact.

### Budget Service
- Added `backend/src/services/budgetService.ts`.
- Implemented:
  - `getOrCreateBudget`
  - `getRevision`
  - `createRevision`
  - `calculateRevisionTotals`
  - `syncProductionTotals`
  - `cloneBudgetToProduction`
  - `recalculateLineItem`
  - `insertCatalogItem`
  - `insertCatalogGroup`
- All totals are calculated server-side:
  - internal total
  - client total
  - production fee
  - client grand total
  - actual total
  - variance
  - over-budget flag
  - per-section totals
- Production `value` syncs to the current revision client grand total for production budgets.
- Opportunity Won flow now clones the opportunity bid budget into the new production and returns `budgetCloned`.

### Catalog
- Added `backend/src/services/aicp.ts` with all 16 AICP sections and the requested seed item list.
- Added `backend/src/services/catalogSeed.ts`; first app boot seeds the catalog if empty.
- Added `/api/catalog` routes:
  - List active items grouped by AICP section
  - Create/update/soft-delete/reorder items
  - List/create/update/delete groups
  - Add/remove items from groups

### Budget API
- Replaced budget placeholder routes with:
  - `GET /api/budgets/production/:productionId`
  - `GET /api/budgets/opportunity/:opportunityId`
  - `GET /api/budgets/:budgetId/revisions`
  - `GET /api/budgets/revisions/:revisionId`
  - `POST /api/budgets/:budgetId/revisions`
  - `PATCH /api/budgets/revisions/:revisionId`
  - `POST /api/budgets/revisions/:revisionId/sections/:sectionId/lines`
  - `POST /api/budgets/revisions/:revisionId/catalog-item`
  - `POST /api/budgets/revisions/:revisionId/catalog-group`
  - `PATCH /api/budgets/lines/:lineItemId`
  - `POST /api/budgets/lines/:lineItemId/duplicate`
  - `DELETE /api/budgets/lines/:lineItemId`
  - `PATCH /api/budgets/lines/:lineItemId/reorder`
  - `POST /api/budgets/lines/:lineItemId/invoices`
  - `PATCH /api/budgets/invoices/:invoiceId`
  - `DELETE /api/budgets/invoices/:invoiceId`
  - `POST /api/budgets/revisions/:revisionId/export-pdf`

### PDF Export
- Installed `pdfkit` and `@types/pdfkit`.
- Added `backend/src/services/budgetPdf.ts`.
- Client PDF excludes internal costs, actuals, and variance.
- Internal PDF includes internal/client/actual/variance data and an `INTERNAL` watermark.
- Export increments revision version and auto-files the PDF into the production job `Estimates/` folder via Phase 4 `autoFileDocument()`.
- Filename format is `YYNN_Estimate_R{revisionNumber}_V{version}_{client|internal}.pdf`.

### Full-Screen Budget UI
- Added `frontend/src/components/budgets/BudgetView.tsx`.
- Production Budget tab now navigates to `/productions?production=<id>&view=budget`.
- Opportunity Budget tab now navigates to `/opportunities?opportunity=<id>&view=budget`.
- Full-screen budget view includes:
  - top bar with back button, revision selector, internal/client toggle, export button
  - action bar with print, email placeholder, revision history, add line
  - pinned summary metrics
  - desktop stage indicator
  - AICP section table
  - internal and client column layouts
  - mobile compact rows
  - line item editor modal/bottom-sheet style view
  - catalog side panel
  - revision history sheet
  - desktop info/revision side panel
  - bottom totals bar
- The Production Overview tab now includes a budget summary row with an “Open budget” link.
- Production Budget tab summary is no longer a placeholder; it shows client estimate, actual spend, variance, warning state, and an open button.
- Opportunity detail now has Overview/Comms/Budget tabs, with Budget opening the full-screen bid view.
- Opportunity cards and list rows show current budget grand total when a budget exists.
- Refinement session fixed the budget table row controls and inline cell editing:
  - duplicate/delete icon clicks stop propagation and trigger the intended API calls
  - delete confirms before calling `DELETE /api/budgets/lines/:lineItemId`
  - duplicate calls `POST /api/budgets/lines/:lineItemId/duplicate`
  - description, internal rate, client rate, quantity, days, and unit are editable inline
  - inline editors are borderless/backgroundless and auto-save on blur
  - failed inline saves show a small top-right toast
  - Unit uses a custom lightweight dropdown instead of the native select
  - budget table spacing, section rows, summary bar, bottom totals bar, and right info panel were refined
  - budget-view variance display now shows under budget as green, over budget as red, and zero as muted `£0.00`

### Files Integration
- The Production Files preview panel now fetches the current production budget and populates the budget-line dropdown with real section/line/description options.
- Linking a file calls `PATCH /api/files/:fileId`.
- If the file is a receipt and has a parsed amount, linking it creates a pending `LineItemInvoice` against the selected budget line.

### Settings
- Added an Item Catalog section to Settings.
- Catalog Items view lists all 16 AICP sections, active items, add item controls, inline description/client rate edits, and soft delete.
- Line Item Groups view lists existing groups and item counts.
- Existing crew roles, storage info, and password settings remain.

## Decisions

- Budget screens are full-screen because the table cannot work inside the narrow production detail panel.
- The Budget tab still exists in detail panels, but clicking it opens the full-screen budget route.
- Server-side calculations are the source of truth; the frontend displays returned totals and does not calculate financial summaries.
- Monetary values are stored as `Float` in pounds, matching the Phase 5 prompt.
- AICP sections are seeded as data and also shared as constants for predictable section creation.
- PDF generation uses `pdfkit` only. No Puppeteer dependency was added.
- Revisions deep-copy sections and line items, but not invoices, so actuals start fresh on each revision.
- The Settings catalog manager is intentionally compact; it exposes the core create/edit/delete workflow without building a heavy drag UI yet.

## Verification

- `npx prisma migrate deploy` applied the Phase 5 migration.
- `npx prisma generate` completed.
- Backend build passes: `npm run build`.
- Frontend build passes: `npm run build`.
- PM2 API reloaded.
- Frontend build deployed to `/var/www/agent`.
- Live HTTPS smoke test 1:
  - Created disposable Production.
  - Created/get current budget.
  - Inserted a catalog item.
  - Exported client PDF.
  - Verified the PDF appeared in the job `Estimates/` folder tree.
  - Deleted file and disposable Production.
- Live HTTPS smoke test 2:
  - Created disposable Opportunity.
  - Created opportunity budget.
  - Inserted a catalog item.
  - Marked Opportunity Won.
  - Verified API returned `budgetCloned: true`.
  - Verified new Production budget contained the cloned line item.
  - Deleted disposable Production and Opportunity.
- Test cleanup completed:
  - Removed disposable job folders.
  - Reset Settings to `jobCodeYear: 2026`, `jobCodeSequence: 46`; next real job code remains `2647`.
- Budget UI refinement smoke test:
  - Created disposable Production.
  - Created a budget line.
  - Patched client rate, quantity, days, unit, and description.
  - Verified PATCH returned the updated line and updated revision totals.
  - Verified duplicate returned a second line and updated revision state.
  - Verified delete returned `204`.
  - Deleted disposable Production and folder.
  - Reset Settings to `jobCodeYear: 2026`, `jobCodeSequence: 46`; next real job code remains `2647`.

## Current Module State

### Dashboard
- Phase 2 and Phase 3 dashboard widgets remain.
- Production financial widgets now read live budget-derived production figures where budgets exist.

### Opportunities
- Opportunity CRUD and follow-ups remain.
- Won flow creates Production and now clones any active bid budget.
- Budget full-screen view is available from Opportunity detail.
- Kanban/list cards show current budget grand total if present.

### Productions
- Production CRUD, dates, crew, comms, files remain.
- Production financials are budget-aware.
- Budget full-screen view is available from Production detail.
- Budget PDFs auto-file to `Estimates/`.

### Files
- Phase 4 file system remains.
- File preview budget-line linking now uses real budget data.
- Receipt-to-invoice auto-create is prepared for Phase 7 parsed receipt metadata.

### Settings
- Account, crew roles, storage info remain.
- Item Catalog manager added.
- Group management is list-only in the UI for now; API supports full group mutation.

### Budgets
- Schema, service, API, full-screen budget shell, catalog insertion, line editing, revisions, invoice API, PDF export, and file linking are in place.
- The UI supports borderless inline cell editing, row duplicate/delete actions, and immediate server-returned total updates.
- Bulk select currently supports delete selected; move/duplicate selected is still technical debt.

### Email
- Still placeholder.
- “Email estimate” is a UI placeholder awaiting Phase 6 email composer/attachment support.

## Known Issues And Technical Debt

- Browser automation tooling is not installed, so I did not run Playwright screenshots at 390px. TypeScript production build passed, mobile-first classes were reviewed, and mobile rows use the same inline description edit path.
- The line item edit interaction is modal/full-screen rather than true inline expansion on desktop. The data flow is complete, but the interaction can be refined later.
- Invoice sub-panel UI per line item is not fully built yet, although invoice API routes exist.
- Catalog group insertion API exists, but the current catalog panel focuses on individual item insertion.
- Revision read-only historical viewing and “make current from old revision” are not fully surfaced in UI.
- PDF layout is functional and auto-filed, but visual polish can be improved before client use.
- The PM2 error log contains old session-table noise from earlier runs. Current HTTPS login and authenticated API calls work.
- Existing unrelated worktree changes remain untouched: deleted repo metadata/docs files and untracked `BRIEF.md` / `CLAUDE.md`.

## Commits

- `Build Phase 5 budget schema`
- `ab01212 Build Phase 5 budget service and APIs`
- `acb4b2a build Phase 5 full screen budget UI`
- `d9fc9c7 fix: inline cell editing and auto-save`

## Exact Next Step For Phase 6

Start Phase 6 with the Email Client:
1. Build real email account connection/configuration in Settings.
2. Implement inbox/thread list, message detail, and composer.
3. Support outbound email with the unlimited.bond signature.
4. Add linking of email threads/messages to Contacts, Opportunities, and Productions.
5. Make Production and Opportunity Comms tabs show linked email records from the real email client.
6. Wire “Email estimate” in the full-screen budget view to generate/export the client PDF, attach it, and open the composer addressed to the client contact.
