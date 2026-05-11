# Budget Column Simplification Handover — 2026-05-11

## Built This Session

Targeted budget-table column restructure only. No email, calendar, files, receipts, productions, opportunities, or dashboard modules were intentionally changed.

## Model Change

Budget parent line items now use the lean commercial formula:

`QTY × DAYS × RATE × (1 + AGENCY% / 100) = ESTIMATED`

Example:

`2 × 3 × £1,000 × 1.20 = £7,200`

Removed from the model:
- `prepTravelDays`
- `shootDays`
- `multiplier`
- `otRate`
- `otHours`

Kept / added:
- `qty`
- `days`
- `rate`
- `agencyFeePercent`
- `unit`

`Flat Fee` lines force `days = 1`, so the formula becomes:

`QTY × RATE × (1 + AGENCY% / 100)`

## Backend

### Schema

Updated `BudgetLineItem` in `backend/prisma/schema.prisma`:
- Added `days Float @default(1)`.
- Set `agencyFeePercent Float? @default(0)`.
- Removed the old prep/shoot/multiplier/overtime fields.

Migration applied:
- `20260511153000_simplified_budget_line_columns`

Migration preserved existing data:
- `days = prepTravelDays + shootDays` when either old day field existed.
- If `multiplier != 1`, it was multiplied into `qty` to preserve estimated value.
- Legacy decimal agency values between `0` and `1` were converted to percentage points.
- Existing `estimatedTotal` and `variance` were recalculated with the new formula.

### Calculation Service

Updated `backend/src/services/budgetService.ts`:
- `calculateLineItem()` now uses only `qty`, `days`, `rate`, and `agencyFeePercent`.
- Line creation defaults to `qty: 1`, `days: 1`, `rate: 0`, `agencyFeePercent: 0`, `unit: "Days"`.
- Line PATCH accepts only the new editable financial fields.
- Template-applied lines now seed with `days: 1`.
- `Flat Fee` updates force `days: 1`.

### PDF Export

Updated `backend/src/services/budgetPdf.ts`:
- Removed Prep, Shoot, X, and OT columns.
- Internal PDF now shows Qty, Unit, Rate, Agy%, Estimated, Actuals, Remaining.
- Client PDF now shows Qty, Unit, Rate, Budget.

## Frontend

### Types

Updated `frontend/src/lib/types.ts`:
- `BudgetLineItem` now includes `days`.
- Removed old prep/shoot/multiplier/overtime fields.

### Budget Table

Updated `frontend/src/components/budgets/BudgetView.tsx`.

Internal columns are now:

`● | CODE | DESCRIPTION | CLIENT NOTES | INT. NOTES | QTY | UNIT | RATE | AGY% | ESTIMATED | ACTUALS | REMAINING | CLO`

Client columns are now:

`CODE | DESCRIPTION | CLIENT NOTES | QTY | UNIT | RATE | ESTIMATED`

Changes:
- Removed Prep, Shoot, X, OT Rate, and OT Hours from headers and rows.
- Removed the extra internal status-dot spacer column after Remaining.
- Cost line rows were remapped to the new grid and still only populate description/supplier/actuals/status/action areas.
- Section totals were remapped to Estimated, Actuals, Remaining only.
- Client view is clean: no dot column, no cost lines, no agency, no actuals.

### Unit / Days Cell

The Unit cell now carries both duration and unit:
- `3 Days ▾`
- `2 Cars ▾`
- `Flat Fee ▾`

Clicking the number edits `days`.
Clicking the unit label opens the custom dropdown.
Allowed units:
- Days
- Pcs
- Cars
- Drives
- Weeks
- Hours
- Flat Fee

### Agency and Formula Tooltip

- `AGY%` is editable inline.
- Non-zero agency percentages display amber.
- Estimated values show a hover tooltip with the calculation breakdown.
- Flat Fee tooltips omit the days multiplier.

## Verification

Completed:
- `cd backend && npx prisma format`
- `cd backend && npx prisma migrate deploy`
- `cd backend && npx prisma generate`
- `cd backend && npm run build`
- `cd frontend && npm run build`
- `cp -r frontend/dist/* /var/www/agent/`
- `pm2 reload 0 --update-env`
- `curl http://localhost:3000/api/health`

Health check returned:

`{"status":"ok","time":"2026-05-11T11:44:53.613Z"}`

PM2 notes:
- New process started successfully.
- Historical PM2 error log still contains old `BudgetRevision.version` Prisma errors and an IMAP timeout from earlier sessions.
- Current reload served `/api/health` OK.

## Known Issues / Technical Debt

- Browser smoke testing is still needed for the exact UI interactions:
  - inline days editing inside the Unit cell
  - Flat Fee hiding the days value
  - estimated tooltip placement
  - client view cleanliness
- Keyboard navigation remains the existing lightweight implementation; full spreadsheet-style row/down focus behavior is not deeply rebuilt in this pass.
- Section `...` menu is still not a full contextual menu.
- File picker integration for invoice/proof icons remains visual-only.
- Mobile bottom-sheet budget editor remains incomplete.

## Exact Next Step

Run the requested browser smoke test:

1. Open a production budget.
2. Add a new line item in section B.
3. Set description `Photographer`, QTY `2`, Days `3`, Rate `1000`, Agency `%` `20`.
4. Confirm Estimated shows `£7,200.00`.
5. Hover Estimated and confirm the tooltip shows the breakdown.
6. Change Agency to `0` and confirm Estimated becomes `£6,000.00`.
7. Change Unit to `Flat Fee` and confirm the days number disappears and the formula uses QTY × RATE.
8. Add a PO cost line and confirm it does not show QTY/UNIT/RATE cells.
9. Switch to Client view and confirm no agency, actuals, remaining, dots, badges, or cost lines are visible.

After that, continue the deeper production budget manager work when ready, before Phase 8 FreeAgent automation.
