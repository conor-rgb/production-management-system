# HANDOVER - 2026-05-22 - Unified Blackbook CRM Pass

## Built This Session
- Turned the Contacts area into a Blackbook-first CRM workspace.
- Added relationship lifecycle tracking so every person/company/supplier can be classified as:
  - Target
  - In touch
  - Client
  - Past client
  - Supplier
  - Preferred supplier
  - Do not use
  - Archived
- Added target lists for outreach and prospecting.
  - Lists can contain Blackbook entries.
  - Each list entry has an outreach status, notes, and next follow-up date.
- Added company/person linking at the Blackbook data model level.
  - People can belong to a company Blackbook entry.
  - Company records can aggregate email activity from their attached people.
- Expanded the Blackbook overlay so a record now behaves more like the Daylite-style CRM view:
  - lifecycle selector
  - company context
  - target-list membership
  - linked people on company records
  - options history
  - projects/opportunities
  - individual email activity by address
- Extended email-to-Blackbook creation so entries created from thread participants can carry a lifecycle status.

## Schema
- Added enums:
  - `BlackbookLifecycleStatus`
  - `BlackbookOutreachStatus`
- Added models:
  - `BlackbookTargetList`
  - `BlackbookTargetListEntry`
- Added to `BlackbookEntry`:
  - `lifecycleStatus`
  - `companyEntryId`
  - self-relation for company -> people
  - target-list relation
- Migration deployed:
  - `backend/prisma/migrations/20260522174000_blackbook_unified_crm/migration.sql`
- Prisma client regenerated.

## Backend
- Extended `/api/options/blackbook` with filters for:
  - search
  - category
  - entry type
  - lifecycle status
  - category config
  - company
  - target list
- Added target list endpoints:
  - `GET /api/options/blackbook/lists`
  - `POST /api/options/blackbook/lists`
  - `POST /api/options/blackbook/lists/:listId/entries`
  - `PATCH /api/options/blackbook/list-entries/:itemId`
- Updated `/api/options/blackbook/:entryId/crm`:
  - includes company entry
  - includes people for company records
  - includes target-list memberships
  - company records aggregate email messages from all attached people with email addresses
- Updated `/api/email/threads/:threadId/people/create-blackbook`:
  - accepts `lifecycleStatus`
  - defaults to `IN_TOUCH`

## Frontend
- Rebuilt `Contacts` into a unified Blackbook CRM page.
- Sidebar views:
  - All Blackbook
  - Target lists
  - In touch
  - Clients
  - Supplier contacts
  - Companies
  - individual target lists
- Main table shows relationship, category/type, contact details, company, and last updated date.
- Add-record flow adapts to the current view:
  - Target view creates target entries
  - In touch creates in-touch entries
  - Clients creates client entries
  - Companies creates company entries
- Blackbook overlay updates:
  - lifecycle status is editable
  - company context is shown
  - company records show linked people
  - target-list membership is visible
  - activity feed still links email messages to `/email?thread=...&message=...`

## Verification
- Prisma migration deployed successfully.
- Prisma client generated successfully.
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- PM2 process `0` reloaded.
- Health check passed after reload:
  - `{"status":"ok","time":"2026-05-22T14:01:12.101Z"}`

## Known Gaps / Technical Debt
- Company/person linking exists in schema/API and displays in the overlay, but there is not yet a polished attach/detach UI for assigning people to companies.
- Target lists exist and can be filtered in the CRM page, but the UI still needs list creation and per-entry outreach status editing controls.
- Supplier contacts are currently a broad Blackbook view; the next pass should expose category/type filters directly so Crew, Location, Florist, Caterer, AV, Transport, etc. can be segmented cleanly.
- Existing Contacts have not been bulk migrated into Blackbook yet.
- The email overlay links to `?message=...`, but Email still needs the exact target-message expansion/minimise behaviour.
- Company comms aggregation is based on known email addresses. It will improve once company/person linking is filled out.
- No Airtable-style template designer or client PDF options designer yet.

## Exact Next Steps
1. Add company/person management UI in the Blackbook overlay:
   - attach a person to a company
   - detach a person
   - create a person under a company
2. Add target list UI:
   - create target list
   - add/remove entries
   - edit outreach status
   - next follow-up date
3. Add category/type filters to the CRM list so supplier groups work as a proper blackbook.
4. Bulk migrate existing Contacts into Blackbook and auto-link by email.
5. Wire Email `?message=` behavior so a clicked activity opens the full thread with that message expanded.
6. Then continue into the Blackbook-backed outreach workflow and PDF/template planning.
