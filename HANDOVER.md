# Phase 5 Handover — Budget Financial Stack And Purchase Orders

## Built This Session

### Schema And Migration
- Added Prisma migration `20260506200000_budget_purchase_orders_financial_stack`.
- Added `PurchaseOrderStatus` enum:
  - `OPEN`
  - `INVOICED`
  - `PAID`
- Added `PurchaseOrder` model:
  - linked to `BudgetLineItem`
  - linked to `Production`
  - optional linked invoice file through `JobFile`
  - PO number, supplier, description, agreed amount, status, invoice metadata, notes, timestamps
- Added `Production.lastPoSequence` for per-job PO numbering.
- Added `BudgetLineItem.marginAmount`, `marginPercent`, and `isClosed`.
- Added `BudgetLineItem.purchaseOrders`.
- Added `Production.purchaseOrders`.
- Added `JobFile.purchaseOrderInvoices`.

### Backend Financial Logic
- Rebuilt `budgetService` calculations around two modes:
  - bidding mode when budget has `opportunityId`
  - production mode when budget has `productionId`
- `recalculateLineItem` now stores:
  - `internalSubtotal`
  - `clientSubtotal`
  - `marginAmount`
  - `marginPercent`
  - legacy `variance` for compatibility
- Bidding-mode totals now return:
  - internal total
  - client total
  - production fee
  - client grand total
  - total margin amount
  - total margin percent
  - section margin totals
- Production-mode totals now return:
  - client grand total
  - accrual held
  - total POs
  - total pending invoices
  - total paid invoices
  - total committed
  - total remaining accrual
  - projected margin and percent
  - over-accrual and over-budget flags
  - per-line computed PO/accrual stack
- Closed lines:
  - keep paid invoices as committed
  - release remaining accrual back to projected margin
  - report remaining accrual as zero
- `cloneBudgetToProduction` preserves bid margin and accrual baseline while copying no POs or invoices.
- Added `generatePoNumber(productionId)` with format `PO-YYNN-NNN`.
- `syncProductionTotals` still persists `Production.value = clientGrandTotal`; production list/dashboard financials now derive committed spend and accrual remaining live from budget records.

### Purchase Order API
- Added:
  - `GET /api/budgets/lines/:lineItemId/pos`
  - `POST /api/budgets/lines/:lineItemId/pos`
  - `PATCH /api/budgets/pos/:poId`
  - `DELETE /api/budgets/pos/:poId`
- POST auto-generates PO number from the production job code and per-production sequence.
- DELETE only allows Open POs.
- PO create/update/delete syncs production totals.
- Invoice create/update/delete now syncs production totals.
- Existing `GET /api/budgets/revisions/:revisionId`, production budget, and opportunity budget responses include the new mode-aware totals and line-level financial stack.

### Frontend Budget UI
- Updated shared TypeScript budget types for:
  - purchase orders
  - mode-aware totals
  - stored margins
  - line-level accrual/PO stack
  - closed lines
- Full-screen budget now renders different internal columns by mode:
  - Opportunity/bidding: internal/client costs and margin columns.
  - Production: client value, accrual, POs, invoiced, paid, remaining, margin.
- Summary bar now changes by mode:
  - Bidding: client estimate, internal cost, total margin, margin percent.
  - Production: client value, accrual held, committed, remaining, projected margin.
- Bottom totals bar now changes by mode.
- Production rows show accrual/commitment status via left border color.
- Closed lines render muted with strikethrough description.
- Added production-mode PO panel per line:
  - lists POs
  - add/edit form
  - status changes
  - delete for Open POs only
  - PO totals footer
  - financial stack summary
- Added close-line prompt for settled lines and close action.
- Receipt-created line item invoices now default to `PAID`, so Phase 7 receipts will count immediately toward paid spend.

## Existing Phase 5 State

- Budget schema, revisions, AICP sections, catalog, PDF export, full-screen budget shell, files integration, and settings catalog manager remain in place.
- Opportunity Won flow creates a Production and clones the active opportunity budget.
- Budget PDFs still auto-file to the job `Estimates/` folder.
- Production and Opportunity detail panels still navigate to the full-screen budget route.

## Verification

- Prisma migration applied successfully with `npx prisma migrate deploy`.
- Prisma Client regenerated.
- Backend build passes: `npm run build`.
- Frontend build passes: `npm run build`.
- PM2 API reloaded.
- Frontend build deployed to `/var/www/agent`.
- Live HTTPS smoke test completed:
  - Created disposable Production.
  - Created production budget line with £100 internal / £200 client.
  - Created PO and verified `PO-2647-001`.
  - Added pending invoice and paid invoice.
  - Verified revision stack:
    - mode `production`
    - total committed `£90.00`
    - remaining accrual `£10.00`
    - total POs `£60.00`
    - pending invoiced `£20.00`
    - paid `£10.00`
    - line margin `£100.00`
  - Verified Open PO deletion returns `204`.
  - Created another PO, moved it to Paid, then closed the line.
  - Verified closed line reports committed paid-only spend and zero remaining accrual.
  - Deleted disposable Production and folder.
  - Reset Settings to `jobCodeYear: 2026`, `jobCodeSequence: 46`; next real job code remains `2647`.

## Current Module State

### Dashboard
- Phase 2 and Phase 3 dashboard widgets remain.
- Active production widget financials now reflect committed spend and accrual remaining rather than paid receipts only.

### Opportunities
- Opportunity CRUD and Won flow remain.
- Opportunity budgets are now bidding-mode budgets with margin totals and no accrual/actual stack.

### Productions
- Production CRUD, dates, crew, comms, files remain.
- Production budgets now have accrual, PO, invoiced, paid, remaining, projected margin, and closed-line logic.
- Production cards/list financials are budget-aware and committed-spend aware.

### Files
- Phase 4 file system remains.
- Budget line linking remains.
- Receipt-created invoices now default to Paid.
- Invoice-file linking for POs has backend support; frontend form field is still light and does not yet populate real receipt files.

### Settings
- Account, crew roles, storage info, and item catalog manager remain.

### Budgets
- Bidding and production modes are distinguished by budget owner, not hardcoded screen state.
- All core financial calculations are server-side.
- PO creation and edit workflows are in the production budget UI.
- Close-line behavior is implemented.

### Email
- Still placeholder.
- “Email estimate” remains a placeholder for Phase 6 composer integration.

## Decisions

- Used `Production.lastPoSequence` instead of a JSON sequence map because PO sequence is strictly per production.
- Kept `Production.actualSpend` and `Production.variance` as computed API fields rather than adding stored columns, matching the existing Phase 3/5 architecture.
- Production-mode `totalPOs` counts all non-closed PO agreed amounts. Pending and paid invoices are tracked separately from PO status.
- Closed lines count paid invoices only and release unspent accrual back into projected margin.
- The PO panel is intentionally compact and built into the existing budget table rather than adding a new module.

## Known Issues And Technical Debt

- Margin bug fix completed after the financial stack work:
  - Budget API now derives line margin from `clientSubtotal - internalSubtotal` before returning revisions, so stale stored zero values cannot leak into the UI.
  - Section totals now calculate `marginAmount` as the sum of derived line margins and `marginPercent` as `sectionMarginAmount / sectionClientSubtotal * 100`.
  - Existing stored budget line margins were backfilled; 2 of 10 rows were corrected.
  - Frontend margin colors are consistent: positive green, zero muted gray, negative red.
  - Smoke test through `GET /api/budgets/revisions/:revisionId` confirmed a `Pre-production days` line at £300 internal and £350 client returns `marginAmount: 50` and `marginPercent: 14.285714285714285`, with the section total matching.
- Browser automation tooling is not installed, so I did not run Playwright screenshots at 390px. TypeScript production builds passed and mobile-first layouts were reviewed.
- PO invoice-file dropdown is not fully populated from job receipts yet; backend fields are ready.
- Invoice sub-panel remains lighter than the PO panel.
- Bulk select still only supports delete selected.
- PDF export still uses the earlier Phase 5 layout and has not been visually redesigned for the new PO/accrual stack.
- Existing unrelated worktree changes remain untouched: deleted repo metadata/docs files and untracked `BRIEF.md` / `CLAUDE.md`.

## Commits

- `fb0c289 add purchase order financial schema`
- `6d3ddc0 update budget financial stack logic`
- `4e2aff4 update budget modes and purchase order UI`
- `fix: budget margin calculations and colors`

## Exact Next Step For Phase 6

Start Phase 6 with the Email Client:
1. Build real email account connection/configuration in Settings.
2. Implement inbox/thread list, message detail, and composer.
3. Support outbound email with the unlimited.bond signature.
4. Add linking of email threads/messages to Contacts, Opportunities, and Productions.
5. Make Production and Opportunity Comms tabs show linked email records from the real email client.
6. Wire “Email estimate” in the full-screen budget view to generate/export the client PDF, attach it, and open the composer addressed to the client contact.
