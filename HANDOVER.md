# HANDOVER - 2026-05-22 - Google Places Address Picker for Options / Blackbook

## Built This Session
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
- The Blackbook overlay still shows the original single structured address section; it does not yet manage multiple saved addresses visually.
- Option PDF/export templates do not yet render selected addresses.
- Places search is region-biased to common production countries in the backend service; expand/remove `includedRegionCodes` if global search needs to be broader.
- No hard monthly quota guard is implemented in-app; rely on Google Cloud budgets/API restrictions for now.
- Address edits on a selected saved address are not yet exposed from the option dropdown; create/select/manual are covered.

## Exact Next Steps
1. Test with real searches:
   - `Claridge's`
   - `Hilton Park Lane`
   - `Big Sky Studios London`
2. Add multi-address management to the Blackbook overlay so addresses can be edited centrally.
3. Decide how selected addresses should appear in options PDF/deck templates.
4. Consider adding API usage logging/counts if Places usage grows beyond internal use.
