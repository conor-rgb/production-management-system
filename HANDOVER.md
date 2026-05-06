# Phase 3 Handover — Productions, Crew, and Production Dates

## Bug fix before Phase 4

### Opportunity Won flow fixed
- Fixed the blocker where marking an Opportunity as Won could flash a modal without completing production creation.
- Frontend now opens a confirmation modal before any stage-change API request is made.
- Confirming Won now sends `PATCH /api/opportunities/:id` with `{ stage: "WON" }`.
- Backend `PATCH /api/opportunities/:id` now handles stage transitions and runs the same business logic as the legacy `/stage` endpoint.
- Backend Won transition now:
  - Loads the source Opportunity
  - Generates the job code from `Settings.jobCodeYear` and `Settings.jobCodeSequence`
  - Creates the Production with title, client, brand, job type, quoted value, contact, source opportunity, job code, and `PRE_PRO` status
  - Returns the new Production record in the API response
  - Reuses an existing linked Production instead of duplicating one if the Opportunity is already Won
- Frontend receives the returned production ID and navigates directly to `/productions?production=<id>`.
- The legacy `POST /api/opportunities/:id/stage` endpoint remains, but now delegates to the same shared transition logic.

### Verification of bug fix
- Backend build passes with `npm run build`.
- Frontend build passes with `npm run build`.
- Live PM2 API was reloaded after build.
- Frontend build was copied to `/var/www/agent`.
- Tested against the live HTTPS API:
  - Created disposable test Opportunity `Won Flow Live Test`
  - Sent `PATCH /api/opportunities/:id` with `{ "stage": "WON" }`
  - API returned a new Production with job code `2647`, client `Test Client`, brand `Test Brand`, status `PRE_PRO`, and quoted value `12345`
  - Fetched the Production record successfully through `/api/productions/:id`
  - Deleted the disposable Opportunity and Production after verification
  - Reset `Settings.jobCodeSequence` back to `46`, so the next real job code is still `2647`

Phase 4 is ready to begin.

## What was built this session

### Backend
- Added Phase 3 Prisma schema and migrations:
  - New production statuses: `PRE_PRO`, `SHOOT`, `POST`, `WRAPPED`
  - `FreeAgentInvoiceStatus`, `ProductionDateType`, `CrewStatus`, and `ActivityEntityType`
  - Settings-backed job code state: `jobCodeYear` and `jobCodeSequence`
  - Production fields for FreeAgent invoice status and notes
  - Production date fields for type, date, time, location/platform, Zoom link, notes, and attached people
  - Crew member fields for role, status, day rate, number of days, and notes
  - `actualCost` on budget line items so production actual spend can calculate from budget actuals
  - Polymorphic `ActivityNote` and `ActivityTask` tables for production comms timeline items
- Rebuilt `/api/productions`:
  - Full CRUD for productions
  - Active production list excludes `WRAPPED` by default
  - `includeWrapped=true` includes archive records
  - Search over title, client, brand, job code, and notes
  - Generated job code on create via Settings sequence
  - Computed `quotedValue`, `actualSpend`, `variance`, `variancePercent`, `overBudget`, and `nextDate`
  - Status update endpoint returns `invoicePrompt: true` when a production first changes to `WRAPPED`
- Added production date endpoints:
  - Create, update, delete dates under a production
  - Attach contacts to each date through `pms_production_date_people`
  - `/api/productions/dates/today` returns today’s dates across all productions
- Added crew endpoints:
  - Create, update, delete, and list crew for a production
  - Existing suppliers can be linked by `contactId`
  - New crew names without a contact auto-create Supplier contacts
  - Crew list includes role and contact details
- Added production comms endpoints:
  - Manual notes and tasks with complete/incomplete state
  - Timeline API response includes notes, tasks, and linked email thread messages
- Added Settings crew-role API:
  - List, create, edit, delete crew roles
  - Deletion is blocked if a role is used by crew
- Dashboard API now returns:
  - Today’s production agenda
  - Active productions with next date and variance
  - Existing overdue follow-ups still returned unchanged
- Opportunity `WON` flow now creates productions with `PRE_PRO` status.
- Default crew roles are seeded on backend boot with upsert.

### Frontend
- Replaced the Productions placeholder with a mobile-first module:
  - Active production cards
  - Archive toggle for wrapped productions
  - Search
  - New production modal
  - URL-selectable detail view via `/productions?production=<id>`
- Added production detail tabs:
  - Overview: core financial metrics, status picker with confirmation, FreeAgent invoice status, notes
  - Dates: chronological list, add/edit/delete dates, attach contacts, Zoom link button
  - Crew: add crew by supplier search or new supplier name, status dropdown, inline day rate and days editing
  - Comms: unified timeline for emails, notes, and tasks; inline note/task creation; task checkbox completion
  - Files: Phase 4 placeholder
  - Budget: Phase 5 placeholder
- Wrapped status flow:
  - Selecting `Wrapped` prompts for confirmation
  - Backend response triggers a modal to raise a FreeAgent invoice
  - Raise Invoice is a placeholder until Phase 8
- Dashboard now shows:
  - Today’s agenda from production dates
  - Active productions with job code, client/title, status, next date, and variance
  - Overdue opportunity follow-ups still visible
  - Tap-through to production detail URLs and opportunity query URLs
- Settings now includes a Crew roles manager:
  - Add, rename, delete roles
  - 44px minimum tap targets on controls
- Added TypeScript types/constants for productions, dates, crew, invoice statuses, activity timeline, and formatting.

## Key decisions made

- Kept the existing `Production.value` field as the quoted value to avoid unnecessary data migration and preserve Phase 2 opportunity-to-production flow.
- Kept legacy production enum values in Prisma for compatibility with any existing records, but the Phase 3 UI only offers `Pre-pro`, `Shoot`, `Post`, and `Wrapped`.
- Stored job code sequence in `Settings` as requested. Defaults are `jobCodeYear = 2026` and `jobCodeSequence = 46`, so the next generated code is `2647`.
- Production actual spend is calculated from `BudgetLineItem.actualCost`. The Phase 5 budget UI will be responsible for editing those actuals.
- Used explicit join table `pms_production_date_people` rather than Prisma implicit many-to-many so the table keeps the project’s `pms_` prefix.
- Used polymorphic activity tables for production notes/tasks: `entityType` + `entityId`. Opportunities still use their Phase 2 dedicated note/task tables for now.
- Crew role defaults are seeded in app startup, not hard-coded into a migration, so Settings remains the source of truth after boot.
- `prisma migrate dev` could not run in this non-interactive environment. I generated the migrations with Prisma diff tooling and applied them with `prisma migrate deploy`.

## Current module state

### Dashboard
- Working with Phase 2 opportunity widgets plus Phase 3 production agenda and active production widget.
- Outstanding invoices, unread email, and receipt capture remain future phases.

### Opportunities
- Phase 2 CRUD/Kanban/list remains in place.
- Marking an opportunity Won is now confirmed first, then creates a Phase 3 production with a Settings-generated job code and navigates straight to that production record.
- Opportunity tap-through from dashboard uses `/opportunities?opportunity=<id>`.

### Productions
- Core Phase 3 module is implemented.
- Wrapped records are hidden unless archive is toggled.
- Variance turns red when actual spend is greater than quoted value.
- File and budget tabs are placeholders only.
- FreeAgent invoice status is manually editable until FreeAgent integration exists.

### Production Dates
- CRUD implemented.
- Contact attachments implemented.
- Dashboard today query implemented.
- No calendar sync yet.

### Crew
- CRUD implemented inside productions.
- Crew roles are managed from Settings.
- New crew names auto-create Supplier contacts.
- Call sheet export is not built.

### Contacts
- Phase 2 contacts remain in place.
- Supplier search is reused for crew.
- Supplier auto-create from crew is implemented in the backend.

### Settings
- Account password change remains.
- Crew roles manager added.
- Job code sequence is stored in Settings but there is no UI to edit it yet.

### Budgets
- Still placeholder UI.
- Schema now has `actualCost` for line items to support production actual-spend calculation.

### Files
- Still placeholder UI.
- Phase 4 should build this next.

### Email
- Still placeholder UI.
- Production comms timeline can display linked email messages once email integration creates `EmailThread`/`EmailMessage` rows.

## Verification

- Applied Phase 3 Prisma migrations with `npx prisma migrate deploy`.
- Regenerated Prisma Client with `npx prisma generate`.
- Backend build passes with `npm run build`.
- Frontend build passes with `npm run build`.

## Known issues and technical debt

- A failed non-interactive Prisma migration attempt was marked rolled back in `_prisma_migrations`; the final split migrations are applied successfully.
- Existing unrelated git worktree changes were present before this session: many repository metadata/docs files are deleted and `BRIEF.md`/`CLAUDE.md` are untracked. I did not touch or commit those.
- Production status migration keeps old enum values for compatibility. A later cleanup migration can map legacy values and remove them if the database no longer contains old statuses.
- Production notes/tasks use new polymorphic activity tables; opportunity notes/tasks still use Phase 2 dedicated tables. This can be unified later if needed.
- The Productions UI is feature-complete for Phase 3 but has not had browser screenshot QA on a real 390px viewport.
- There is no optimistic update/error toast system yet; most actions reload after successful API calls and errors currently fall to console or basic text.
- Date contact attachment only links existing contacts. Creating a new date attendee directly from the date form is not built.
- Crew inline day rate/days edits save on every field change event currently fired by the input handler, which is functional but can be refined to save on blur.
- Browser automation tooling is not installed in the repo, so the Won flow UI was validated by TypeScript build and code path review; the live backend behavior was verified through HTTPS API calls.

## Exact next step for Phase 4

Start Phase 4 with the file system backend:
1. Add/confirm file metadata fields needed for local storage browsing: production, folder path, original filename, stored filename, MIME type, size, and linked budget line/receipt metadata.
2. Implement job folder creation on production creation under `/backend/storage/jobs/<jobCode> — <Client Brand>/` with the required folders: Briefs, Estimates, Budgets, Contracts, Crew Deals, Receipts, References, Selects, Delivery.
3. Add file API routes for listing the tree, upload, download, preview metadata, rename, move, and delete.
4. Then replace the Productions Files tab placeholder with the in-app file browser for a single production.
5. Finally add the cross-job Files nav browser and keep receipt auto-filing hooks ready for Phase 7.
