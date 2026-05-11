# Budget Table Interaction Handover — 2026-05-11

## Latest Cost Line Lifecycle Fix

Cleaned up cost-line status display so POs are not shown as payable.

Changed in `frontend/src/components/budgets/BudgetView.tsx`:
- Removed the AGR / INV / PAID triple indicators from cost lines.
- PO cost lines now show `+ Bill` in the lifecycle column.
- Clicking `+ Bill` converts the cost line to `BILL` using the existing PATCH path.
- Bill cost lines show a single paid toggle:
  - `○ Paid`
  - `Paid ✓`
- Receipt cost lines show locked `Paid ✓`.
- Actuals column now only shows the cost amount.
- Paid Bill rows now turn green.
- Clicking `Paid ✓` on a Bill toggles it back to unpaid and returns the row to blue.
- Summary `invoices to pay` now counts unpaid Bill cost lines directly.
- Marking a Bill paid decrements the invoice count; marking it unpaid increments it.

Verification:
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- PM2 reloaded.
- Health check passed at `2026-05-11T12:55:50.960Z`.

Exact visual test:
1. Open a budget with PO, Bill, and Receipt cost lines.
2. Confirm PO rows show `+ Bill`, not paid.
3. Confirm Bill rows show one paid toggle.
4. Confirm Receipt rows show `Paid ✓`.
5. Confirm the Actuals column is no longer crowded by three status ticks.
6. Toggle a Bill paid and confirm the cost line turns green.
7. Toggle it unpaid and confirm it returns to blue.
8. Confirm the `invoices to pay` count decreases/increases with that toggle.

---

## Latest Visual Width Fix

Adjusted the budget grid so the Description column no longer stretches excessively on wide screens.

Changed:
- `BUDGET_GRID_INTERNAL` now uses fixed readable columns instead of `1fr` for Description.
- `BUDGET_GRID_CLIENT` also uses a fixed readable Description width.
- Added table width constants:
  - `BUDGET_TABLE_INTERNAL_WIDTH = 1374px`
  - `BUDGET_TABLE_CLIENT_WIDTH = 910px`
- `BudgetView` now uses those fixed table widths so fields stay close enough to scan on wide displays.
- Horizontal scrolling remains available on smaller screens.

Verification:
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- PM2 reloaded.
- Health check passed at `2026-05-11T12:39:10.232Z`.

Exact visual test:
1. Open a production budget on a wide screen.
2. Confirm Description is no longer disproportionately wide.
3. Confirm Rate, Agency, Estimated, Actuals, Remaining, and CLO stay within a readable distance.
4. Narrow the viewport and confirm the table scrolls horizontally instead of squashing cells.

---

## Built This Session

Targeted budget table interaction fix only. No schema changes and no backend code changes were made.

## Latest Interaction Change

Parent row cost-line creation no longer has any hover behavior.

Changed in `frontend/src/components/budgets/BudgetView.tsx`:
- Removed hover-visible `+ PO`, `+ BILL`, `+ RECEIPT` buttons from parent rows.
- Removed the hover-only “No cost lines yet” prompt row.
- Added a right-click context menu on parent rows.
- Right-click menu appears at the cursor and contains only:
  - `+ PO`
  - `+ BILL`
  - `+ RECEIPT`
- Selecting one of those actions opens the existing inline add-cost-line row beneath that parent.
- Closed rows do not open the right-click cost-line menu.
- Hovering a parent row no longer opens or reveals cost rows.

Cost rows now show only when:
- the row is already auto-expanded because it has outstanding PO/Bill state, or
- the chevron is clicked, or
- an add-cost-line row is explicitly opened from the right-click menu.

## Verification

Completed:
- `cd frontend && npm run build`
- `cp -r frontend/dist/* /var/www/agent/`
- `pm2 reload 0 --update-env`
- `curl http://localhost:3000/api/health`

Health check returned:

`{"status":"ok","time":"2026-05-11T12:31:40.509Z"}`

## Exact Next Step

Open a production budget and smoke test:

1. Hover over a parent row with no cost lines and confirm no prompt row appears.
2. Hover over a parent row and confirm `+ PO`, `+ BILL`, and `+ RECEIPT` do not appear.
3. Right-click a parent row and confirm the three add buttons appear beside the cursor.
4. Click `+ PO` and confirm the inline PO form opens under that parent row.
5. Right-click a closed parent row and confirm no add menu opens.

---

# Previous Budget Table Alignment Handover — 2026-05-11

## Frontend Layout Changes

### Shared Grid Constants

Added `frontend/src/components/budgets/budgetLayout.ts`.

Exports:
- `BUDGET_GRID_INTERNAL`
- `BUDGET_GRID_CLIENT`

Internal grid:

`24px 52px 1fr 130px 110px 52px 80px 88px 56px 96px 84px 90px 36px`

Client grid:

`52px 1fr 130px 52px 80px 88px 96px`

`BudgetView.tsx` now imports these constants and uses them through `gridStyle()`.

### Header Row

The column header row now uses the shared grid exactly.

Internal headers:

empty dot column, CODE, DESCRIPTION, CLIENT NOTES, INT. NOTES, QTY, UNIT, RATE, AGY%, ESTIMATED, ACTUALS, REMAINING, CLO.

The dot column header is now intentionally empty.

### Section Headers

Section headers no longer use the grid. They are full-width flex rows:
- dark background
- section badge and name on the left
- section state dots inline after the name
- totals, remaining pill, add button, and menu button on the right

The section menu button still stops propagation so it does not collapse the section.

### Parent Rows

Parent line item rows now use only the shared internal/client grids.

Removed the old extra 150px action column from the grid. Hover actions are now absolutely positioned over the right edge of the parent row, so they no longer create an extra implicit column that shifts alignment.

### Cost Line Rows

Cost line rows now use the same internal grid:
- Dot column empty.
- Code column contains the connector and type pill.
- Description column contains reference, description, and supplier inline.
- Actuals column contains amount and AGR/INV/PAID indicators.
- CLO column contains file/proof/delete controls.

Cost line rows no longer add extra implicit grid columns.

### Section Total Rows

Section total rows now use the same internal grid:
- Description label in column 3.
- Estimated in column 10.
- Actuals in column 11.
- Remaining in column 12.
- Remaining uses the existing color logic.

### Table Container

The table now has a consistent scroll container:
- `.budget-table`
- `.budget-table-inner`
- both have `min-width: 900px`
- all row types are direct children of the inner table container.

## Data Cleanup

Ran the requested one-time cleanup against `pms_budget_line_items`:

```sql
UPDATE pms_budget_line_items SET days = 1 WHERE days < 0 OR days IS NULL;
UPDATE pms_budget_line_items SET qty = 1 WHERE qty < 0 OR qty IS NULL;
UPDATE pms_budget_line_items SET rate = 0 WHERE rate < 0 OR rate IS NULL;
```

Result:
- `days`: 1 row fixed.
- `qty`: 0 rows fixed.
- `rate`: 0 rows fixed.
- Verification query confirmed `bad_days = 0`.

Backend validation for negative values was not added because this session was explicitly scoped to frontend layout/no backend changes.

## Verification

Completed:
- `cd frontend && npm run build`
- `cp -r frontend/dist/* /var/www/agent/`
- `pm2 reload 0 --update-env`
- `curl http://localhost:3000/api/health`

Health check returned:

`{"status":"ok","time":"2026-05-11T12:27:11.411Z"}`

## Known Issues / Technical Debt

- Browser visual smoke testing is still needed to confirm pixel-perfect column alignment in the actual budget screen.
- Sticky header is `top: 0` inside the budget scroll area because the scroll container starts below the nav/action/summary bars. This achieves the requested visual behavior without hard-coding the full page chrome height.
- Cost line status indicators are compacted into the Actuals column. If they feel cramped with very large amounts, the next refinement should make them appear on hover or in a small popover.
- No backend validation was added for negative `qty`, `days`, or `rate` because this pass was constrained to no backend changes.

## Exact Next Step

Open a production budget and smoke test:

1. Confirm headers align with parent rows.
2. Confirm cost line actual amounts align under Actuals.
3. Confirm section total Estimated, Actuals, and Remaining align with the same columns.
4. Scroll a long budget and confirm the header stays visible and aligned.
5. Confirm section headers span full width.
6. Confirm no bullet appears between days and unit.
7. Confirm C.2 Lighting kit no longer shows negative days.

Then continue the next budget interaction refinement only after this alignment pass is visually confirmed.
