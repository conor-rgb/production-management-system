# HANDOVER - 2026-05-27 - Group PO to Bill Conversion

## Built This Session
- Added group-level "Add bill" / "Convert to bill" workflow for production purchase orders.
- A grouped PO can now be converted to bill allocations from the production `POs` sheet.
- The conversion keeps the budget structure intact:
  - one grouped supplier PO remains visible in the `POs` tab,
  - each allocation remains attached to its original budget line,
  - each allocation changes from `PO` to `BILL`,
  - line actuals/remaining values are recalculated after conversion.
- Optional invoice metadata is captured:
  - invoice number,
  - invoice date,
  - invoice file upload.
- Uploaded invoice files are saved into the production job file structure using the existing `JobFile` system.
- The same invoice file is linked to every converted allocation, so one supplier invoice can cover multiple estimate pots.

## Backend
- Updated `backend/src/routes/budgets.ts`.
- Added `multer` memory upload handling for grouped PO bill invoices.
- Reused `autoFileDocument()` from `backend/src/services/fileStorage.ts`.
- New endpoint:
  - `POST /api/budgets/purchase-orders/:purchaseOrderId/convert-to-bill`
- Multipart fields:
  - `invoiceFile` optional file, max 25MB,
  - `invoiceNumber`,
  - `invoiceDate`,
  - `allocations` JSON array with allocation IDs and final amounts.
- Conversion rules:
  - cancelled POs cannot be converted,
  - selected allocations become `lineType = BILL`,
  - `isInvoiced = true`,
  - `isPaid = false`,
  - `status = INVOICED`,
  - `invoiceFileId` is linked when a file is uploaded.
- PO group status sync still derives from allocation state:
  - mixed PO/Bill -> `PART_BILLED`,
  - all bill allocations unpaid -> `BILLED`,
  - all paid -> `PAID`.

## Frontend
- Updated `frontend/src/pages/Productions.tsx`.
- Added an `Add bill` / `Bill linked` action to each row in the production `POs` tab.
- Added a right-side bill drawer:
  - invoice number,
  - invoice date,
  - invoice file picker,
  - editable amount per allocation,
  - clear explanation that budget lines stay separate.
- Updated `frontend/src/lib/types.ts` so PO allocations expose linked invoice file metadata.

## Deployment / Verification
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned `{"status":"ok"}`.

## Current State
- The production `POs` tab now supports the core lifecycle:
  - create one grouped supplier PO across multiple budget lines,
  - convert that grouped PO into bill allocations,
  - attach the supplier invoice file once and link it to every affected line.
- This is the right workflow for a photography agency invoice covering Photographer, Camera Kit, Lighting Kit, and Photo Assistant while keeping each budget pot readable.

## Known Gaps / Technical Debt
- No automatic AI invoice parsing in this drawer yet.
- No PO PDF/export/email yet.
- No secure supplier onboarding public form yet.
- Invoice files are stored in the job `Receipts` folder for now; we may want an `Invoices` or `Supplier Bills` folder later.
- Existing legacy single-line POs are still not backfilled into grouped PO records.

## Exact Next Steps
1. Add PO PDF generation and email send.
2. Add AI invoice parsing to prefill invoice number, supplier, date, and allocation suggestions from uploaded files.
3. Add secure supplier onboarding links for new Blackbook suppliers.
4. Add grouped bill paid/unpaid controls once FreeAgent matching is ready.

---

# HANDOVER - 2026-05-27 - Project Purchase Orders Foundation

## Built This Session
- Added a real grouped purchase order system for production budgets.
- Added a production-level `POs` tab.
- POs can now represent one supplier commitment spread across multiple budget lines.
- Creating a PO creates one `PurchaseOrderGroup` and multiple linked PO `SubCost` allocations.
- Each allocation remains under its parent budget line, preserving line-level actuals and remaining budget.
- Supplier source workflow in the PO creation panel:
  - choose from job option candidates,
  - search/select Blackbook entries,
  - or create a new Blackbook supplier record inline while creating the PO.
- New suppliers default to Blackbook supplier lifecycle so they become reusable immediately.
- PO status can be managed from the project PO sheet:
  - Draft,
  - Sent,
  - Accepted,
  - Part-billed,
  - Billed,
  - Paid,
  - Cancelled.

## Backend
- Updated `backend/prisma/schema.prisma`.
- Added migration:
  - `backend/prisma/migrations/20260527072000_purchase_order_groups/migration.sql`
- New enum:
  - `PurchaseOrderStatus`
- New model:
  - `PurchaseOrderGroup`
- Added `purchaseOrderGroupId` to `SubCost`.
- Added relations from:
  - `Production` -> `purchaseOrders`
  - `Budget` -> `purchaseOrders`
  - `BlackbookEntry` -> `purchaseOrders`
  - `OptionCandidate` -> `purchaseOrders`
- Updated existing single-line subcost creation to optionally attach to a PO group and inherit its PO number/supplier.
- PO group status sync runs after subcost create/update/delete/status changes:
  - all paid -> `PAID`
  - mixed PO/Bill -> `PART_BILLED`
  - all billed but unpaid -> `BILLED`

## API
- Added under existing `/api/budgets` route:
  - `GET /api/budgets/production/:productionId/purchase-orders`
  - `GET /api/budgets/production/:productionId/purchase-order-context`
  - `POST /api/budgets/production/:productionId/purchase-orders`
  - `PATCH /api/budgets/purchase-orders/:purchaseOrderId`
  - `DELETE /api/budgets/purchase-orders/:purchaseOrderId`
- `purchase-order-context` returns:
  - current budget line items,
  - active option candidates,
  - linked Blackbook details where available.

## Frontend
- Updated `frontend/src/pages/Productions.tsx`.
- Added `POs` tab to production detail.
- Added clean PO sheet:
  - PO number,
  - supplier,
  - allocated budget lines,
  - total,
  - status,
  - file indicator,
  - delete action.
- Added multi-line PO creation drawer:
  - supplier from job options,
  - supplier from Blackbook search,
  - new supplier quick-create,
  - allocation amount per budget line.
- Updated `frontend/src/lib/types.ts` with purchase order types.

## Deployment / Verification
- Prisma migration deployed.
- Prisma client generated.
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned `{"status":"ok"}`.
- PM2 logs after reload show no new PO/server errors. Existing Gmail 404 sync noise remains unrelated.

## Current State
- The app now has the data model needed for agency/supplier POs that span several estimate lines.
- For Polomi NYC-style photography agency commitments, create one PO and allocate amounts to Photographer, Camera Kit, Lighting Kit, and Photo Assistant.
- Each allocation appears as a normal PO cost line in the budget, while the new POs tab gives the grouped management view.

## Known Gaps / Technical Debt
- Supplier onboarding public form is not built yet.
- PO PDF/export/email is not built yet.
- PO status is partly manual and partly synced from allocation state; we may want clearer rules once Bill conversion is expanded.
- Converting an entire grouped PO to one Bill is not yet a single action.
- Existing legacy single-line POs are not backfilled into `PurchaseOrderGroup` records.
- The PO sheet has a file indicator only; full invoice/PO document management should come in the next pass.

## Exact Next Steps
1. Add "Convert PO to Bill" at group level with optional invoice upload.
2. Add PO PDF generation/email send.
3. Add secure supplier onboarding links for draft Blackbook suppliers.
4. Optionally backfill legacy PO subcosts into grouped PO records.

---

# HANDOVER - 2026-05-27 - Budget Estimate Actuals Display

## Built This Session
- Updated the internal budget/estimate table display for parent line items with no PO/Bill/Receipt cost lines.
- If a line has no cost lines:
  - Actuals now displays the line's estimated total in muted grey.
  - Remaining displays `£0.00`.
  - Tooltip explains this is a placeholder display because no cost lines exist yet.
- Section headers and section total rows now use the same display logic:
  - Empty lines are treated as fully allocated for display purposes.
  - Lines with real cost lines still show actual PO/Bill/Receipt totals and true remaining budget.

## Why
- Before this pass, empty lines showed actuals as `£0.00` and remaining as the full estimate, which made it look like there was a large amount of free money left.
- The new display is more conservative for production management: uncommitted estimate pots no longer read as available margin.

## Important Data Note
- This is display-only.
- Backend `actualTotal`, production actual spend, and reports still count only real PO/Bill/Receipt cost lines.
- No schema or backend calculation changes were made.

## Multi-Line PO Review
- Current model:
  - A parent budget line is the quoted/estimated pot.
  - Each PO/Bill/Receipt is stored as a `SubCost` under one parent line.
  - PO numbers live on each `SubCost`.
- For an agency charging multiple line items, the right workflow should be a shared PO group:
  - one PO number,
  - one supplier,
  - separate cost-line allocations under each affected parent line,
  - each parent line remains clear and keeps its own actual/remaining values.
- This can be implemented without changing the visible line structure by creating multiple `SubCost` rows with the same `poNumber` and supplier.
- Recommended next build:
  1. Add a "Multi-line PO" action.
  2. User selects supplier and multiple budget lines.
  3. Form shows one row per selected budget line with amount allocation.
  4. Save creates one shared PO number and one PO cost line under each selected parent.
  5. Later, converting to Bill can either convert all allocations together or line-by-line.

## Frontend
- Updated `frontend/src/components/budgets/BudgetView.tsx`.
- Added display helpers:
  - `displayActualForLine`
  - `displayRemainingForLine`
  - `displaySectionTotals`

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned `{"status":"ok"}`.

## Exact Next Steps
1. Build the shared/multi-line PO action for jobs like Polomi NYC.
2. Decide whether multi-line bills should convert all grouped PO allocations at once or allow partial conversion.
3. Optionally add a grouped PO visual indicator on cost lines, e.g. `PO-2647-001 · 4 lines`.

---

# HANDOVER - 2026-05-22 - Options Contact Sync / Blackbook Email Model

## Built This Session
- Follow-up contact column correction:
  - Contact details now have their own `Contact` column between the date status columns and Deck notes.
  - Email and phone render stacked as plain text with small icons, not as visible text boxes.
  - The option identity cell is back to name, Blackbook link, and subtitle only.
  - Clicking the contact text still opens the compact edit popover.
- Follow-up sheet polish:
  - Option identity cells now show one clear title line and optional subtitle only.
  - Blackbook linking moved into the Contact column as a small icon-only control.
  - Linked Blackbook record names are no longer repeated under the option title.
  - Address column width reduced so the table reads more tightly.
- Added compact email/phone display to Options candidate rows.
- Contact details render in a dedicated narrow Contact column.
- Clicking the contact line opens a small contact details popover.
- Option candidate contact edits now update the row snapshot and, when linked, sync back to the linked Blackbook entry:
  - `contactEmail` -> `BlackbookEntry.email`
  - `contactPhone` -> `BlackbookEntry.phone`
- The contact popover shows "syncs to Blackbook" when a candidate is linked to a Blackbook record.

## How Email Is Stored For Blackbook
- Blackbook records store the primary reusable contact fields directly on `pms_blackbook_entries`:
  - `email`
  - `phone`
- Gmail/email messages are not duplicated onto Blackbook records.
- Email activity is resolved dynamically by matching Blackbook email addresses against Gmail-synced rows in `pms_email_messages`.
- The Blackbook CRM/activity endpoint also includes company/people context where available, then builds the timeline from matching email messages, options, opportunities, and productions.
- This keeps Gmail as the message source of truth and Blackbook as the contact/source-of-truth profile.

## Backend
- Updated `backend/src/routes/options.ts`.
- `PATCH /api/options/matrix/candidates/:candidateId` now writes changed email/phone values back to a linked `BlackbookEntry`.
- Existing Blackbook-to-option link behaviour still snapshots Blackbook details into the option row.
- Two-way behaviour is now:
  - Link Blackbook -> option row receives email/phone.
  - Edit option row email/phone -> linked Blackbook entry is updated.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Added `CandidateContactCell` for compact row-level email/phone display and editing.
- Existing candidate sheet column sizing/order is otherwise unchanged.

## Deployment / Verification
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned `{"status":"ok"}`.

## Current State
- Blackbook remains the source of truth for reusable contact email/phone.
- Option candidates keep a deck snapshot for stability but now push edited email/phone back to the linked Blackbook record.
- Email timelines continue to be resolved from Gmail-synced messages by address matching.

## Known Gaps / Technical Debt
- Blackbook still has one primary email and one primary phone field. Multiple emails/phones would need a dedicated related table if required.
- Option rows show contact details compactly, but PDF/export rendering of contact info remains a separate design decision.
- Existing Gmail messages are matched by address; changing a Blackbook email changes future matching based on that new address.

## Exact Next Steps
1. Decide whether Blackbook needs multiple email/phone records per person/company.
2. Decide whether option deck PDFs should expose contact details, and under which view/template.
3. Add multi-address/multi-contact history if you need old email addresses to keep matching previous email activity.

---

# HANDOVER - 2026-05-22 - Google Places Address Picker for Options / Blackbook

## Built This Session
- Follow-up Options candidate sheet design pass:
  - Date headers are now visually stronger, with the status/date axis directly after the option identity.
  - Candidate notes are split into Deck notes and Internal notes.
  - Both note cells stay compact in the table but open into a sticky-note style multi-line editor.
  - Option titles are slightly larger and remain on one line.
  - Blackbook linking now shows a quiet linked record label or a grey plus for unlinked rows; the literal "Blackbook" label is no longer repeated.
  - Candidate sheets now sit on a cleaner bordered sheet surface instead of a raw grid on white.
  - Reworked candidate sheet column widths to a constrained readable table width so related fields stay visually grouped on wide screens.
  - Reordered candidate sheet columns so date availability appears immediately after the option identity, followed by deck notes.
  - Links now render as discreet icons only; clicking an icon opens its URL in a new tab.
  - Right-clicking anywhere in the Links cell opens the links editor modal.
  - Removed the visible Links button treatment from candidate rows.
  - Tightened row height, image thumbnails, link controls, address display, rate cells, and action controls.
  - Blackbook link now sits beneath the option name as secondary metadata, reducing horizontal crowding.
  - Address cells now clamp to a compact multi-line preview.
  - Empty/zero rates now visually recede.
  - Date status columns are narrower and cleaner, with two-line date headers and compact chip labels (`Req`, `1st`, `2nd`, `Conf`, etc.).
  - Status/date pills keep the existing colour language but are lighter and less button-like.
- Follow-up Blackbook compact profile pass:
  - Read the current Blackbook and Options schema before changing layout.
  - Reworked the Blackbook profile side into compact disclosure rows instead of large padded cards.
  - Profile header now uses smaller type, tighter chips, and compact metric pills.
  - Relationship/category editing now sits in a small Profile section.
  - Links, notes, address, company/people, and job-option actions are collapsed into sleek expandable rows.
  - Added a Blackbook-side address manager using Google Places autocomplete plus manual fallback.
  - Address manager creates reusable `BlackbookAddress` records and can set default billing.
  - Manual address entry is compact and still stores country as a two-letter accounting/API-friendly code.
  - Added "Add to job options" from the Blackbook profile:
    - search/select production,
    - choose an existing option role/sheet,
    - or create a new role/sheet with quantity and type,
    - adds the Blackbook record as a linked `OptionCandidate`.
  - Added backend endpoint:
    - `POST /api/options/blackbook/:entryId/add-to-options`
  - Endpoint uses existing `OptionGroup`, `OptionRequirement`, and `OptionCandidate` models and snapshots reusable Blackbook data into the deck row.
- Follow-up Blackbook UX pass:
  - Profile controls are now compact and organised in the left profile column.
  - The activity side is now a single chronological feed instead of separate project/options/email blocks.
  - Timeline items mix email, option, opportunity, and production activity with date grouping.
  - The metrics strip has been tightened to reduce the heavy card feeling.
- Follow-up Blackbook overlay pass:
  - Blackbook detail now uses a two-column layout: profile/details on the left and activity timeline on the right.
  - Opening Blackbook from Options now uses compact mode, easing in from the right with only profile + timeline columns.
  - Full Blackbook overlay now has a broader browser layout with a category rail, results column, profile column, and activity column.
  - Saved reusable Blackbook addresses now show in the profile column.
  - CRM endpoint now returns saved Blackbook addresses for the profile overlay.
- Follow-up Blackbook create pass:
  - "Create from row" in the options Blackbook link dropdown now opens a structured create panel.
  - New records default to supplier lifecycle.
  - User can choose Blackbook category and one or more category types before saving.
  - Backend accepts those category/type choices when creating the Blackbook entry from an option row.
- Follow-up URL pass:
  - Options candidate sheets now persist in the URL with `optionGroup=<groupId>`.
  - Opening a role/service/location sheet updates the browser URL.
  - Refreshing that URL reopens the same options sheet instead of returning to the matrix.
  - Backing out to the matrix clears `optionGroup`.
- Follow-up frontend pass:
  - Website is now the first field in the Options row Links dropdown.
  - Website counts toward the compact Links cell summary.
  - Blackbook search/link popups now show website in the result metadata when available.
  - Blackbook overlay now has a Links section with editable Website field.
- Added reusable Blackbook addresses with address types:
  - Work,
  - Billing,
  - Personal,
  - Custom.
- Added Google Places backend integration for place/address autocomplete.
- Added backend-only Places endpoints so the Google API key is never exposed to the browser.
- Reworked the Options Address dropdown into a real picker:
  - saved addresses,
  - Google place search,
  - address type selector,
  - default billing checkbox,
  - manual entry fallback.
- Option candidates can now select a saved Blackbook address for the deck.
- Selected address fields are copied onto the option candidate as a deck snapshot for display/export stability.

## Backend
- Updated `backend/prisma/schema.prisma`.
- Added migration:
  - `backend/prisma/migrations/20260522203000_blackbook_addresses_google_places/migration.sql`
- New enums:
  - `BlackbookAddressType`: `WORK`, `BILLING`, `PERSONAL`, `CUSTOM`
  - `BlackbookAddressSource`: `MANUAL`, `GOOGLE_PLACES`
- New model:
  - `BlackbookAddress`
- Added `selectedAddressId` relation to `OptionCandidate`.
- Added service:
  - `backend/src/services/googlePlacesService.ts`
- Supported env vars:
  - `GOOGLE_PLACES_API_KEY`
  - fallback: `GOOGLE_MAPS_API_KEY`

## API
- Added under existing `/api/options` route:
  - `GET /api/options/places/search?q=...&sessionToken=...`
  - `POST /api/options/places/details`
  - `GET /api/options/blackbook/:entryId/addresses`
  - `POST /api/options/blackbook/:entryId/addresses`
  - `PATCH /api/options/blackbook/addresses/:addressId`
  - `DELETE /api/options/blackbook/addresses/:addressId`
  - `PATCH /api/options/matrix/candidates/:candidateId/address`
- Existing candidate patch also accepts `selectedAddressId`.
- Existing Blackbook link flow now picks the default billing address or first saved address if one exists.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Address cell behaviour:
  - populated addresses render as compact multi-line plain text,
  - clicking opens the picker dropdown,
  - saved Blackbook addresses can be selected,
  - Places search creates a saved Blackbook address and selects it,
  - manual entry can create a saved Blackbook address when linked, or update the option snapshot if unlinked.
- Address display format:
  - line 1,
  - line 2 when present,
  - city, postcode,
  - region, country.

## Deployment / Verification
- Prisma migration deployed.
- Prisma client generated.
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned `{"status":"ok"}`.
- Follow-up fix:
  - Google initially rejected requests because Node used the server IPv6 egress address while the key was restricted to IPv4.
  - `googlePlacesService.ts` now sets DNS result order to `ipv4first`, matching the configured Google Cloud IP restriction.

## Current State
- Google Places is ready for production use from the backend.
- Options can create reusable Blackbook addresses from Places results.
- Country from Places is stored as a short country code when Google provides it.
- Manual address entry remains available for private homes, load-ins, unofficial entrances, and non-standard production details.

## Known Gaps / Technical Debt
- Blackbook address editing currently supports creating saved addresses from Places/manual entry and showing saved addresses compactly; editing/deleting existing saved addresses from the profile overlay is still a follow-up.
- The new Blackbook-to-options action adds a candidate to a role/sheet but does not yet jump the UI directly to that option sheet after saving.
- Option PDF/export templates do not yet render selected addresses.
- Places search is region-biased to common production countries in the backend service; expand/remove `includedRegionCodes` if global search needs to be broader.
- No hard monthly quota guard is implemented in-app; rely on Google Cloud budgets/API restrictions for now.
- Address edits on a selected saved address are not yet exposed from the option dropdown; create/select/manual are covered.

## Exact Next Steps
1. Test with real searches:
   - `Claridge's`
   - `Hilton Park Lane`
   - `Big Sky Studios London`
2. Add edit/delete controls for saved addresses in the compact Blackbook address manager.
3. After adding a Blackbook record to job options, optionally deep-link to `/productions?production=[id]&tab=options&optionGroup=[groupId]`.
4. Decide how selected addresses should appear in options PDF/deck templates.
5. Consider adding API usage logging/counts if Places usage grows beyond internal use.
