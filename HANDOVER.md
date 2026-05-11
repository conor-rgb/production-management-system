# Budget Cost Line Model Handover — 2026-05-11

## Built This Session

Targeted budget cost-line model fixes only. No email, calendar, files UI, production UI, opportunity UI, or dashboard UI changes were made intentionally.

## Backend

### Schema
- Added `SubCostLineType` enum:
  - `PO`
  - `BILL`
  - `RECEIPT`
- Added `lineType SubCostLineType @default(PO)` to `SubCost`.
- Migration applied:
  - `20260511133000_sub_cost_line_type`
- The generated `DROP TABLE "pms_sessions"` was removed from the migration before apply.
- Existing receipt-linked cost lines were updated to `RECEIPT`, `PAID`, `isAgreed=true`, `isInvoiced=true`, `isPaid=true`.

### Budget Service
- Updated actuals calculation so every cost line contributes to parent actuals immediately, regardless of lifecycle status.
- Parent `actualTotal` now equals the sum of all cost-line `amount` values.
- Parent `variance` continues to represent remaining budget:
  - `estimatedTotal - actualTotal`

### Budget Routes
- `POST /api/budgets/lines/:lineItemId/subcosts` now accepts `lineType`.
- Lifecycle defaults:
  - `PO`: `isAgreed=false`, `isInvoiced=false`, `isPaid=false`, `status=PENDING`
  - `BILL`: `isInvoiced=true`, `isAgreed=false`, `isPaid=false`, `status=INVOICED`
  - `RECEIPT`: `isAgreed=true`, `isInvoiced=true`, `isPaid=true`, `status=PAID`
- `PATCH /api/budgets/subcosts/:subCostId` accepts `lineType`.
- Changing a cost line to `BILL` auto-sets invoiced.
- Changing a cost line to `RECEIPT` auto-sets agreed, invoiced, and paid.
- `DELETE /api/budgets/subcosts/:subCostId` now returns the updated revision instead of forcing the frontend to reload.

### Receipt Integration
- Receipt assignment now creates `SubCost` records with `lineType=RECEIPT`.
- Receipt-created cost lines are auto-agreed, auto-invoiced, and auto-paid.

## Frontend Budget Table

### Terminology
- User-facing budget table text now uses:
  - `PO`
  - `Bill`
  - `Receipt`
  - `Cost line`
- Removed user-facing “sub-cost” wording from the budget table.

### Parent Rows
- Parent line items now behave as estimated budget pots.
- Parent rows show:
  - Estimated
  - Actuals
  - Remaining
  - three small status dots
  - CLO only
- Removed parent AGR / INV / PAID cells.
- CLO is manually toggleable and uses the tooltip:
  - `Close this line when fully settled`
- Status dots:
  - blue: has PO cost line
  - amber: has Bill cost line
  - green: all cost lines paid
  - muted gray: not present

### Cost Line Rows
- Cost lines render as indented rows directly beneath parent lines.
- Cost line rows include:
  - connector or camera icon for receipt-captured rows
  - tappable `PO` / `BILL` / `RECEIPT` type pill
  - description
  - supplier
  - amount ex-VAT in Actuals
  - AGR
  - INV
  - PAID
  - invoice file indicator
  - proof-of-payment indicator
  - delete
- VAT and gross amount are no longer displayed in the table.
- TYPE pill colors:
  - PO: blue
  - BILL: amber
  - RECEIPT: green
- TYPE pill dropdown changes `lineType` and lets the backend apply lifecycle defaults.

### Adding Cost Lines
- Parent row hover actions now show:
  - `+ PO`
  - `+ BILL`
  - `+ RECEIPT`
  - duplicate
  - delete
- Each add button opens an inline cost-line form preselected to that type.
- Empty parent rows show:
  - `No cost lines yet — [+ PO] [+ BILL] [+ RECEIPT]`
- Saving a cost line posts `{ lineType, description, supplierName, amount }`.

### Remaining / Zero Styling
- Remaining color logic:
  - positive: green
  - under 20% of estimated: amber
  - zero: muted gray
  - negative: red
- Zero monetary/numeric cells remain muted.

## Verification

- Prisma migration applied:
  - `npx prisma migrate deploy`
- Prisma Client regenerated:
  - `npx prisma generate`
- Backend build passed:
  - `cd backend && npm run build`
- Frontend build passed:
  - `cd frontend && npm run build`
- Frontend bundle copied to:
  - `/var/www/agent`
- PM2 reloaded:
  - `pm2 reload 0 --update-env`
- Health check passed:
  - `curl http://localhost:3000/api/health`
- Existing receipt-linked cost lines were corrected to `RECEIPT`.

## Known Issues / Technical Debt

- Browser/manual interaction testing is still needed for the exact hover/dropdown workflow.
- Section `...` menu is still not a full contextual menu. It stops collapse propagation, but Add PO/Bill/Receipt via section menu is not fully implemented.
- File picker integration for invoice and proof-of-payment icons is still visual-only in this budget table.
- Mobile bottom-sheet budget editor is not fully implemented yet.
- PM2 error log still contains old historical Prisma `BudgetRevision.version` errors from before the earlier Prisma client regeneration; current health check is OK.

## Exact Next Step

Run the requested browser smoke test:
1. Open a production budget.
2. Hover parent line A.1 and confirm `+ PO`, `+ BILL`, `+ RECEIPT` appear.
3. Add a PO for `Kate Martin fee`, supplier `Kate Martin`, amount `500`.
4. Confirm PO row is blue and parent Actuals/Remaining update.
5. Change the PO type pill to BILL and confirm INV becomes checked.
6. Add a Receipt for amount `180` and confirm the receipt row is green with AGR/INV/PAID checked.
7. Confirm no VAT amount appears in the table.
8. Toggle parent CLO.
9. Confirm positive remaining is green and zero values are muted.

Then continue the deeper project/budget production management pass before Phase 8 FreeAgent automation.
