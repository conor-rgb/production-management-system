# HANDOVER - 2026-05-22 - Company-Level Blackbook Rollups

## Built This Session
- Added company-level Blackbook CRM rollups so company records aggregate activity from attached people.
- Company records now pull related data across:
  - the company entry itself,
  - every person attached through `companyEntryId`,
  - all email addresses on those records,
  - all contact IDs on those records.
- Company Blackbook overlays now show summary metrics for people, emails, option history, and jobs/opportunities.
- Added editable sticky-note-style notes to Blackbook detail records:
  - `Company notes` for companies,
  - `Record notes` for people/suppliers/locations.
- Notes autosave on blur via the existing Blackbook PATCH endpoint.
- Company option history now includes options linked to attached people, not just options linked directly to the company.
- Company email activity now links into the exact message-focused Email view using the previously built `/email?thread=...&message=...` support.

## Schema
- No schema changes in this pass.
- Uses existing `BlackbookEntry.notes`, `companyEntryId`, `people`, `contactId`, and `optionCandidates` relations.

## Backend
- Updated `backend/src/routes/options.ts` CRM endpoint:
  - computes `relatedEntryIds` for company + attached people,
  - computes `relatedContactIds` for company + attached people,
  - computes related email addresses for company + attached people,
  - returns rolled-up email messages, opportunities, productions, option candidates, and a `rollup` summary.
- No Gmail sync changes.

## Frontend
- Updated `frontend/src/components/blackbook/BlackbookOverlay.tsx`.
- Added summary metric cards to Blackbook detail.
- Added reusable `NotesEditor` with sticky-note visual styling and blur autosave.
- Extended frontend Blackbook CRM types for `notes`, `contactId`, option candidate source entry, and rollup metadata.

## Verification
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- PM2 process `0` reloaded.
- Health check passed after reload.

## Current Options / Blackbook State
- Options matrix remains project-specific for candidates, rates, notes, holds, and assignments.
- Blackbook remains the reusable source of truth for people/suppliers/locations/companies and opens as a right-side overlay from linked option rows.
- Company Blackbook records now behave as real CRM rollups for people, emails, options, opportunities, and productions.
- Options row Blackbook controls remain compact: grey `Link` when unlinked, darker underlined `Blackbook` when linked.
- Blackbook email activity cards open the exact matching email message in the Email client.

## Known Gaps / Technical Debt
- Company notes are plain text only. No files, rich text, pinned fields, or note history yet.
- Company rollup currently uses attached people/contact IDs/emails. It does not yet infer unknown people from company email domains.
- Focused email links currently request up to 500 messages for the thread. A future performance pass should fetch a cursor window around the target message instead.
- Notes save on blur. There is a small saving label, but no toast or persistent saved indicator yet.
- Target list archive is one-way in the UI. The backend keeps archived lists; a future Settings/Admin view can expose restoration.
- Supplier view still applies the broad legacy `SERVICE` filter. Category chips now let you get to all configured groups, but supplier taxonomy can be refined further once records are migrated/classified.
- Candidate snapshot fields are intentionally still separate from Blackbook. Future PDF/export logic must continue to choose deliberately between source fields and project fields.
- No Airtable-style template designer or client PDF options designer yet.

## Exact Next Steps
1. Add company files and pinned company fields once the note model is settled.
2. Add saved indicators/toasts for target-list status, notes, and follow-up date updates.
3. Refine supplier/client taxonomy now that legacy Contacts are in Blackbook.
4. Add explicit field-source rules for future option PDFs/decks.
5. Plan the Blackbook-backed outreach workflow and PDF/template designer.
