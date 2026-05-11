# Budget Visual Status System Handover — 2026-05-11

## Built This Session

Targeted frontend-only budget line item visual status system. Backend, schema, migrations, email, files, receipts, calendar, production, opportunity, and dashboard modules were not changed.

## Budget Line Item States

Added pure frontend state derivation in `frontend/src/components/budgets/BudgetView.tsx`.

Every parent line item now derives exactly one state on render:
- `EMPTY`: no cost lines and not closed.
- `COMMITTED`: has at least one PO and no Bill yet.
- `INVOICED`: has at least one Bill and not all paid.
- `PAID`: all cost lines are paid.
- `CLOSED`: parent `isClosed=true`.

State is never stored in the database.

## Parent Row Visuals

Internal view parent rows now show:
- 3px left border based on derived state.
- Light tinted background based on derived state.
- Inline status badge beside the description:
  - `no cost lines`
  - `PO raised`
  - `bill received`
  - `all paid`
  - `closed`
- Closed rows use gray styling, opacity `0.65`, muted description text, and read-only inline cells.
- Closed rows hide `+ PO`, `+ BILL`, and `+ RECEIPT` actions.
- CLO remains toggleable so a closed row can be reopened.

Client view remains clean:
- no state borders
- no status badges
- no state summary dots

## Cost Line Visibility

Cost lines no longer expand globally by default.

Default behavior:
- `EMPTY`: collapsed, hover shows the empty prompt row.
- `COMMITTED`: auto-expanded.
- `INVOICED`: auto-expanded.
- `PAID`: collapsed.
- `CLOSED`: collapsed unless toggled.

Chevron behavior:
- Chevron appears left of the code for rows with cost lines, or on hover.
- Clicking chevron toggles expansion with `event.stopPropagation()`.
- Cost line rows keep their plain `#fafaf8` background and no parent state border.

## Section Header Summary

Section headers now show up to 8 small state dots between the section name and totals:
- blue: committed
- amber: empty or invoiced
- green: paid
- gray: closed
- if more than 8 parent lines exist, a `+N` label appears.

The section `...` button still stops propagation so it does not collapse the section.

## Summary Bar Counts

Added a secondary state-health row under the summary bar metrics.

It conditionally shows:
- amber warning count for empty lines
- blue PO outstanding count for committed lines
- amber bills-to-pay count for invoiced lines
- gray closed count
- green `All lines settled ✓` when there are no visible issue counts

## Read-Only Closed Behavior

Closed parent rows:
- are visually faded
- keep estimated / actuals / remaining visible
- prevent inline edits to parent cells
- hide cost-line add actions
- pass the faded opacity to visible cost lines beneath them
- can be reopened through the CLO toggle

## Verification

- Frontend build passed:
  - `cd frontend && npm run build`
- Frontend bundle copied to:
  - `/var/www/agent`
- PM2 reloaded:
  - `pm2 reload 0 --update-env`
- Health check passed:
  - `curl http://localhost:3000/api/health`

## Known Issues / Technical Debt

- Browser/manual interaction testing still needs to be run against a real production budget.
- Section `...` menu is still not a full contextual menu; it stops collapse propagation but does not yet expose Add PO/Bill/Receipt.
- Mobile bottom-sheet budget editor remains incomplete from earlier budget work.
- File picker integration for invoice/proof icons remains visual-only.
- PM2 error log still contains old historical Prisma `BudgetRevision.version` entries from previous sessions; current health check is OK.

## Exact Next Step

Run the requested visual smoke test in browser:
1. Open a production budget.
2. Confirm an empty line, such as Camera kit with no cost lines, shows amber border and `no cost lines`.
3. Add a PO and confirm blue border plus `PO raised`.
4. Change PO to Bill and confirm amber border plus `bill received`.
5. Toggle CLO on another line and confirm it fades with `closed`.
6. Confirm empty and paid lines start collapsed.
7. Confirm committed and invoiced lines auto-expand.
8. Confirm section header dots match line states.
9. Confirm summary bar state counts update.
10. Switch to Client view and confirm borders, badges, and state dots are hidden.

Then continue the deeper project/budget production management pass before Phase 8 FreeAgent automation.
