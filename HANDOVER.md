# HANDOVER - 2026-05-22 - Blackbook Company/People Linking Pass

## Built This Session
- Added the missing company/person management UI to the Blackbook overlay.
- Person records now have a Company panel:
  - shows the linked company record
  - opens the linked company when clicked
  - detaches the person from the company
  - searches existing company Blackbook entries
  - creates a new company and immediately attaches the person
- Company records now have a People panel:
  - lists attached people
  - opens a person record when clicked
  - detaches people from the company
  - searches existing person Blackbook entries and attaches them
  - creates a new person directly under the company
- New people created under a company inherit the company category, type tags, lifecycle status, and company name.
- Company-level CRM activity continues to aggregate email messages from attached people, so linking people to companies now improves the company comms view immediately.

## Schema
- No schema changes in this pass.
- Uses the existing `BlackbookEntry.companyEntryId` self-relation from the unified CRM migration.

## Backend
- No backend code changes in this pass.
- Reused existing endpoints:
  - `GET /api/options/blackbook?entryType=COMPANY`
  - `GET /api/options/blackbook?entryType=PERSON`
  - `POST /api/options/blackbook`
  - `PATCH /api/options/blackbook/:entryId`
  - `GET /api/options/blackbook/:entryId/crm`

## Frontend
- Updated `frontend/src/components/blackbook/BlackbookOverlay.tsx`.
- Added `PersonCompanyManager`:
  - attach existing company
  - create and attach company
  - detach company
- Added `CompanyPeopleManager`:
  - attach existing people
  - create people under company
  - detach people
  - open linked person records from the company panel
- Kept the existing Blackbook overlay design pattern: compact right-side CRM record, neutral panels, small controls, no new route.

## Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- PM2 process `0` reloaded.
- Health check passed after reload.

## Known Gaps / Technical Debt
- Target lists exist and can be filtered in the CRM page, but the UI still needs list creation and per-entry outreach status editing controls.
- Supplier contacts are currently a broad Blackbook view; the next pass should expose category/type filters directly so Crew, Location, Florist, Caterer, AV, Transport, etc. can be segmented cleanly.
- Existing Contacts have not been bulk migrated into Blackbook yet.
- The email overlay links to `?message=...`, but Email still needs the exact target-message expansion/minimise behaviour.
- Company comms aggregation is based on known email addresses. It now benefits from linked people, but contacts without email addresses will still not contribute messages.
- No Airtable-style template designer or client PDF options designer yet.

## Exact Next Steps
1. Add target list UI:
   - create target list
   - add/remove entries
   - edit outreach status
   - next follow-up date
2. Add category/type filters to the CRM list so supplier groups work as a proper blackbook.
3. Bulk migrate existing Contacts into Blackbook and auto-link by email.
4. Wire Email `?message=` behavior so a clicked activity opens the full thread with that message expanded.
5. Add company-level notes/files once the activity model is settled.
6. Then continue into the Blackbook-backed outreach workflow and PDF/template planning.
