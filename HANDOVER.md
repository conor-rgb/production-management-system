# Budget Dot Status System Handover — 2026-05-11

## Built This Session

Targeted budget-table status rebuild plus the required SubCost PO/reference fields. No email, calendar, files UI, receipts UI, productions UI, opportunities UI, or dashboard UI changes were made intentionally.

## Backend

### Schema
- Added `poNumber String?` to `SubCost`.
- Added `freeAgentTransactionId String?` to `SubCost`.
- Migration applied:
  - `20260511143000_sub_cost_po_number_freeagent`
- The generated `DROP TABLE "pms_sessions"` was removed from the migration before applying.

### PO Number Generation
- `POST /api/budgets/lines/:lineItemId/subcosts` now auto-generates a PO number when `lineType === "PO"`.
- Format:
  - production budget: `PO-{jobCode}-{sequence}`
  - opportunity budget fallback: `PO-OPP-{sequence}`
- Sequence is counted per production budget when a production exists.
- Sequence is zero-padded to 3 digits.
- The generated number is stored on `SubCost.poNumber`.

### FreeAgent Reconciliation Field
- `freeAgentTransactionId` is present and available for Phase 8.
- It is currently null unless populated later by the FreeAgent bank-feed matching workflow.
- Frontend dot state already reads this field:
  - paid but unreconciled = light green
  - paid and reconciled = dark green

## Frontend

### Shared Budget Status Utility
- Added `frontend/src/components/budgets/budgetStatus.ts`.
- Exports:
  - `DotState`
  - `DOT_COLORS`
  - `STATE_BADGES`
  - `COST_LINE_BACKGROUNDS`
  - `getDotState(lineItem)`
- Dot state is derived on every render and is not stored.

### Dot States
- Yellow: no cost lines.
- Purple: at least one PO remains.
- Blue: at least one unpaid Bill remains.
- Light green: all cost lines are paid but at least one is not FreeAgent reconciled.
- Dark green: all cost lines are paid and FreeAgent reconciled.
- Gray: parent line is manually closed.

Priority logic:
- closed overrides everything
- no cost lines
- any PO
- any unpaid Bill
- all paid, then reconciled check

### Table Layout
- Removed the checkbox column entirely.
- Internal table now starts with a 24px dot column.
- Client view has no dot column.
- Parent rows render a single 10px status dot in the dot column.
- Cost line rows, section headers, and section total rows do not render dots.

### Parent Rows
- Parent row background is now clean white for all active states.
- State information lives only in the dot and inline badge.
- Closed rows:
  - gray dot
  - `closed` badge
  - opacity `0.55`
  - muted background
  - read-only cells
  - hidden cost-line add actions
- Reopening via CLO recalculates the state from cost lines.

### Status Badges
- Parent description column now shows a permanent inline badge:
  - `no cost lines`
  - `PO raised`
  - `invoice in`
  - `paid · unreconciled`
  - `reconciled`
  - `closed`
- Badges use the color map from `budgetStatus.ts`.
- Badges are hidden in Client view.

### Cost Line Rows
- Cost lines do not have dots.
- Cost line rows use type background tints:
  - PO: light purple
  - Bill: light blue
  - Receipt: light green
  - reconciled Receipt: darker green
- Cost line row now places:
  - empty dot column
  - empty code column
  - connector / type pill / PO number or invoice reference / description in the description area
  - supplier in the client-notes column
  - amount in Actuals
  - AGR / INV / PAID status controls right of amount
  - file/proof/delete controls at far right
- PO number is displayed prominently when present.
- Bill invoice reference uses `invoiceNumber` when present.

### Expansion
- Cost lines are hidden by default.
- Purple and Blue parent rows auto-expand because they need attention.
- Yellow, Light Green, Dark Green, and Gray rows start collapsed.
- Chevron toggles expansion and stops propagation.
- The “No cost lines yet” prompt only appears on hover of Yellow rows.

### Section Headers
- Section headers show up to 10 line-state dots.
- Dots use `DOT_COLORS[getDotState(line)]`.
- Additional line items show as `+N`.
- Section menu button still stops propagation.

### Summary Bar
- Secondary summary row now counts:
  - Yellow: `N need POs`
  - Purple: `N POs outstanding`
  - Blue: `N invoices to pay`
  - Light green: `N unreconciled`
- Counts only show when greater than zero.
- If there are no open counts, shows `All lines reconciled ✓`.

### Client View
- No dot column.
- No status badges.
- No cost line rows.
- No state tints.
- No internal status columns.

## Verification

- Prisma migration applied:
  - `npx prisma migrate deploy`
- Prisma Client regenerated:
  - `npx prisma generate`
- Backend build passed:
  - `cd backend && npm run build`
- Frontend build passed:
  - `cd frontend && npm run build`
- Frontend copied to:
  - `/var/www/agent`
- PM2 reloaded:
  - `pm2 reload 0 --update-env`
- Health check passed:
  - `curl http://localhost:3000/api/health`
- Data sanity check confirmed `SubCost.poNumber` and `SubCost.freeAgentTransactionId` are queryable.

## Known Issues / Technical Debt

- Existing PO rows created before this migration do not automatically have `poNumber`; new POs will.
- Browser/manual smoke testing is still needed for the exact dot transitions.
- Section `...` menu is still not a full contextual menu.
- File picker integration for invoice/proof icons remains visual-only.
- Mobile bottom-sheet budget editor remains incomplete.
- FreeAgent reconciliation is not implemented yet; `freeAgentTransactionId` is reserved for Phase 8.
- PM2 error log still contains old historical Prisma `BudgetRevision.version` entries from previous sessions; current health check is OK.

## Exact Next Step

Run the requested browser smoke test:
1. Open a production budget.
2. Confirm empty lines show yellow dot and `no cost lines`.
3. Add a PO to B.1 and confirm purple dot, purple cost-line tint, and generated PO number.
4. Add a second PO and confirm the next zero-padded sequence.
5. Change one PO to Bill and confirm dot remains purple if another PO remains.
6. Change all POs to Bills and confirm the dot turns blue.
7. Mark all Bills paid and confirm the dot turns light green.
8. Toggle CLO on another line and confirm gray dot and faded row.
9. Confirm section header dots and summary counts update.
10. Switch to Client view and confirm no dots, badges, or cost-line rows appear.

Then continue the deeper project/budget production management pass before Phase 8 FreeAgent automation.
