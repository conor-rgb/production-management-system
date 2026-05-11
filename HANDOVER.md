# Budget UI Fix Handover — 2026-05-11

## Built This Session

Focused budget UI and interaction rebuild only. No email, files, receipts, calendar, production, or opportunity logic was intentionally changed.

### Budget Table
- Rebuilt `frontend/src/components/budgets/BudgetView.tsx` around the requested parent/sub-cost model.
- Parent line items now render as estimated budget pots:
  - Estimated
  - Actuals from sub-costs
  - Remaining
  - AGR / CLO / INV / PAID status columns on the parent row only
- Sub-costs now render as indented rows directly in the main table beneath their parent line item.
- Sub-cost rows show:
  - description
  - supplier
  - flat amount ex-VAT in the Actuals column
  - VAT amount if present
  - invoice file indicator
  - proof-of-payment indicator
  - delete action
- Sub-cost rows deliberately do not show parent-only columns such as rate calculations or AGR/CLO/INV/PAID.

### Visual Layout
- Added the requested top navigation:
  - back button with job/client label
  - revision selector
  - status pill
  - Internal / Client segmented toggle
  - PDF export icon
- Added action bar:
  - Unselect all
  - Print estimate
  - Email estimate
  - Revision history
  - Add section
  - Add line
  - Templates
  - Cover page
  - Advances
- Rebuilt the summary bar with five evenly distributed metrics:
  - Subtotal
  - Production fee
  - Insurance
  - Grand total
  - Advance due
- Replaced Variance in the main requested table view with Remaining.
- Added spreadsheet-style column headers for internal and client views.
- Added dark section headers with:
  - letter badge
  - section name
  - estimated total
  - remaining pill
  - collapse chevron
  - menu icon
- Added compact section total rows.
- Added compact empty section row:
  - `No items — Browse templates or + Add line`

### Interactions
- Inline editing works for budget line cells:
  - description
  - notes
  - prep / shoot / qty / rate / multiplier / overtime / agency fee
  - unit via custom floating dropdown
- Numeric edits update the revision returned by the API so row totals, section totals, and summary totals refresh immediately.
- AGR and CLO are manually toggleable on parent rows.
- INV and PAID are read-only visual status columns derived from sub-cost file/proof state in the frontend.
- Parent line row hover actions:
  - add sub-cost
  - duplicate
  - delete
- Add sub-cost inserts a blank indented row under the parent and saves to:
  - `POST /api/budgets/lines/:lineItemId/subcosts`
- Section headers collapse/expand their line items and sub-costs.
- Cover page and advance invoice panels remain available from the action bar.

### Template Picker
- Empty revisions now show a clean starter picker instead of an empty/broken table:
  - Photo Shoot
  - Motion / Video
  - Event
  - Start blank
- Template cards are large bordered cards with icon, name, and section count.
- Applying a template calls the existing template endpoint and renders the table once sections are created.
- Start blank keeps the revision empty so sections can be added manually.

### Template Database
- Cleared the old template records from `pms_section_templates`.
- Reseeded exactly three templates:
  - Photo Shoot: 11 sections
  - Motion / Video: 13 sections
  - Event: 10 sections
- Verified the database contains the requested section names only.

## Current State By Module

### Budgets
- Main budget UI is deployed and now follows the parent pot + inline sub-cost row model.
- The old panel-style sub-cost UI was removed from the active table flow.
- The table is still built on the existing backend budget routes from the Phase 7 rebuild.
- No schema changes were made in this session.

### Backend
- No backend route or schema changes were required for this UI pass.
- Prisma Client was regenerated because PM2 logs showed the old generated client still looking for the removed `BudgetRevision.version` column.
- Backend was rebuilt and PM2 reloaded after regeneration.

### Templates
- `seedSectionTemplates()` already matched the required Photo / Motion / Event section names.
- Runtime database templates were deleted and reseeded from the current compiled service.

### Other Modules
- Email, files, calendar, receipts, productions, and opportunities were not changed.

## Verification

- Frontend build passed:
  - `cd frontend && npm run build`
- Frontend bundle copied to:
  - `/var/www/agent`
- Backend build passed:
  - `cd backend && npm run build`
- Prisma Client regenerated:
  - `cd backend && npx prisma generate`
- PM2 reloaded:
  - `pm2 reload 0 --update-env`
- Health check passed:
  - `curl http://localhost:3000/api/health`
  - Response: `{"status":"ok", ...}`
- Template seed verified directly from Prisma:
  - Event: 10 requested sections
  - Motion / Video: 13 requested sections
  - Photo Shoot: 11 requested sections

## Known Issues / Technical Debt

- Browser interaction testing was not run with Playwright; verification was build/deploy/API-level.
- The table is horizontally scrollable on smaller widths. The requested mobile bottom-sheet editor is not fully implemented yet.
- Tab-to-next-cell and Enter-to-next-row behavior is partially scaffolded in the inline editor but should be hardened with browser testing.
- Sub-cost delete currently refreshes the page after delete instead of applying the returned revision, because the current delete endpoint returns 204.
- Invoice file and proof-of-payment attachment buttons are visual indicators only in this pass; full file picker integration remains future work.
- Section header menu is visual only in this pass; Add line is available from row/action controls.
- The PM2 error log still contains old pre-regeneration Prisma `BudgetRevision.version` errors. After regenerating Prisma Client, rebuilding, and reloading, health is OK.

## Exact Next Step

Open a real opportunity budget in the browser and run the requested manual smoke test:
1. New opportunity → open budget → template picker appears.
2. Select Photo Shoot → correct sections appear.
3. Add or edit a line in section B with rate `1000`, shoot days `2`, multiplier `1`.
4. Confirm Estimated shows `£2,000.00`.
5. Add sub-cost `Kate invoice`, supplier `Kate Martin`, amount `800`.
6. Confirm parent Actuals show `£800.00` and Remaining shows `£1,200.00`.
7. Add another sub-cost `300` and confirm Actuals `£1,100.00`, Remaining `£900.00`.
8. Toggle AGR and confirm the parent status changes.
9. Export client and internal PDFs and visually review output.

After that, continue the deeper estimate/budget rebuild pass before Phase 8 FreeAgent automation.
