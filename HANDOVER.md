# HANDOVER - 2026-05-29 - Email Client Drafts Folder

## Built This Session
- Added a `Drafts` folder to the email client sidebar and mobile folder picker.
- Drafts folder uses the synced local/Gmail draft store:
  - opening the folder refreshes drafts from `/api/email/drafts`,
  - Gmail drafts imported by the backend show in the email client,
  - clicking a draft row opens the existing floating composer tray for that draft.
- Added draft rows with:
  - subject/reply title,
  - recipient preview,
  - body preview,
  - last edited time,
  - draft badge.

## Files Changed
- `frontend/src/pages/Email.tsx`
- `frontend/src/store/draftStore.tsx`
- `HANDOVER.md`

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Gmail drafts are now visible from inside the app email client, not only in Gmail or the floating tray.
- Draft editing remains single-source through the composer tray.

## Next Step
- Browser test:
  1. Open Email → Drafts.
  2. Confirm Gmail draft rows appear.
  3. Click a draft and confirm it opens in the floating composer.
  4. Edit the draft, wait for autosave, confirm Gmail Drafts updates.

---

# HANDOVER - 2026-05-29 - Gmail Draft Sync V2

## Built This Session
- Added native Gmail draft synchronization for the persistent composer:
  - local `EmailDraft` rows now store `gmailDraftId`, `gmailDraftMessageId`, and `lastSyncedToGmailAt`,
  - draft create/autosave updates Gmail via `users.drafts.create` / `users.drafts.update`,
  - deleting a local draft deletes the Gmail draft,
  - sending a Gmail-backed draft now calls `users.drafts.send`.
- Added Gmail draft import on `GET /api/email/drafts`:
  - Gmail drafts created or edited outside the app are pulled into the local composer draft tray,
  - remote Gmail draft deletions remove the matching local draft.
- Added `EmailMessage.isDraftArtifact`:
  - Gmail messages carrying the `DRAFT` label are marked as draft artifacts,
  - draft artifacts are excluded from inbox/sent/thread/search/Blackbook/production/opportunity activity views,
  - full and incremental Gmail sync skip draft messages when deriving real thread state.
- Cleaned historical local data:
  - migration marked 52 existing Gmail draft-like message rows as `isDraftArtifact = true`.

## Files Changed
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260529233000_gmail_draft_sync/migration.sql`
- `backend/src/routes/email.ts`
- `backend/src/routes/opportunities.ts`
- `backend/src/routes/options.ts`
- `backend/src/routes/productions.ts`
- `backend/src/services/emailService.ts`
- `backend/src/services/gmailService.ts`
- `backend/src/services/gmailSyncService.ts`
- `frontend/src/lib/types.ts`
- `frontend/src/store/draftStore.tsx`
- `HANDOVER.md`

## Deployment / Verification
- Prisma migration deployed.
- Prisma client regenerated.
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Composer autosaves should now appear in Gmail as real drafts, not as sent messages.
- Gmail draft saves should no longer appear as sent emails in the email client or Blackbook activity feeds.
- Existing bad draft-save rows remain in the DB for safety but are suppressed from normal UI.

## Next Step
- Test in-browser:
  1. Click Compose, type a subject/body, wait 1-2 seconds, confirm the draft appears in Gmail Drafts.
  2. Edit the draft in Gmail, refresh the app, confirm the local tray pulls the latest draft.
  3. Send from the app, confirm only one sent message appears and the draft disappears from Gmail Drafts.
  4. Open Blackbook activity for the recipient and confirm draft autosaves do not appear as activity rows.

---

# HANDOVER - 2026-05-29 - Email Historical Duplicate Cleanup

## Built This Session
- Added persistent local duplicate suppression for email messages.
- Added `EmailMessage.isDuplicateSuppressed` with an index.
- Added migration `20260529231000_email_duplicate_suppression`.
- Migration marked historical near-duplicate emails as suppressed when they matched:
  - same thread,
  - same sender,
  - same recipients,
  - same subject/body signature,
  - sent within 30 seconds of the previous matching message.
- Updated email queries so suppressed messages are excluded from:
  - thread detail messages,
  - thread attachment summaries,
  - sent-folder latest message grouping,
  - inbox/search message matching,
  - Blackbook CRM activity email matches,
  - opportunity/production comms includes.

## Data Cleanup Result
- 3 historical duplicate message rows were marked as suppressed.
- No Gmail messages were deleted.
- Suppressed rows remain in the DB for audit/safety and will not be shown in normal app timelines.

## Files Changed
- `backend/prisma/schema.prisma`
- `backend/prisma/migrations/20260529231000_email_duplicate_suppression/migration.sql`
- `backend/src/routes/email.ts`
- `backend/src/routes/opportunities.ts`
- `backend/src/routes/options.ts`
- `backend/src/routes/productions.ts`
- `backend/src/services/emailService.ts`
- `HANDOVER.md`

## Deployment / Verification
- Prisma migration deployed.
- Prisma client regenerated.
- Backend build passed.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Historical duplicate sent rows are cleaned from user-facing email and Blackbook activity.
- Future sync will not re-show those rows because suppression is stored locally on the message row.

---

# HANDOVER - 2026-05-29 - Email Duplicate Send / Activity Cleanup

## Built This Session
- Tightened the email composer send path to prevent accidental duplicate sends:
  - backend now keeps an in-flight send lock per draft ID,
  - duplicate send requests return `409 Draft is already sending`,
  - frontend now guards `sendDraft()` with a local in-flight ref before posting.
- Added display-level near-duplicate filtering for email thread messages:
  - exact Gmail/external duplicate IDs are suppressed,
  - same thread/from/recipients/subject/body messages within 30 seconds are shown once.
- Added the same near-duplicate filtering to Blackbook CRM activity email matches so double-sent messages do not create repeated activity rows.
- Improved Blackbook activity text for sent email rows:
  - sent rows now show `To [recipient]` instead of `To Conor`.

## Files Changed
- `backend/src/routes/email.ts`
- `backend/src/routes/options.ts`
- `backend/src/services/emailService.ts`
- `frontend/src/components/blackbook/BlackbookOverlay.tsx`
- `frontend/src/store/draftStore.tsx`
- `HANDOVER.md`

## Deployment / Verification
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- The database currently has unique Gmail message IDs, so this was not a broken unique constraint issue.
- A quick data check found a few likely historical double-send pairs within 10-29 seconds.
- Future double-click/race sends should be blocked before Gmail send.
- Historical near-duplicate sends are suppressed in thread display and Blackbook activity without deleting Gmail or local records.

---

# HANDOVER - 2026-05-29 - Compact Option Sheet Rows

## Built This Session
- Made individual option sheet rows match the compact scanning density of the Crew & Suppliers Matrix.
- Reduced option row/cell height from 62px to 38px.
- Scaled date status cells down so the availability matrix stays tight.
- Reduced image thumbnails from 40px to 28px.
- Made option name + subtitle render on one line.
- Made contact details render on one line instead of stacked email/phone rows.
- Made address cells render as a single compact summary while keeping the address editor available on click.

## Files Changed
- `frontend/src/components/options/OptionsBoardView.tsx`
- `HANDOVER.md`

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Option sheets should now scan much more like Airtable: compact, one-line rows with the availability/date matrix reading first.
- Rich editing still happens through the existing popovers/modals rather than visible row controls.

---

# HANDOVER - 2026-05-29 - Crew Matrix Compact Rows

## Built This Session
- Made Crew & Suppliers Matrix rows significantly denser for scanning.
- Requirement rows reduced from large two-line cards to compact single-line rows.
- Requirement metadata is now low-attention inline text:
  - record count,
  - sheet name,
  - requirement type.
- Workstream section rows are shorter and less visually heavy.
- Date cells were reduced to match the compact row height.
- Header date controls were scaled down to preserve vertical space.

## Files Changed
- `frontend/src/components/options/OptionsBoardView.tsx`
- `HANDOVER.md`

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Matrix should now be much easier to scan vertically.
- Requirement name remains the primary visible data.
- Secondary metadata is visible but deliberately quiet.
- Right-click remains the main place for edit/actions.

---

# HANDOVER - 2026-05-29 - Crew Matrix Remove Kind Column

## Built This Session
- Removed the visible `Kind` column from the Crew & Suppliers Matrix.
- Requirement name now opens the record board directly on click.
- Requirement kind remains visible only as a small secondary metadata label under the requirement name.
- Rename, kind changes, and workstream changes remain in the right-click requirement menu.
- Matrix now has fewer columns and gives more space to the actual requirement/date planning grid.

## Files Changed
- `frontend/src/components/options/OptionsBoardView.tsx`
- `HANDOVER.md`

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Matrix is cleaner:
  - click a requirement name to open the board,
  - right-click a requirement for edit/actions,
  - type/kind no longer consumes a primary grid column.

---

# HANDOVER - 2026-05-29 - Crew Matrix Right Click Cleanup

## Built This Session
- Reduced visible controls on the Crew & Suppliers Matrix page.
- Removed the dedicated hover action column from requirement rows.
- Removed the visible workstream reassignment dropdown from each first row.
- Requirement rows now keep only the essential visible fields:
  - requirement name,
  - record count/sheet link,
  - type label,
  - date matrix cells.
- Added a right-click requirement menu with:
  - open record sheet,
  - duplicate requirement,
  - move up/down,
  - change kind,
  - move workstream,
  - release/reactivate,
  - delete.
- Assignment dropdowns inside date cells now only appear on hover.

## Files Changed
- `frontend/src/components/options/OptionsBoardView.tsx`
- `HANDOVER.md`

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Matrix should feel less cluttered:
  - actions live in context menus,
  - row content is calmer,
  - date/status cells remain primary.

---

# HANDOVER - 2026-05-29 - Crew Matrix Cleanup

## Built This Session
- Cleaned up the Crew & Suppliers Matrix page.
- Removed repeated date labels inside every workstream header row.
- Workstream headers now span the left identity columns and show a compact requirement count.
- Top date headers now use the clearer two-line date treatment and compact date-state controls.
- Requirement rows now have a wider, clearer name column.
- Matrix date cells now fill with pipeline colour like the record sheets:
  - confirmed,
  - first option,
  - second option,
  - requested,
  - needed,
  - unavailable/released.
- Empty/not-required cells are quieter at rest and show a subtle "Set" affordance on hover.

## Files Changed
- `frontend/src/components/options/OptionsBoardView.tsx`
- `HANDOVER.md`

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Matrix should now read more like a clean master planning grid:
  - workstreams are section dividers,
  - requirements are clear rows,
  - date cells carry the planning status visually,
  - less repeated text and less button noise.

---

# HANDOVER - 2026-05-29 - Crew Sheet Sticky Identity Columns

## Built This Session
- Added frozen identity columns to Crew & Suppliers grid view.
- Row selector, image, and option/name columns now stay pinned while horizontally scrolling across wide sheets.
- Added compact date availability summaries into each date column header:
  - confirmed,
  - first option,
  - second option,
  - requested,
  - unavailable/no.
- Date header summaries are based on the currently visible/filtered records.
- Preserved the existing editable status cells and dropdown behaviour.

## Files Changed
- `frontend/src/components/options/OptionsBoardView.tsx`
- `HANDOVER.md`

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Wide Crew & Suppliers sheets should be easier to navigate:
  - record identity remains visible,
  - date headers show immediate availability counts,
  - the availability matrix remains editable.

---

# HANDOVER - 2026-05-29 - Crew Sheet Availability Matrix Polish

## Built This Session
- Refined Crew & Suppliers date availability cells after the full-cell colour pass.
- Date status cells now use softer full-cell fills so the matrix reads clearly without overpowering names/contact data.
- Removed the strong inner-pill feel from date status controls:
  - labels now sit directly in the coloured cell,
  - dropdown affordance remains,
  - blank cells are quiet at rest and become clearer on hover/focus.
- Added subtle left/right bookend borders around the date matrix block.
- Date column headers now share a faint matrix-zone background.
- Active cell focus changed from a heavy blue ring to a finer teal outline.

## Files Changed
- `frontend/src/components/options/OptionsBoardView.tsx`
- `HANDOVER.md`

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Date availability columns should now feel more like a polished availability matrix:
  - clear coloured cell blocks,
  - quieter blanks,
  - less button noise,
  - stronger separation from the record detail columns.

---

# HANDOVER - 2026-05-29 - Crew Sheet Date Matrix Cell Fill

## Built This Session
- Updated Crew & Suppliers date status cells so availability reads as a matrix.
- Date columns now colour the full grid cell by hold status instead of only colouring the inner pill.
- Kept the compact dropdown label inside each coloured cell so statuses remain editable without losing scanability.
- Added separate styles for:
  - full date cell background,
  - compact matrix dropdown button,
  - existing dropdown menu options.

## Files Changed
- `frontend/src/components/options/OptionsBoardView.tsx`
- `HANDOVER.md`

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Availability/date columns should now read as clear coloured blocks:
  - requested,
  - first option,
  - second option,
  - confirmed,
  - unavailable/released.
- The inner label remains a dropdown control, but the cell itself carries the visual weight.

---

# HANDOVER - 2026-05-29 - Crew Sheet Column Alignment Fix

## Built This Session
- Fixed Crew & Suppliers record sheet column alignment.
- Removed hidden grid gaps and row-level padding that caused header/body columns to drift.
- Body cells now own their vertical divider lines, matching the Timeline grid approach.
- Row control column now has a real right border, matching the header checkbox column.
- Date/status cells no longer add extra left padding or extra borders that offset the grid.

## Files Changed
- `frontend/src/components/options/OptionsBoardView.tsx`
- `HANDOVER.md`

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Crew & Suppliers record sheets should now have continuous vertical column lines through header and rows.
- The sheet should feel much closer to the Timeline grid structure.

---

# HANDOVER - 2026-05-29 - Crew & Suppliers Timeline-Style Grid Polish

## Built This Session
- Applied the clearer Timeline visual language to Crew & Suppliers matrix/table surfaces.
- Matrix headers now use:
  - pale `#f7f7f5` header background,
  - stronger small bold date labels,
  - cleaner vertical grid dividers,
  - tighter row rhythm.
- Workstream headers now feel closer to Timeline lane headers:
  - compact colored lane dot,
  - bold 13px lane title,
  - slot count badge,
  - date labels aligned over their columns.
- Requirement rows now use Timeline-like grid borders and hover treatment.
- Candidate/record sheet column headers now use the same clearer small bold uppercase treatment and vertical dividers.

## Files Changed
- `frontend/src/components/options/OptionsBoardView.tsx`
- `HANDOVER.md`

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Crew & Suppliers now visually aligns more closely with Timeline:
  - quieter canvas,
  - clearer headers,
  - more legible small title labels,
  - less visual clutter between columns.

## Suggested Next Steps
- Apply the same row/header treatment to Budget grid headers and section rows.
- Add a reusable grid style helper so Timeline, Crew & Suppliers, and Budget share one visual system instead of diverging.
- Add participant auto-suggestion for Timeline meetings based on confirmed Crew & Suppliers records.

---

# HANDOVER - 2026-05-29 - Crew & Suppliers Matrix Owns Workstreams

## Built This Session
- Moved workstream ownership into the Crew & Suppliers matrix.
- Matrix API now returns project workstreams alongside dates and record sheets.
- Matrix UI now renders requirements grouped under workstream headers.
- Added `+ Workstream` in Crew & Suppliers.
- Added workstream selection when creating a requirement:
  - pick an existing workstream,
  - or create a new workstream inline while adding the requirement.
- Existing record sheets can be reassigned to another workstream directly from the matrix row.
- Workstream names can be edited inline from the matrix.
- Timeline no longer auto-creates/auto-assigns workstreams from unassigned option sheets.
  - This keeps Crew & Suppliers as the source of truth.
  - Timeline still consumes the same `OptionGroup.workstreamId` relation.

## Backend
- Updated `backend/src/routes/options.ts`.
- Updated `backend/src/routes/projectActions.ts`.
- No schema migration required.
- Matrix response now includes:
  - `workstreams`
  - `groups[].workstreamId`
- New/updated endpoints:
  - `POST /api/options/production/:productionId/matrix/workstreams`
  - `PATCH /api/options/matrix/workstreams/:workstreamId`
  - `PATCH /api/options/matrix/groups/:groupId`
  - `POST /api/options/production/:productionId/matrix/groups` now accepts `workstreamId` or `workstreamName`.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Crew & Suppliers matrix now shows:
  - workstream header rows,
  - requirement rows beneath the relevant workstream,
  - a small sheet workstream selector for moving an existing sheet.
- The requirement creation modal now requires the workstream context.

## Deployment / Verification
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Source of truth is now:
  - Workstream = project lane / department / planning group.
  - Requirement = slot inside that workstream.
  - Record sheet = options/candidates attached to the requirement group.
- Timeline should be treated as a planning view generated from this structure, not the place to define it.

## Suggested Next Steps
- Add workstream templates for common project types.
- Add drag/drop movement of sheets between workstreams in the matrix.
- Update Timeline action creation so meetings/tasks can auto-suggest participants from confirmed records in the selected workstream.
- Add a meeting composer that can create calendar invites using confirmed Blackbook contacts from a workstream/date.

---

# HANDOVER - 2026-05-29 - Crew & Suppliers Airtable Naming Pass

## Built This Session
- Reframed the project `Options` module as the user-facing `Crew & Suppliers` workspace.
- Kept the existing backend routes, URL parameters, and internal option/candidate model names intact for compatibility.
- Updated the visible production module navigation:
  - `Options` now displays as `Crew & Suppliers`.
- Updated the Airtable-style workspace copy:
  - Matrix remains the master workstream/date plan.
  - Requirements open record sheets.
  - Sheet rows are now presented as records rather than candidates.
  - Empty states, action buttons, assignment tooltips, default row names, delete prompts, and image-manager copy now follow the new language.
- Updated PO supplier creation copy:
  - `From job options` is now `From Crew & Suppliers`.
  - empty state is now `No linked record`.

## Files Changed
- `frontend/src/pages/Productions.tsx`
- `frontend/src/components/options/OptionsBoardView.tsx`
- `HANDOVER.md`

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- The user-facing model is now:
  - `Crew & Suppliers` = parent workspace inside a project.
  - `Matrix` = master workstream/date plan.
  - `Requirement` = role/service slot that needs filling.
  - `Record sheet` = the pool of possible people/suppliers/locations for a requirement.
  - `Record` = a candidate/supplier/location row in that sheet.
- The implementation still uses existing internal `options` route names and `candidate` code identifiers, which avoids a risky broad refactor.

## Suggested Next Steps
- Add the Crew & Suppliers structure directly to settings/templates so new projects can start with workstream + requirement presets.
- Add drag/drop assignment of record sheets between workstream lanes.
- Continue the Airtable-style polish on Budget using the same nav, sheet, toolbar, and grid primitives.

---

# HANDOVER - 2026-05-29 - Manual Workstream Groups for Timeline Lanes

## Built This Session
- Corrected the timeline model so workstreams are manually managed project lanes, not one-to-one mirrors of option sheets.
- Option sheets now attach underneath a workstream lane:
  - one workstream can contain multiple option sheets,
  - one option sheet can still contain multiple required slots, such as `Photo Assistant x3`.
- Added a workstream editor drawer in the Timeline tab:
  - create a lane,
  - rename a lane,
  - set lane color,
  - tick which option sheets feed that lane.
- Updated Timeline lane display:
  - lane shows attached option sheet chips,
  - lane summary pulls required slots from all attached sheets,
  - confirmed assignments still surface in the lane summary where available.
- Existing projects remain compatible:
  - legacy one-option-sheet lanes are migrated into the new attachment model when the timeline loads.

## Backend
- Updated `backend/prisma/schema.prisma`.
- Added migration:
  - `backend/prisma/migrations/20260529200000_workstream_option_group_assignment/migration.sql`
- Updated:
  - `backend/src/routes/projectActions.ts`
- Added `workstreamId` to `OptionGroup`.
- `ProjectWorkstream` now has:
  - `optionGroups` as the current source-of-truth relation,
  - `optionGroupId` only kept as a legacy compatibility relation.
- New/updated endpoint:
  - `PATCH /api/project-actions/workstreams/:workstreamId/option-groups`

## Frontend
- Updated:
  - `frontend/src/components/timeline/ProductionTimelineView.tsx`
  - `frontend/src/lib/types.ts`
- Timeline top bar now has `+ Lane`.
- Each lane has a `Sheets` action to manage which option sheets feed it.

## Deployment / Verification
- Prisma migration deployed successfully.
- Prisma client regenerated.
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- The intended structure is now:
  - Workstream = project planning lane, e.g. Photo, Styling, Locations, Catering.
  - Option sheet = candidate pool, e.g. Photographer, Photo Assistant, Camera Kit.
  - Requirement slot = actual role to fill, e.g. Photo Assistant 1, Photo Assistant 2, Photo Assistant 3.
- This gives the timeline a client/planning shape while preserving the granular option board underneath.

## Suggested Next Steps
- Add drag/drop assignment of option sheets between lanes.
- Add workstream templates per job type so new jobs can start with sensible lanes.
- Add a Matrix setting to choose which workstream each option sheet belongs to without leaving Options.
- Add global Timeline/Calendar view using these same workstreams as filters/layers.

---

# HANDOVER - 2026-05-29 - Project Timeline Workstreams and Calendar-Linked Actions

## Built This Session
- Added the first production timeline foundation:
  - option groups now become project workstream lanes,
  - dated actions/tasks can be created inside a workstream lane,
  - actions can link to option requirements, option candidates, blackbook entries, email threads/messages, and calendar events.
- Added Google Calendar-backed scheduling for project actions:
  - dated actions create/update a `CalendarEvent`,
  - the existing Google Calendar push service syncs those events out so reminders can appear on phone/calendar.
- Added a new Production module tab:
  - `Timeline`
  - It shows a 14-day lane view, with option groups down the left and dates across the top.
  - Double-clicking a lane/date cell creates an action.
  - Clicking an action opens a right-side editor.
- Added email-message action hooks:
  - expanded email messages now expose a small `+ task` hover action,
  - this creates a production action linked to that exact email message,
  - if the thread is not linked to a production, the endpoint returns a clear error.

## Backend
- Updated `backend/prisma/schema.prisma`.
- Added migration:
  - `backend/prisma/migrations/20260529140000_project_workstreams_actions/migration.sql`
- Added API route:
  - `backend/src/routes/projectActions.ts`
- Mounted route:
  - `/api/project-actions`
- New models:
  - `ProjectWorkstream`
  - `ProjectAction`
- New enums:
  - `ProjectActionType`
  - `ProjectActionStatus`
  - `ProjectActionVisibility`
- New endpoints:
  - `GET /api/project-actions/production/:productionId`
  - `POST /api/project-actions/production/:productionId/workstreams`
  - `PATCH /api/project-actions/workstreams/:workstreamId`
  - `POST /api/project-actions/production/:productionId/actions`
  - `PATCH /api/project-actions/actions/:actionId`
  - `DELETE /api/project-actions/actions/:actionId`
  - `POST /api/project-actions/email/messages/:messageId/actions`
- Migration note:
  - Prisma diff again tried to drop `pms_sessions`.
  - That unrelated `DROP TABLE` was removed before deploy.

## Frontend
- Added:
  - `frontend/src/components/timeline/ProductionTimelineView.tsx`
- Updated:
  - `frontend/src/pages/Productions.tsx`
  - `frontend/src/pages/Email.tsx`
  - `frontend/src/lib/types.ts`
- Production navigation now includes `Timeline`.
- Email message rows can create a linked project task from the exact message.

## Deployment / Verification
- Prisma migration deployed successfully.
- Prisma client regenerated.
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- This is a working foundation, not the final Fantastical/Spark-level polish.
- Workstream lanes are currently generated from option groups, which matches the intended structure:
  - Photo, Styling, Locations, Catering, etc.
- Confirmed option assignments are surfaced in the lane label area when available.
- Project actions are the central link object for:
  - internal tasks,
  - client-facing timeline items,
  - Google Calendar reminders,
  - exact email-message context.

## Suggested Next Steps
- Build the full global Calendar workspace:
  - layered personal diary,
  - all project timelines,
  - toggle visible productions/workstreams.
- Upgrade the production Timeline view:
  - drag actions between dates/lanes,
  - resize multi-day items,
  - better client/internal visibility controls,
  - lane color settings.
- Add a task/action inbox:
  - overdue,
  - due today,
  - waiting,
  - blocked,
  - by project/workstream.
- Upgrade email around this:
  - show linked tasks under each thread,
  - create action from selected text,
  - open a thread with one exact linked message expanded and the rest collapsed.
- Add client timeline PDF/export after the on-screen workflow is stable.

---

# HANDOVER - 2026-05-29 - Budget Transfers, Version Metadata, and Estimate PDF Polish

## Built This Session
- Added revision-level estimate metadata so each estimate version can be described professionally:
  - estimate description,
  - included notes,
  - not included notes,
  - assumptions,
  - payment terms,
  - valid until,
  - representative,
  - change summary.
- Added a budget line transfer ledger for covering overages from another budget pot without changing the quoted estimate or actual cost records.
- Added API support for:
  - `GET /api/budgets/revisions/:revisionId/compare`
  - `POST /api/budgets/revisions/:revisionId/transfers`
  - `POST /api/budgets/subcosts/:subCostId/convert-to-bill`
- PO-to-Bill conversion in the cost-lines drawer now opens a small conversion form:
  - bill amount defaults to the PO amount,
  - if the bill is higher than the PO, it shows the overage,
  - user can choose a source pot to cover the overage or leave it as a simple overage.
- Cost-lines drawer now shows transfer activity on a line and uses adjusted balance when transfers exist.
- Budget version drawer now has:
  - editable estimate description / included / not included / assumptions / payment terms,
  - change summary,
  - compare-to-source section for minor versions showing line-level changes and total delta.
- Rebuilt estimate PDF export to follow the clean Melanie Nennig / Joy Hart direction:
  - first page with brand, estimate metadata, client/project details, summary, comments, payment terms, and company footer,
  - compact breakdown pages that pack sections instead of creating a page per section,
  - client export hides actuals,
  - internal export keeps an INTERNAL watermark and actuals column,
  - filename now uses the estimate version label and date.

## Backend
- Updated `backend/prisma/schema.prisma`.
- Added migration:
  - `backend/prisma/migrations/20260529110000_budget_transfers_revision_metadata/migration.sql`
- Updated:
  - `backend/src/services/budgetService.ts`
  - `backend/src/routes/budgets.ts`
  - `backend/src/services/budgetPdf.ts`
- Important migration note:
  - Prisma diff attempted to drop `pms_sessions` because it exists in DB but not the Prisma schema.
  - That unrelated drop was removed from the migration before deploy.

## Frontend
- Updated:
  - `frontend/src/components/budgets/BudgetView.tsx`
  - `frontend/src/lib/types.ts`
- Version drawer now functions as the estimate admin area for describing versions and reviewing what changed.
- Cost line conversion has a clearer overage decision point.

## Deployment / Verification
- Prisma migration deployed successfully.
- Prisma client regenerated.
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Immutable budget behavior still stands:
  - changes to locked/sent revisions clone into a new minor version,
  - major versions are still created from the `+` version tab.
- Transfers are tracked separately from estimates and actual spend:
  - actuals still mean real PO/Bill/Receipt/Quick cost amounts,
  - transfers are just an internal pot-balancing ledger.
- PDF styling is now much closer to the supplied estimate references, but the next pass should be visual QA against real exported PDFs.

## Suggested Next Steps
- Add a dedicated `Transfers`/`Overage cover` view in the cost tracker so pot movements are auditable in one place.
- Add attachment/AI parsing into the single PO-to-Bill conversion form, matching the existing multi-line PO bill parser.
- Add “Promote V1.1 to V2” action with a required reason for bigger job-format changes.
- Add a real PDF preview/download flow so client and internal exports can be checked before sending.

---

# HANDOVER - 2026-05-29 - Cost Lines Drawer Layout Tune-up

## Built This Session
- Tuned the budget `Cost lines` side drawer.
- Fixed type dropdown clipping when only one/few cost lines exist:
  - removed clipping from the cost-lines table card,
  - side panel now allows horizontal overflow for floating menus,
  - last row type dropdown opens upward so it does not disappear under the row container.
- Cleaned up the drawer row grid:
  - widened the type column,
  - tightened amount/status/action columns,
  - increased row minimum height slightly,
  - reduced status padding so text no longer collides with delete/actions.
- No backend or schema changes.

## Frontend
- Updated `frontend/src/components/budgets/BudgetView.tsx`.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Cost-line type menus should no longer get hidden inside the drawer table when there are too few rows.
- Drawer layout should read cleaner for single-line and short-list cost workflows.

---

# HANDOVER - 2026-05-29 - Budget Available Balance and Quick Cost Workflow

## Built This Session
- Reworked budget balance language so open budget pots do not read as profit.
- The old `Remaining` column is now `Balance`.
- Parent line balance now labels itself by state:
  - `Available` for open positive balance,
  - `Released` for closed positive balance,
  - `Over` for negative balance.
- Added a new cost line type:
  - `PENDING_RECEIPT`
  - shown to users as `Quick cost`.
- Quick costs are for on-the-go spend capture where the cost is known but the receipt is missing, e.g. `Uber £40`.
- Quick costs count against the budget immediately and are treated as paid/known spend, but remain visible in the missing-receipt workflow.
- Added Quick cost creation in:
  - parent row right-click menu,
  - cost-lines drawer.
- Updated line type dropdowns and pills to include `Quick cost`.
- Updated the budget footer summary:
  - committed,
  - paid / known,
  - open balance,
  - released margin,
  - forecast profit,
  - overages,
  - existing PO / invoice attention counts.
- Added a project-level `Cost tracker` drawer from the budget grid toolbar.
- Cost tracker filters:
  - All costs,
  - Open POs,
  - Bills unpaid,
  - Bills paid,
  - Receipt missing,
  - Reconciled,
  - Over-budget lines,
  - Released margin.
- The tracker provides a cleaner reconciliation command centre without crowding the budget grid.

## Backend
- Updated `backend/prisma/schema.prisma`.
- Added migration:
  - `backend/prisma/migrations/20260529100000_sub_cost_pending_receipt/migration.sql`
- Updated `backend/src/routes/budgets.ts`.
- `PENDING_RECEIPT` lifecycle:
  - `isAgreed: true`,
  - `isInvoiced: true`,
  - `isPaid: true`,
  - `datePaid` set on create/type-change,
  - still identifiable as missing receipt through line type/proof checks.

## Frontend
- Updated `frontend/src/components/budgets/BudgetView.tsx`.
- Updated `frontend/src/components/budgets/budgetStatus.ts`.
- Updated `frontend/src/lib/types.ts`.

## Deployment / Verification
- Prisma migration deployed successfully.
- Prisma client regenerated.
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Budget pots can stay open without their balance being treated as profit.
- Closing a line now makes the remaining positive balance read as released margin.
- Fast spend capture is possible before a receipt exists.
- Reconciliation has a dedicated filtered drawer for the main stages.
- Useful next pass:
  - transfer released balance between parent pots with an audit trail,
  - attach receipt later to convert Quick cost to Receipt,
  - AI receipt/bill extraction directly from the cost tracker,
  - saved reconciliation views and counts on the project nav.

---

# HANDOVER - 2026-05-28 - Budget Layout and Cost Drawer Pass

## Built This Session
- Improved the budget layout and interaction flow without changing budget calculations or backend data models.
- Moved the summary metrics out of the top stack into a compact sticky footer:
  - the grid starts sooner,
  - totals remain visible while working,
  - state counts still show below the metrics.
- Added frozen identity columns to the budget grid:
  - status dot,
  - code,
  - description.
- This keeps row identity visible while horizontally scrolling across numeric and note fields.
- Tightened the grid toolbar so it reads more like the Options/Airtable workspace:
  - `Grid view · fields visible`,
  - hide-fields menu remains in the sticky toolbar.
- Made `Actuals` the clear entry point for cost management:
  - clicking an Actuals value opens a right-side `Cost lines` drawer,
  - the drawer shows estimate / actuals / remaining,
  - no-cost lines explain why the grid shows estimate as a grey placeholder and remaining as zero,
  - users can add PO / Bill / Receipt from the drawer,
  - existing cost lines can be edited, converted, marked paid, or deleted from the drawer.
- Kept the existing multi-line PO workflow available from both the row action and cost drawer.

## Frontend
- Updated `frontend/src/components/budgets/BudgetView.tsx`.

## Backend
- No backend changes.
- No schema changes.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Budget is now closer to the Options workspace in structure and daily use:
  - cleaner top area,
  - persistent totals,
  - frozen row identity,
  - cost-line management moved into a focused drawer instead of overloading the grid.
- Useful next pass:
  - column resizing/reordering for the budget grid,
  - saved budget views,
  - fuller PO supplier onboarding with AI document extraction,
  - compare-version drawer showing line-level deltas.

---

# HANDOVER - 2026-05-28 - Budget Airtable Interaction Pass

## Built This Session
- Added the next Airtable-style interaction pass to the budget grid.
- Budget rows now use a shared dynamic column model instead of fixed local grid strings:
  - internal and client column definitions are centralized in `BudgetView.tsx`,
  - visible columns drive headers, parent rows, cost lines, draft cost lines, and section totals,
  - hidden fields are persisted in `localStorage`.
- Added a sticky budget fields toolbar above the column headers:
  - shows visible field count,
  - opens a `Hide fields` menu,
  - lets users show/hide non-essential columns.
- Added spreadsheet-style active cell navigation:
  - focused/clicked cells get an active outline,
  - arrow keys move between editable budget cells,
  - Enter activates the current cell,
  - Escape clears selection.
- Expanded parent-row right-click actions:
  - Multi-line PO,
  - + PO,
  - + Bill,
  - + Receipt,
  - Duplicate,
  - Close,
  - Delete.
- Added a budget version drawer:
  - opens from the history button in the budget header,
  - lists all versions with status, total, change summary/source, and update timestamp,
  - selecting a version loads it.
- Added a multi-line PO creation panel from the budget:
  - starts from a selected budget line,
  - can search/select Blackbook suppliers,
  - can pull supplier details from current job option candidates,
  - can create a new Blackbook supplier record while creating the PO,
  - allocates one PO across multiple budget parent line items while keeping each line clear.

## Backend
- Updated `backend/src/routes/budgets.ts`.
- Multi-line PO creation now respects immutable budget revisions:
  - if allocations target a locked/sent revision, the backend clones it to a draft minor version before creating PO cost lines,
  - allocation line IDs are remapped to the cloned revision,
  - response includes the updated revision so the frontend can switch immediately.
- No schema changes and no migrations.

## Frontend
- Updated `frontend/src/components/budgets/BudgetView.tsx`.
- The current pass is scoped to the budget UI/workflow; other modules were not edited.

## Deployment / Verification
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Budget now has the first serious pass of the same interaction language as Options:
  - softer Airtable-style surface,
  - active cells,
  - column visibility,
  - richer row menus,
  - immutable version awareness,
  - multi-line PO workflow.
- Useful next pass:
  - persistent per-user budget column widths/order,
  - drag-to-reorder budget columns,
  - saved budget views,
  - richer PO supplier onboarding form with file/AI extraction,
  - dedicated project PO sheet polish.

---

# HANDOVER - 2026-05-28 - Budget Grid Soft Theme Pass

## Built This Session
- Restyled the budget grid to better match the newer Airtable/options workspace theme.
- Softened the visual system without removing the ADHD-friendly scanning cues:
  - calmer sheet background and header treatment,
  - softer row borders and hover states,
  - taller parent rows for readability,
  - stronger but cleaner status dots with a subtle white ring,
  - quieter section headers with colored section badges instead of heavy dark bars,
  - gentler cost-line type colors for PO / Bill / Receipt rows,
  - deeper cost-line indentation so child spend records read clearly under their parent budget pot.
- Updated inline editing states:
  - teal focus rings,
  - softer save flash,
  - quieter input backgrounds,
  - calmer dropdown and tooltip shadows.
- Kept all budget logic untouched:
  - no schema changes,
  - no backend changes,
  - no calculation changes,
  - no versioning changes.

## Frontend
- Updated `frontend/src/components/budgets/BudgetView.tsx`.
- Updated `frontend/src/components/budgets/budgetStatus.ts`.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Budget grid is visually softer and more aligned with the options table direction while retaining quick scan states.
- Useful next pass: bring budget interactions closer to Options v1.1:
  - persistent column widths / show-hide,
  - active cell outline and keyboard movement,
  - right-click row actions with the same menu styling,
  - saved budget views.

---

# HANDOVER - 2026-05-28 - Budget Version Tabs and Immutable Minor Versions

## Built This Session
- Added the first Airtable-style budget workspace pass.
- Replaced the old revision dropdown presentation with clean budget version tabs:
  - `V1`, `V1.1`, `V2`, etc.
  - status pills on each version tab,
  - active version has a clear selected state.
- Added immutable revision metadata to `BudgetRevision`:
  - `majorVersion`
  - `minorVersion`
  - `sourceRevisionId`
  - `isLocked`
  - `lockedAt`
  - `changeSummary`
- Existing revisions were migrated so their major version matches the old `revisionNumber`.
- Locking behaviour:
  - Sent / Approved / Superseded revisions are treated as immutable.
  - Manually locked revisions are also immutable.
  - Marking a revision as Sent / Approved / Superseded sets `isLocked` and `lockedAt`.
- Core budget edit routes now clone immutable revisions before applying changes:
  - revision settings,
  - apply template,
  - add/update/delete/reorder sections,
  - add/update/delete/duplicate/reorder line items,
  - add/update/delete/status-change cost lines.
- Editing a locked version creates a new draft minor version from it, e.g. `V1.1`, then applies the change to that new version.
- The frontend detects the cloned revision response, switches to it, refreshes version tabs, and shows a toast.
- The budget header now follows the newer project workspace style:
  - project identity left,
  - project module nav centre,
  - version status/export actions right,
  - budget version tabs on the second row,
  - cleaner grid toolbar below.

## Backend
- Updated `backend/prisma/schema.prisma`.
- Added migration:
  - `backend/prisma/migrations/20260528135000_budget_revision_immutability/migration.sql`
- Updated `backend/src/services/budgetService.ts`.
- Updated `backend/src/routes/budgets.ts`.

## Frontend
- Updated `frontend/src/components/budgets/BudgetView.tsx`.
- Updated `frontend/src/lib/types.ts`.

## Deployment / Verification
- Prisma migration deployed successfully.
- Prisma client regenerated.
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Budget revisions now have a real immutable/minor-version foundation.
- The visible budget workspace is closer to the Airtable-style project interface.
- Next useful pass: bring the budget grid itself up to the Options grid standard:
  - active cell outline,
  - keyboard navigation,
  - column show/hide,
  - saved budget views,
  - drag row reorder with insertion feedback.

---

# HANDOVER - 2026-05-28 - Options Grid Active Cell Pass

## Built This Session
- Added Airtable-style active cell selection to the options grid view.
- Clicking or focusing a cell now shows a clear blue active-cell outline.
- Keyboard navigation now works in the grid:
  - Arrow keys move between cells,
  - Tab / Shift+Tab move horizontally and wrap between rows,
  - Enter activates the current cell editor/dropdown/link,
  - Escape clears the active cell.
- Active-cell support is wired through:
  - core option fields,
  - project date status columns,
  - notes,
  - links,
  - address,
  - rate/state,
  - custom fields.
- No backend or schema changes.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Options grid now has a proper spreadsheet interaction foundation.
- Next useful pass: copy/paste support, multi-cell selection, and persistent active row detail preview.

---

# HANDOVER - 2026-05-28 - Options Column Drag Feedback

## Built This Session
- Improved drag and drop feedback in the options table view.
- Column reordering now starts from an explicit header drag handle instead of the whole header cell.
- While dragging a column:
  - the source column fades,
  - valid targets show a blue tinted cell,
  - a clear blue insertion marker appears on the target edge.
- Row reorder feedback was tightened to match the column interaction:
  - dragged rows keep the handle visible,
  - drop targets show a thin blue insertion line.
- Sorting, header menus, resizing, and existing column persistence are unchanged.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Backend
- No backend or schema changes.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Options grid column drag/drop should now feel more deliberate and legible.
- Next useful pass: richer Airtable-style cell selection / active-cell outline and keyboard navigation.

---

# HANDOVER - 2026-05-28 - Options Gallery View

## Built This Session
- Made `Gallery` in the options left rail a real Airtable-style card view.
- Added a sheet display mode:
  - `grid`
  - `gallery`
- Gallery view reuses the same candidate set as the grid:
  - current base view,
  - current filters,
  - current sort,
  - current visible fields / saved view column snapshot.
- Gallery cards show:
  - cover image,
  - candidate name/subtitle,
  - active/parked/released state,
  - up to three date status pills,
  - contact metadata,
  - selected visible fields,
  - link icons,
  - Blackbook record shortcut.
- Added a `Gallery` / `Grid` toggle in the candidate sheet toolbar.
- The left rail now highlights Gallery when active.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Backend
- No backend or schema changes.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Options sheets now have a functional visual card mode.
- The `Customize cards` button is visible as the next control surface but not wired yet.
- Next useful pass: card customization settings persisted in saved views.

---

# HANDOVER - 2026-05-28 - Persisted Options Saved Views

## Built This Session
- Added persisted saved views for options candidate sheets.
- Added new Prisma model/table:
  - `OptionSavedView`
  - table: `pms_option_saved_views`
- Saved views store:
  - name and icon,
  - base candidate view,
  - filters,
  - sort key and direction,
  - a column layout snapshot with width/order/hidden state.
- Added options API endpoints:
  - `POST /api/options/matrix/groups/:groupId/views`
  - `PATCH /api/options/matrix/views/:viewId`
  - `DELETE /api/options/matrix/views/:viewId`
- Matrix responses now include `savedViews` for each option group.
- The left options rail now lists saved views and allows deleting them.
- The candidate sheet toolbar now has `Save view`, which captures the current grid state.
- Applying a saved view updates the current render without rewriting the underlying global column layout.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Backend
- Updated `backend/prisma/schema.prisma`.
- Added migration:
  - `backend/prisma/migrations/20260528132000_option_saved_views/migration.sql`
- Updated `backend/src/routes/options.ts`.

## Deployment / Verification
- Prisma migration deployed successfully.
- Prisma client regenerated.
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Options sheets can now save and recall custom views.
- The first version stores filters/sort/column state; view-specific editing is still intentionally lightweight.
- Next useful pass: Gallery view powered by saved view field selections.

---

# HANDOVER - 2026-05-28 - Options Select Field Configuration

## Built This Session
- Added configuration for custom `Single select` and `Multiple select` fields.
- Column header menus now show an options editor for select fields:
  - one option per line,
  - comma-separated values also supported,
  - options are saved into the existing `OptionColumn.config`.
- New select fields now start with sensible default options:
  - Requested
  - Shortlisted
  - Approved
- Custom select cells now render as compact colored pill dropdowns.
- Multi-select cells support multiple pill values in a compact dropdown.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Backend
- No backend or schema changes.
- Reused existing `OptionColumn.config` JSON persistence.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Custom select fields are now useful in the grid rather than behaving like plain text.
- Next useful pass: persisted saved views for filters/sorts/field visibility.

---

# HANDOVER - 2026-05-28 - Options Field Type Picker and Export PDF Button

## Built This Session
- Restored `Export PDF` directly into the selected options sheet toolbar.
- The button calls the existing group PDF export endpoint and shows a generating state.
- Reworked `+ Field` into a more Airtable-like field picker:
  - field name input,
  - searchable field type list,
  - grouped field types,
  - short descriptions for each type,
  - sensible default widths per field type.
- Field creation still uses the existing `OptionColumn` API and persists on the sheet.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Backend
- No backend or schema changes.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Options sheets now have visible PDF export from within the sheet.
- Custom field creation is closer to Airtable’s type-first workflow.
- Next useful pass: field configuration for select options and a saved views model.

---

# HANDOVER - 2026-05-28 - Options Airtable Column Controls Foundation

## Built This Session
- Strengthened the Airtable-style options grid column foundation.
- Column resizing now previews live while dragging the header resize handle instead of only jumping after save.
- The existing column persistence is now more usable from the field manager:
  - show/hide any column,
  - adjust column width numerically,
  - move fields left/right,
  - see whether a field is Blackbook/core or custom,
  - see each field type.
- Column changes continue to save through the existing `OptionColumn` API and persist per option sheet.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Backend
- No backend or schema changes.
- Existing `OptionColumn` persistence was already present and reused:
  - `width`
  - `order`
  - `hidden`
  - `type`
  - `locked`

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Options sheets now have a stronger field manager for v1.1 column layout work.
- Header drag reorder and resize remain available directly in the grid.
- The next useful pass is a proper Airtable-style add-field/type menu and persisted saved views.

---

# HANDOVER - 2026-05-28 - Options Toolbar Constraint and Horizontal Scroll Follow-up

## Built This Session
- Fixed the remaining options candidate sheet width issue where the toolbar could still stretch the workspace and prevent rightward scrolling.
- The selected candidate sheet root is now explicitly constrained with:
  - `min-w-0`
  - `overflow-hidden`
  - full-width toolbar containment
- The grid body now owns the horizontal scroll surface with:
  - `width: 100%`
  - `minWidth: calculated sheet width`
- The add-candidate row now uses the same scroll canvas width, so it lines up with the grid columns.
- Secondary placeholder toolbar actions are hidden more aggressively at narrower widths, keeping the core controls contained:
  - Hide fields
  - Filter
  - Sort
  - Field
  - Candidate
  - Design PDF

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Backend
- No backend or schema changes.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- The options toolbar should stay inside the visible sheet area.
- The options grid should scroll horizontally when columns exceed the viewport.
- Candidate menus/popovers should remain unclipped by the old card wrapper.

---

# HANDOVER - 2026-05-28 - Options Horizontal Scroll and Toolbar Clamp Fix

## Built This Session
- Fixed option candidate sheet horizontal scrolling after the scroll-container pass.
- The grid body now has an explicit scroll canvas width:
  - `width: max(100%, [calculated sheet width]px)`
  - this forces horizontal scroll when columns exceed the visible workspace.
- Fixed the toolbar stretching off-screen.
- Toolbar controls now stay inside the visible pane:
  - left view controls are fixed-width,
  - right controls are constrained,
  - lower-priority placeholder controls hide at smaller widths,
  - core actions remain visible: Hide fields, Filter, Sort, Search, Field, Candidate, Design PDF.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Backend
- No backend or schema changes.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Long option sheets should scroll vertically and horizontally.
- The toolbar should remain fixed and contained inside the viewport.

---

# HANDOVER - 2026-05-28 - Options List Scrolling Fix

## Built This Session
- Fixed option candidate sheets not scrolling vertically.
- Converted the selected sheet area into a proper full-height flex container.
- The candidate toolbar remains fixed at the top of the sheet.
- The grid body now owns vertical and horizontal scrolling.
- This preserves the Airtable-like layout while allowing long option lists to scroll normally.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Backend
- No backend or schema changes.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Long option candidate lists should scroll within the options workspace.
- The toolbar and header rows remain usable while reviewing longer sheets.

---

# HANDOVER - 2026-05-28 - Options Candidate Filters and Computed Views

## Built This Session
- Added frontend-only candidate filtering for option sheets.
- The toolbar `Filter` control now opens a real filter popover.
- Filters currently support:
  - candidate state: Active, Parked, Released,
  - date status: any, blank, Req, 1st, 2nd, Confirmed, Released, Unavailable, N/A,
  - Blackbook link: all, linked, unlinked,
  - images: all, with images, without images.
- Added computed saved views in the left rail:
  - Grid view,
  - Active only,
  - Needs chasing,
  - Confirmed,
  - Missing Blackbook,
  - No images.
- Saved view buttons show live counts for the current sheet.
- Candidate grid now combines the selected left-rail view with the active toolbar filters.
- No schema changes yet; this pass validates the UX before persisting custom views.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Backend
- No backend or schema changes.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Option sheets can now be filtered quickly without changing data.
- Saved views are computed defaults, not persisted user-created views yet.

## Exact Next Steps
1. Add real sort menu with explicit sort choices.
2. Add persisted saved views once the defaults feel correct.
3. Add full field manager drawer.
4. Build Gallery view using the same filters and fields.

---

# HANDOVER - 2026-05-28 - Options Candidate Duplicate Action

## Built This Session
- Added backend support for duplicating option candidates:
  - `POST /api/options/matrix/candidates/:candidateId/duplicate`
- Duplicate now copies safe candidate metadata:
  - core candidate fields,
  - linked Blackbook entry reference,
  - selected address reference,
  - date availability statuses,
  - custom sheet field values,
  - photo records pointing to existing stored files.
- Duplicate deliberately does not copy:
  - purchase orders,
  - matrix role assignments,
  - unique public PDF token / stored PDF path,
  - static map image cache.
- Wired the row context menu `Duplicate record` action to the new endpoint.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Backend
- Updated `backend/src/routes/options.ts`.
- No schema migration required.

## Deployment / Verification
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Right-clicking an option candidate row and choosing `Duplicate record` creates a copy at the bottom of the same candidate sheet.
- The duplicate keeps option/deck metadata but avoids copying operational commitments.

## Exact Next Steps
1. Add real filter and saved view support for candidate sheets.
2. Add a full field manager drawer.
3. Add record link/copy URL behaviour.
4. Build Gallery view.

---

# HANDOVER - 2026-05-28 - Options Expanded Record Panel

## Built This Session
- Made the row context menu `Expand record` action real.
- Added a right-side expanded candidate record panel for option sheets.
- The panel edits the same candidate record as the grid and includes:
  - candidate name,
  - subtitle,
  - active state,
  - rate,
  - date availability statuses,
  - Blackbook/contact controls,
  - links,
  - address,
  - deck and internal notes,
  - custom sheet fields.
- The panel can open the candidate photo manager.
- The panel delete action removes the record after confirmation.
- Existing grid updates remain API-backed; no new backend/schema work was needed.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Backend
- No backend or schema changes.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Option candidates can now be opened in a focused side panel from the right-click menu.
- Duplicate record, copy record link, and real filtering/grouping remain pending.

## Exact Next Steps
1. Add duplicate-record backend support and wire the context menu.
2. Add a proper field manager drawer for field type/visibility/order settings.
3. Implement real filters and saved views.
4. Build Gallery view from the same field definitions.

---

# HANDOVER - 2026-05-28 - Options Airtable Grid Interaction Pass

## Built This Session
- Added a more Airtable-like toolbar above option candidate sheets:
  - view menu,
  - `Grid view` selector styling,
  - `Hide fields`,
  - placeholder `Filter`, `Group`, `Color`, `Share/export`, and `Search`,
  - quieter `Field`, `Candidate`, and `Design PDF` actions.
- Added a left row-control column:
  - row number at rest,
  - drag handle and checkbox on row hover,
  - select-all checkbox in the header.
- Added a fixed, cursor-positioned right-click context menu for option rows.
- Row context menu currently includes:
  - Ask Omni placeholder,
  - insert record below,
  - duplicate placeholder,
  - expand placeholder,
  - manage photos,
  - open Blackbook record when linked,
  - copy link placeholder,
  - delete record.
- Preserved existing right-click behaviour inside the Links cell so it still opens the links editor rather than the row menu.
- Moved `+ Candidate` into the toolbar and kept the inline add-row affordance at the bottom of the sheet.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Backend
- No backend or schema changes.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Options sheets now have the first proper Airtable-style grid interaction layer.
- Some toolbar/context actions are intentionally visual placeholders pending dedicated implementation:
  - Filter,
  - Group,
  - Color,
  - Share/export,
  - Duplicate,
  - Expand record,
  - Copy record link.

## Exact Next Steps
1. Implement real field filtering and sorting against core/custom fields.
2. Add a real expanded record side panel for option candidates.
3. Add duplicate-record support in the backend and wire the context menu action.
4. Build the Gallery view from the same field definitions.

---

# HANDOVER - 2026-05-28 - Options Sheet Wrapper Removed

## Built This Session
- Removed the card-style wrapper around candidate sheets.
- Candidate grids now sit directly on the workspace canvas, closer to Airtable:
  - no rounded sheet container,
  - no box shadow,
  - no outer card border,
  - header row is the sheet boundary.
- Kept overflow visible so row popovers and right-click menus are not clipped on sparse sheets.
- Kept a full-height sheet surface so one-row boards still feel like a proper grid, not a small inset table.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Backend
- No backend or schema changes.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Options candidate sheets are cleaner and less boxed-in.
- Menus/popovers should still escape the grid cleanly.

---

# HANDOVER - 2026-05-28 - Options Sparse Sheet Popover Clipping Fix

## Built This Session
- Fixed a clipping issue on newly-created option sheets with only one candidate row.
- Candidate sheet row menus/popovers are no longer trapped inside the bordered sheet container.
- Added minimum sheet height so sparse sheets have enough vertical room for right-click menus, contact/link/address popovers, and inline controls.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Backend
- No backend or schema changes.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- New option boards with one row should no longer cut off row menus or popovers.
- Existing dense sheets are unchanged except that popovers can overflow the table shell correctly.

---

# HANDOVER - 2026-05-28 - Project Module Nav Moved Into Top Workspace Header

## Built This Session
- Replaced the placeholder `Data / Automations / Interfaces / Forms` top-centre navigation with the real project module navigation.
- The top Airtable-style header now carries:
  - `Overview`
  - `Options`
  - `Budget`
  - `Dates`
  - `Crew List`
  - `POs`
  - `Comms`
  - `Files`
- Removed the duplicate pale module strip from the shared production workspace header.
- Kept the Airtable-style active underline and spacing from the former `Data` nav.
- Kept option sheet tabs as the lower pale row inside the Options module only, so `Matrix / Photographer / Location / ...` remain the second-level navigation.
- Applied the same header change to the standalone Options workspace header for consistency if it is opened outside the embedded production shell.

## Frontend
- Updated `frontend/src/pages/Productions.tsx`.
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.

## Backend
- No backend or schema changes.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- The project workspace now follows the requested hierarchy:
  - top row: project-level modules,
  - second row only when needed: module-specific subpages/sheets.
- Options still owns its own sheet tabs and view rail.

## Exact Next Steps
1. Remove old dead `ProductionDetail` code from `Productions.tsx`.
2. Tighten the non-options module interiors so Budget/Dates/Crew/POs/Comms/Files visually match the new shell.
3. Make the left rail real per module with saved views, filters, notes, and settings.

---

# HANDOVER - 2026-05-28 - Production Modules Moved Into Shared Workspace Shell

## Built This Session
- Moved the main production modules into the Airtable-style project workspace.
- Selecting a production now opens a full project workspace instead of the old right-side detail panel.
- Shared workspace header now contains:
  - project name,
  - `Data / Automations / Interfaces / Forms`,
  - module tabs for `Overview`, `Options`, `Budget`, `Dates`, `Crew List`, `POs`, `Comms`, and `Files`.
- Options now runs embedded inside the shared workspace shell, keeping its own second-level sheet tabs.
- Budget now supports an embedded mode so it can render inside the workspace instead of always taking over as a fixed full-screen view.
- Dates, Crew, POs, Comms, Files, and Overview render inside the shared workspace frame with a left view rail.

## Frontend
- Updated `frontend/src/pages/Productions.tsx`.
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Updated `frontend/src/components/budgets/BudgetView.tsx`.
- Added:
  - `ProductionWorkspace`
  - `WorkspaceViewRail`
  - embedded `OptionsBoardView`
  - embedded `BudgetView`

## Backend
- No backend or schema changes in this pass.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- All primary production modules are now accessible inside one project workspace frame.
- Options has the most complete Airtable-like treatment.
- Other modules are now contained by the frame but still retain much of their older internal layout.

## Known Gaps / Technical Debt
- The old `ProductionDetail` component still exists in `Productions.tsx` and can be removed in a cleanup pass.
- Budget still has its own internal budget header/action bars inside the workspace.
- Dates/Crew/POs/Comms/Files need visual tightening to match the new Airtable-style shell.
- The left rail is still partly placeholder for non-options modules.
- Mobile needs a dedicated workspace navigation pass.

## Exact Next Steps
1. Remove the old `ProductionDetail` path and dead helper functions.
2. Tighten Budget/Dates/Crew/POs/Comms/Files to use the shared toolbar/view patterns.
3. Make the left rail real per module: saved views, settings, filters, and page notes.
4. Add saved views and gallery/table/calendar mode support where appropriate.

---

# HANDOVER - 2026-05-28 - Airtable-Style Project Workspace Shell for Options

## Built This Session
- Started the project workspace overhaul using Airtable as the visual/layout reference.
- Reworked the Options full-screen view into a project workspace frame:
  - project header with project name,
  - top workspace nav: `Data`, `Automations`, `Interfaces`, `Forms`,
  - module row: `Options`, `Budget`, `Dates`, `Crew List`, `POs`, `Comms`, `Files`,
  - option sheet tab row: `Matrix` plus each option group/sheet,
  - left view rail with `Create new`, `Find a view`, `Grid view`, `Gallery`, and contextual notes/settings area.
- Existing options matrix and candidate sheets now render inside the new workspace shell.
- Module buttons route out to the existing production pages where those modules already exist.
- The URL flow still preserves `production`, `tab=options`, and `optionGroup` so refresh and direct links keep their place.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Added:
  - `ProjectWorkspaceHeader`
  - `OptionsSheetTabs`
  - `OptionsViewRail`
- No backend or schema changes in this pass.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Options now has the first Airtable-like project workspace layout.
- The actual candidate grid and matrix functionality are unchanged.
- This is a shell/layout pass only; Budget/Dates/Crew/Files/Comms still use their existing internal layouts after navigating to them.

## Known Gaps / Technical Debt
- The workspace shell currently lives in `OptionsBoardView`; it should become a reusable `ProductionWorkspace` wrapper.
- Budget/Dates/Crew/POs/Files/Comms should be moved into the same shell rather than routing out to older layouts.
- Left rail controls are mostly visual placeholders except create actions.
- `Automations`, `Interfaces`, and `Forms` are placeholders.
- Mobile behaviour needs a dedicated pass.

## Exact Next Steps
1. Extract the workspace shell into a reusable `ProductionWorkspace` component.
2. Move Budget, Dates, Crew, POs, Files, and Comms into the shell one by one.
3. Replace placeholder left-rail controls with real saved views and view settings.
4. Tighten grid typography/spacing to further match the Airtable reference.
5. Add gallery view as the second real view for option sheets.

---

# HANDOVER - 2026-05-28 - Options Field Layout Controls for Core and Blackbook Fields

## Built This Session
- Extended the options V1.1 field system so core fields and Blackbook-backed fields are now part of the same ordered sheet layout as custom fields.
- Core fields are seeded as locked `OptionColumn` records per option group:
  - Img
  - Option
  - Dates
  - Contact
  - Deck notes
  - Internal
  - Links
  - Address
  - Rate
  - State
- All visible fields now render from `group.columns` order rather than hard-coded React column order.
- Added show/hide controls for both core/Blackbook fields and custom fields.
- Added resize and drag reorder controls to core fields as well as custom fields.
- Locked core fields can be hidden, reordered, and resized, but cannot be deleted or type-changed.

## Backend
- Updated `backend/src/routes/options.ts`.
- Added core field seeding in `matrixResponse()` via `ensureCoreOptionColumns()`.
- Existing custom fields are shifted after core fields the first time core fields are seeded for a group.
- No schema migration was needed in this pass because the previous `OptionColumn.locked` and `OptionColumn.hidden` fields already support this.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Candidate sheet grid template is now generated from visible columns.
- The date status block can be hidden/reordered/resized as one field, with each production date rendered inside that block.
- `Hide fields` opens a field visibility manager showing:
  - Blackbook/core fields,
  - Custom fields.
- Field menus now respect locking:
  - core fields: hide, resize, reorder,
  - custom fields: hide, resize, reorder, rename, type-change, delete.

## Deployment / Verification
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Options sheets now behave much closer to Airtable for field layout.
- Blackbook-backed contact/address/link fields still sync to the Blackbook database; layout changes only affect this sheet view.
- Custom fields remain option-sheet-specific and do not pollute Blackbook records.

## Known Gaps / Technical Debt
- Individual production date columns share one width via the `Dates` field; per-date width persistence is not implemented yet.
- Hidden fields can be shown again from the `Hide fields` popover, but there is no full field manager drawer yet.
- Select/multi-select custom fields still need a proper options editor.
- Sorting/filtering/grouping across all fields is still pending.

## Exact Next Steps
1. Add a full field manager drawer with per-field descriptions, select options, and hidden field management.
2. Add proper sorting/filtering/grouping using both core fields and custom field values.
3. Add per-date column width overrides if needed.
4. Add gallery/card view driven by the same field definitions.

---

# HANDOVER - 2026-05-28 - Options V1.1 Custom Columns and Airtable-Style Sheet Foundation

## Built This Session
- Added a V1.1 custom field layer to options candidate sheets.
- Core Blackbook-linked fields remain separate and reusable:
  - option name / identity,
  - email,
  - phone,
  - address,
  - links,
  - rate,
  - active state.
- New custom fields are specific to the current options sheet/role and store per-candidate values.
- Added first-pass Airtable-style field controls:
  - `+ Field` popover,
  - field type selector,
  - custom columns in the grid,
  - editable custom field cells,
  - column resize handles,
  - drag-to-reorder custom field headers,
  - hide/delete/rename/type-change menu on custom fields.

## Backend
- Updated `backend/prisma/schema.prisma`.
- Added:
  - `OptionColumn`
  - `OptionColumnValue`
  - `OptionColumnType`
- Added migration:
  - `backend/prisma/migrations/20260528120000_option_custom_columns/migration.sql`
- Updated `backend/src/routes/options.ts`.
- Matrix responses now include:
  - `group.columns`
  - `candidate.columnValues`
- Added options matrix endpoints:
  - `POST /api/options/matrix/groups/:groupId/columns`
  - `PATCH /api/options/matrix/columns/:columnId`
  - `DELETE /api/options/matrix/columns/:columnId`
  - `PATCH /api/options/matrix/groups/:groupId/columns/reorder`
  - `PATCH /api/options/matrix/candidates/:candidateId/columns/:columnId`

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Candidate sheets now render fixed core fields plus custom option-sheet fields.
- Custom cell support added for:
  - single line text,
  - long text,
  - number,
  - currency,
  - percent,
  - checkbox,
  - URL,
  - email,
  - phone,
  - select-like placeholder types for future refinement.
- The contact field still syncs email/phone back to Blackbook when a candidate is linked.

## Deployment / Verification
- Prisma migration deployed.
- Prisma client generated.
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK on port `3000`.

## Current State
- Options V1.1 now has the data model needed for Airtable-style custom columns without polluting Blackbook records.
- The UI is a functional first pass: custom fields can be added, resized, reordered, edited, hidden, and deleted.
- Core fields are still intentionally fixed because they feed Blackbook, PO, accounting, and PDF workflows.

## Known Gaps / Technical Debt
- Single-select and multi-select fields currently store values but do not yet have a polished options editor.
- Hide fields does not yet have a visible "show hidden fields" panel.
- Column resize persists after mouse-up, but the resize does not show a live guide while dragging.
- Custom field sorting/filtering is not implemented yet.
- Gallery/card view is still a future step.

## Exact Next Steps
1. Add a field manager drawer for hidden fields, select options, and field descriptions.
2. Add sorting/filtering/grouping across custom columns.
3. Add custom field visibility controls for deck export templates.
4. Add gallery/card view using the same custom field definitions.
5. Continue the visual pass toward the Airtable clarity reference while keeping the current production workflow.

---

# HANDOVER - 2026-05-27 - Options Deck Text and Image Styling Controls

## Built This Session
- Added more text and image styling controls to the options deck designer.
- Text blocks now support:
  - line height,
  - letter spacing,
  - text colour,
  - internal padding,
  - max lines / clamp,
  - vertical alignment,
  - hide if empty.
- Image blocks now support:
  - image position: top / center / bottom,
  - background colour,
  - optional cell border,
  - border radius.
- Added stronger image presets:
  - Full bleed image,
  - Contained hero.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Extended deck block JSON with:
  - `verticalAlign`
  - `lineHeight`
  - `letterSpacing`
  - `textColor`
  - `textPadding`
  - `textMaxLines`
  - `hideIfEmpty`
  - `imagePosition`
  - `imageBackground`
  - `imageBorder`
  - `imageRadius`
- Inspector now exposes these controls in compact form.

## Backend
- Updated `backend/src/services/optionsDeckPdf.ts`.
- Updated `backend/src/routes/options.ts`.
- Export sanitizer now preserves and clamps the new settings.
- HTML/PDF export now renders the new text and image styling controls.

## Deployment / Verification
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK.
- Chromium export smoke test passed with:
  - line height,
  - text padding,
  - text colour,
  - vertical text alignment,
  - justified images,
  - image border and radius.
  - PDF buffer: 11,116,469 bytes.

## Current State
- The deck editor has enough typography and image styling controls for useful layout iteration without needing code changes.
- Edit and export both use the same saved JSON fields.

## Known Gaps / Technical Debt
- No per-image focal point yet.
- Text colour is a simple colour input, not a brand palette picker.
- Full bleed and hero are presets using existing image block behaviour, not a separate asymmetric layout engine.

## Exact Next Steps
1. Add per-image crop/focal-point controls.
2. Add a brand palette picker for text/background colours.
3. Add true asymmetric presets like `Hero + thumbnails`.

---

# HANDOVER - 2026-05-27 - Options Deck Edit/Final Canvas Sync

## Built This Session
- Synced the options deck editor canvas with the backend export canvas.
- Edit mode now renders on the same 1920 x 1080 coordinate space as Final/export and scales down visually to 1280 x 720.
- This removes drift caused by pixel-based values being rendered directly at 1280 x 720 in Edit mode while export used 1920 x 1080.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Added shared deck canvas constants:
  - export width: 1920
  - export height: 1080
  - editor scale: 2/3
  - editor display: 1280 x 720
- Updated drag math to use the scaled editor display dimensions.
- Final iframe and Edit canvas now use the same constants.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK.

## Current State
- Edit and Final should now agree much more closely for:
  - position,
  - font size,
  - image padding,
  - image gaps,
  - borders,
  - justified image sizing.

## Known Gaps / Technical Debt
- The editor display is fixed at 1280 x 720. Smaller screens rely on scrolling inside the designer.
- A future pass could make the scale responsive while keeping the underlying 1920 x 1080 export coordinate system.

---

# HANDOVER - 2026-05-27 - Justified Image Editor Preview Fix

## Built This Session
- Fixed the options deck editor preview for justified image rows.
- Export/PDF rendering was already correct; the bug was only in the React editor preview.
- Moved aspect-ratio sizing onto the justified item wrapper so the preview constrains images to the block height instead of letting them render at intrinsic size.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Justified image preview now:
  - keeps each image at block-height,
  - preserves natural image aspect ratio,
  - bottom-aligns images,
  - matches the backend export behaviour more closely.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK.

## Current State
- Justified image mode should no longer show huge/full-size images in the editor.

---

# HANDOVER - 2026-05-27 - Options Image Grid Fit Controls

## Built This Session
- Improved options deck image blocks so justified layouts behave more like editorial contact sheets.
- Added separate image controls:
  - outer padding,
  - gap between images,
  - layout mode,
  - image fit mode,
  - allow multiple rows,
  - hide empty slots.
- Justified image rows now:
  - scale images to the height of the block,
  - preserve each image's natural aspect ratio,
  - align images to the bottom of the block,
  - keep a single row by default,
  - hide overflow unless multiple rows are enabled.
- Multiple-row mode wraps justified images into two height-matched rows.
- Tiled box mode keeps the square/grid behaviour but can now use `contain` or `cover`.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Extended deck block JSON with:
  - `imageGap`
  - `imageFit`
  - `imageAllowRows`
  - `imageHideEmptySlots`
- The designer inspector now labels image spacing clearly:
  - `Outer padding`
  - `Gap`
- `Justified image row` preset now defaults to:
  - max 10 images,
  - natural height fit,
  - hidden empty slots,
  - single-row overflow.

## Backend
- Updated `backend/src/services/optionsDeckPdf.ts`.
- Updated `backend/src/routes/options.ts`.
- The HTML/PDF export renderer now respects all new image settings.
- The sanitizer preserves the new JSON fields and clamps numeric spacing values.

## Deployment / Verification
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK.
- Chromium export smoke test passed with:
  - justified row,
  - natural fit,
  - hidden empty slots,
  - custom padding/gap.
  - PDF buffer: 11,075,616 bytes.

## Current State
- Image grids now cover the two important modes:
  - structured tiled boxes,
  - looser justified editorial rows.
- This should make location and talent decks less rigid while keeping exports predictable.

## Known Gaps / Technical Debt
- Multiple-row justified mode currently uses two rows. A future pass could calculate row count based on block height and image count.
- There are still no per-image focal point/crop controls.
- Export order is still driven by photo order/export selection in the photo manager.

## Exact Next Steps
1. Add per-image crop/focal-point controls.
2. Add an export-order strip in the photo manager.
3. Add hero image presets such as `Hero + thumbnails` and `Full bleed hero`.

---

# HANDOVER - 2026-05-27 - Options Deck Editor Layers and Image Layouts

## Built This Session
- Added richer controls to the options PDF deck designer.
- Image blocks now support:
  - `Tiled boxes` layout,
  - `Justified row` layout,
  - editable image count,
  - editable padding/gap.
- Added branded block presets in the left rail:
  - Large title,
  - Subtitle,
  - Project tag,
  - Links row,
  - Date status,
  - Image grid 4,
  - Image grid 6,
  - Justified image row,
  - Map,
  - Notes,
  - Footer.
- Added layer controls in the inspector:
  - Duplicate,
  - Lock / unlock,
  - Send back,
  - Bring front,
  - Hide / show in export.
- Added keyboard nudging for selected blocks:
  - Arrow keys move a block.
  - Shift + arrow moves further.
  - Alt temporarily bypasses snap.
- Locked blocks can still be selected but cannot be dragged or resized.
- Hidden blocks remain visible as faint placeholders in Edit mode but are excluded from Final preview and PDF export.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Extended deck block JSON with:
  - `imagePadding`
  - `imageLayout`
  - `hidden`
  - `locked`
- The editor preview renders image grids and justified rows the same way the export renderer does:
  - images stay contained,
  - horizontally centered,
  - bottom aligned inside their cells.

## Backend
- Updated `backend/src/services/optionsDeckPdf.ts`.
- Updated `backend/src/routes/options.ts`.
- The deck template sanitizer now preserves the new block settings.
- HTML/PDF export now respects:
  - hidden blocks,
  - image padding,
  - image layout mode.
- No Prisma migration was needed because deck templates are saved as JSON.

## Deployment / Verification
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned OK.
- Chromium export smoke test passed with a custom justified image row template:
  - generated PDF buffer: 10,644,144 bytes.

## Current State
- The deck designer now has the core layer and image layout controls needed to start making client-facing option pages without editing code.
- The user can choose between square/tiled image blocks and a justified image row, and tune image padding directly in the inspector.
- Final preview and exported PDF use the same backend renderer, so saved image settings carry through to output.

## Known Gaps / Technical Debt
- Layer controls move blocks one step at a time rather than “send fully to back/front”.
- There is no reusable global template library yet.
- The editor still uses a fixed 1280px canvas scale; a responsive canvas scale would make laptop editing easier.
- No per-image crop/focal-point controls yet.

## Exact Next Steps
1. Add a saved global template library with “duplicate template” and “apply to group”.
2. Add per-image crop/focal-point controls for exported decks.
3. Add template thumbnails so base layouts are visually selectable.
4. Start the dedicated PDF template designer plan once the user provides/approves the final deck layout rules.

---

# HANDOVER - 2026-05-27 - Options PDF Editor Resize and Final Preview

## Built This Session
- Added core layout-tool interactions to the options PDF designer.
- The designer now has an `Edit / Final` toggle.
  - `Edit` shows the red editable placement boxes.
  - `Final` saves the current template and embeds the exact backend export HTML inside the designer.
- Added snap-to-grid for block movement and resizing.
  - Snap is on by default.
  - Holding `Alt` while dragging temporarily disables snap.
- Added resize handles to selected blocks.
  - Supports all edges and corners.
  - Existing numeric W/H/X/Y inputs remain for precise adjustments.
- Added a subtle edit grid behind the red placement boxes.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Added:
  - `DeckDragState`
  - `DeckResizeHandle`
  - `DeckFinalPreview`
  - `DeckResizeHandles`
  - snap/constrain helpers for percent-based deck coordinates.

## Backend
- No backend changes in this pass.
- Existing HTML export preview route is reused:
  - `GET /api/options/matrix/groups/:groupId/export-preview-html`

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned `{"status":"ok"}`.

## Current State
- The editor is now more usable for actual layout work:
  - drag to move,
  - drag handles to resize,
  - snap for clean alignment,
  - final HTML preview in place.
- Final preview saves before rendering, so it always represents what export will use.

## Known Gaps / Technical Debt
- Resize handles are functional but minimal; next pass should make them more polished and add keyboard nudging.
- Final preview is scaled to the current 1280px editor canvas. If the designer canvas becomes responsive below 1280px, the iframe scale should become dynamic.
- No layer controls yet.

## Exact Next Steps
1. Add duplicate, lock, hide, bring forward, and send backward controls.
2. Add keyboard nudging with arrow keys and shift-arrow larger increments.
3. Add smart branded block presets.
4. Add reusable global deck template library.

---

# HANDOVER - 2026-05-27 - WYSIWYG HTML Options Deck Export

## Built This Session
- Replaced the options candidate deck export renderer with a Chromium HTML-to-PDF pipeline.
- The export now uses a fixed 1920 x 1080 HTML canvas, matching the designer’s preview model.
- Added an actual export preview route so the user can inspect the HTML that Chromium will print.
- Added a `Preview export` button in the PDF layout designer:
  - saves the current template,
  - opens the exact backend export HTML in a new tab.
- Installed Playwright and Chromium runtime dependencies on the server.

## Backend
- Updated `backend/package.json` and `backend/package-lock.json`.
- Added dependency:
  - `playwright`
- Installed Playwright Chromium and Linux runtime dependencies:
  - `npx playwright install chromium`
  - `npx playwright install-deps chromium`
- Rebuilt `backend/src/services/optionsDeckPdf.ts`.
  - Keeps exported types/function names used by routes.
  - Adds `renderOptionsDeckHtml(group, blocks)`.
  - `renderOptionsDeckPdf(group, blocks)` now:
    - renders the same HTML,
    - opens it in headless Chromium,
    - prints it with `preferCSSPageSize`,
    - returns a PDF buffer.
  - The HTML renderer supports:
    - field blocks,
    - links,
    - date status blocks,
    - image grids with bottom-aligned contained images,
    - cached map images,
    - notes,
    - footer blocks.
- Updated `backend/src/routes/options.ts`.
  - New route:
    - `GET /api/options/matrix/groups/:groupId/export-preview-html`
  - Existing route:
    - `POST /api/options/matrix/groups/:groupId/export-pdf`
    - now uses Chromium-backed HTML export.
  - Both preview and PDF prewarm static maps if the saved template contains map blocks.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Added `Preview export` button to the PDF layout designer.
- Preview export saves the current template first, then opens:
  - `/api/options/matrix/groups/:groupId/export-preview-html`

## Deployment / Verification
- Backend build passed.
- Frontend build passed.
- Chromium export smoke test passed:
  - generated `/tmp/options-deck-smoke.pdf`
  - 1 page
  - 1.7 MB
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned `{"status":"ok"}`.

## Current State
- Options deck exports are now much closer to WYSIWYG because the browser is the PDF renderer.
- The designer’s live red-box editor is still React-rendered, but `Preview export` shows the true final export HTML before PDF generation.
- Export PDF uses the same HTML as preview.

## Known Gaps / Technical Debt
- The live editor preview still has red editing boxes and is not literally the exact export iframe.
- The next clean-up is to embed the backend export HTML renderer into the designer as a side-by-side or toggleable preview, while keeping red boxes for edit mode.
- Playwright browser binaries live in the server cache; future server rebuilds should include `npx playwright install chromium`.

## Exact Next Steps
1. Add an `Edit / Final preview` toggle inside the designer so the final HTML appears in-place.
2. Add drag resize handles and snap grid.
3. Add map settings: zoom, marker, branded style.
4. Add a reusable global deck template library.

---

# HANDOVER - 2026-05-27 - Static Map Blocks for Options PDF Designer

## Built This Session
- Replaced the options PDF designer map placeholder with real cached Google Static Map imagery.
- Added map coordinates/cache metadata to option candidates.
- Added server-side static map generation using the existing Google Maps API key.
- Map images are stored inside the relevant job Options folder and served through the options API.
- Saved PDF templates that include a `map` block now render the cached map image in exported PDFs.
- Designer preview map blocks now show the same served map image when the candidate has coordinates.

## Backend
- Updated `backend/prisma/schema.prisma`.
- Added migration:
  - `backend/prisma/migrations/20260527091000_option_candidate_static_maps/migration.sql`
- New `OptionCandidate` fields:
  - `latitude`
  - `longitude`
  - `mapImagePath`
  - `mapImageUpdatedAt`
- Added `backend/src/services/optionMapService.ts`.
  - Fetches Google Static Maps images.
  - Caches each candidate map as `map.png`.
  - Stores maps under:
    - `/backend/storage/jobs/[job folder]/Options/[group name]/[candidateId]/map.png`
- Updated `backend/src/routes/options.ts`.
  - Matrix responses now return `mapImageUrl` and never expose raw `mapImagePath`.
  - Candidate address changes invalidate the cached map.
  - New route:
    - `GET /api/options/matrix/candidates/:candidateId/map/serve`
  - Group PDF export prewarms maps before rendering if the saved template contains a map block.
- Updated `backend/src/services/optionsDeckPdf.ts`.
  - Option deck PDF data now includes `selectedAddress`.
  - Map blocks render cached map images when available.
  - Address/location text uses selected structured address where present.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Candidate types now include map metadata.
- PDF designer map blocks now render the candidate map image via `mapImageUrl`.
- If no coordinates exist, the designer keeps the existing address placeholder.

## Deployment / Verification
- Prisma migration deployed.
- Prisma client generated.
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned `{"status":"ok"}`.
- Static map generation was verified directly through the service for `La Petite Chaise`:
  - generated `map.png`
  - size: 1280 x 840
  - stored in the GANNI job Options folder.

## Current State
- Location options with Google Places coordinates can now show real map imagery in the PDF designer preview.
- Exported PDFs using a saved template with a map block will include cached maps.
- Existing address autocomplete remains the source of coordinates.
- Manual addresses without coordinates still show the text placeholder until coordinates are available.

## Known Gaps / Technical Debt
- Map styling is Google default roadmap; no branded custom style yet.
- Map zoom is fixed at 14.
- Manual address geocoding is not implemented yet; only Google Places-created/saved addresses carry coordinates.
- The preview image route is auth-protected like the rest of the app, which is correct for logged-in UI but unauthenticated curl receives 401.

## Exact Next Steps
1. Add configurable map block settings in the designer: zoom, marker on/off, map style.
2. Add manual address geocoding for already-entered addresses that lack coordinates.
3. Add reusable global PDF templates and duplicate/apply-to-group.
4. Add drag resize handles and snap grid for deck blocks.

---

# HANDOVER - 2026-05-27 - Saved Options PDF Templates and Export Wiring

## Built This Session
- Moved options PDF designer templates from local browser-only state into the database.
- Added API endpoints to load/save one deck template per option group.
- Updated group PDF export so it uses the saved designer template when one exists.
- The current PDF export now renders designer blocks through PDFKit:
  - text fields,
  - links,
  - date status block,
  - image grid,
  - notes,
  - map placeholder,
  - footer.

## Backend
- Updated `backend/prisma/schema.prisma`.
- Added migration:
  - `backend/prisma/migrations/20260527084000_option_deck_templates/migration.sql`
- New model:
  - `OptionDeckTemplate`
- Added `OptionGroup.deckTemplate` relation.
- Updated `backend/src/routes/options.ts`.
- New endpoints:
  - `GET /api/options/matrix/groups/:groupId/deck-template`
  - `PATCH /api/options/matrix/groups/:groupId/deck-template`
- Save endpoint sanitizes block JSON before storing.
- Updated `POST /api/options/matrix/groups/:groupId/export-pdf`:
  - loads saved template,
  - sanitizes blocks,
  - passes them into the PDF renderer.
- Updated `backend/src/services/optionsDeckPdf.ts`.
- `renderOptionsDeckPdf(group, templateBlocks)` now renders saved template blocks when present and falls back to the previous hard-coded deck when not.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Designer now:
  - loads saved template from API on open,
  - shows saved/load status in the header,
  - has `Save for export`,
  - no longer relies on localStorage as source of truth.

## Deployment / Verification
- Prisma migration deployed.
- Prisma client generated.
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned `{"status":"ok"}`.

## Current State
- You can design a layout, click `Save for export`, then use `Export PDF`.
- The exported PDF will use the saved layout for that option group.
- If no template is saved, export still uses the previous hard-coded PDF layout.

## Known Gaps / Technical Debt
- PDF rendering still uses PDFKit, so it is not pixel-identical to the live HTML preview yet.
- The map block is still a placeholder; it needs static map generation/caching.
- Resize is via numeric inspector only.
- Template is one-per-option-group; no global template library yet.

## Exact Next Steps
1. Add static Google map image generation/caching for location candidates.
2. Add reusable global template library with duplicate/apply-to-group.
3. Add drag resize handles and snap grid.
4. Move export rendering to HTML/Chromium if we need exact preview-to-PDF fidelity.

---

# HANDOVER - 2026-05-27 - Options PDF Designer Foundation

## Built This Session
- Added the first usable PDF layout designer foundation to the options candidate sheet.
- Candidate sheets now have a `Design PDF` button.
- The designer opens as a full-screen editor with:
  - live candidate preview,
  - editable red dotted placement boxes,
  - field/block palette,
  - selected block inspector,
  - base templates for editorial/talent and locations,
  - per-group local template persistence.
- Every preview page is rendered from the current option/candidate data.

## Designer Features
- Placeable block types:
  - field text,
  - links,
  - date status,
  - image grid,
  - notes,
  - map placeholder,
  - footer.
- Field text can bind to:
  - option name,
  - subtitle,
  - location,
  - structured address,
  - deck notes,
  - internal notes,
  - project name.
- Block inspector supports:
  - x/y placement,
  - width/height,
  - font size,
  - font weight,
  - alignment,
  - uppercase toggle,
  - image count for image grids,
  - delete block.
- Image grid follows the reference direction:
  - images sit inside fixed boxes,
  - object-fit contain,
  - centered horizontally,
  - aligned to the bottom vertically.
- Date status block renders compact colored rows similar to the reference style.
- Location template includes a map block placeholder ready for static map image integration.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Added:
  - `DeckTemplate`,
  - `DeckTemplateBlock`,
  - default template builders,
  - `DeckDesigner`,
  - `BlockInspector`,
  - `DeckPagePreview`,
  - `DeckBlockContent`.
- Templates are currently persisted in `localStorage` under the option group ID.

## Backend
- No backend changes in this pass.
- Existing PDF export remains unchanged.

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned `{"status":"ok"}`.

## Current State
- This is an editor/preview foundation, not yet the production export renderer.
- It proves the key interaction model:
  - each options row field can become a placeable block,
  - red editor boxes mirror the reference,
  - candidate data fills the page live,
  - templates can start from branded bases and then be edited.

## Known Gaps / Technical Debt
- Template persistence is local browser storage only; next pass should move it to the database.
- Existing PDF export does not yet consume these templates.
- Map block is a placeholder; it should become a cached Google Static Map image using candidate address coordinates.
- Dragging moves blocks, but resize is currently via numeric inspector rather than drag handles.
- No snap/grid controls yet.

## Exact Next Steps
1. Add database-backed PDF template models and save/load endpoints.
2. Replace the current group PDF export with template-driven HTML-to-PDF rendering.
3. Add static map image generation/caching for location candidates.
4. Add resize handles and snap/grid controls in the designer.

---

# HANDOVER - 2026-05-27 - Manual Bill Line Assignment Review

## Built This Session
- Added a manual review layer to the grouped PO bill drawer.
- After AI parses an invoice, the drawer now shows an `Invoice line review` section.
- Each extracted invoice line displays:
  - description,
  - net/gross amount used for allocation,
  - VAT amount where present,
  - dropdown to assign it to a specific PO allocation.
- Changing an invoice line assignment recalculates the bill allocation amounts immediately.
- The existing AI semantic matches are used as the initial dropdown selections.
- Unassigned invoice lines are ignored in allocation totals until assigned.

## Frontend
- Updated `frontend/src/pages/Productions.tsx`.
- Added local assignment state in `PurchaseOrderBillPanel`.
- Added assignment inference from AI matched line item labels.
- Added recalculation helper that sums assigned invoice line amounts into the selected allocation rows.
- Added compact review UI between invoice parse summary and final bill allocations.

## Backend
- No backend schema changes.
- Existing parse and convert endpoints remain unchanged.

## Deployment / Verification
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned `{"status":"ok"}`.

## Current State
- The grouped PO bill flow now supports:
  1. AI metadata extraction,
  2. AI invoice line extraction,
  3. automatic allocation matching,
  4. manual correction before saving.
- This should make multi-line agency invoices practical even when the AI match is close but not perfect.

## Known Gaps / Technical Debt
- Manual assignment is dropdown-based, not drag-and-drop.
- Split one invoice line across multiple budget allocations is not supported yet.
- Unassigned invoice lines are excluded from totals; this is deliberate but should be visually reviewed before saving.

## Exact Next Steps
1. Add split-line support if agency invoices commonly bundle several services into one invoice line.
2. Add PO PDF generation and email send.
3. Add secure supplier onboarding links for new Blackbook suppliers.
4. Add grouped bill paid/unpaid controls once FreeAgent matching is ready.

---

# HANDOVER - 2026-05-27 - Semantic Bill Line Matching for Grouped POs

## Built This Session
- Extended AI bill parsing so it extracts invoice line items, not just invoice-level totals.
- Grouped PO bill parsing now tries to match extracted invoice line items to each PO allocation using the allocation/budget line text.
- The bill drawer shows matched invoice line item descriptions beneath the relevant allocation row.
- If no line-item match is confident enough, the system falls back to proportional allocation from the parsed invoice total.

## Backend
- Updated `backend/src/services/receiptParser.ts`.
- `ParsedReceipt` now includes:
  - `lineItems[]`,
  - each with description, net amount, gross amount, and VAT amount.
- Updated the AI extraction prompt to ask for visible invoice line items.
- Updated `backend/src/routes/budgets.ts`.
- `POST /api/budgets/purchase-orders/:purchaseOrderId/parse-bill` now:
  - fetches allocation line item context,
  - builds a matching label from PO allocation description, line code, line description, notes, and section name,
  - scores extracted invoice line descriptions against those labels,
  - applies matched invoice line totals to the best allocation,
  - returns matched line item labels to the frontend.

## Frontend
- Updated `frontend/src/pages/Productions.tsx`.
- AI parse summary now reports how many invoice line items were extracted.
- Allocation rows show `Matched: ...` when an invoice line item was semantically matched.

## Deployment / Verification
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned `{"status":"ok"}`.

## Current State
- The grouped PO bill flow now has three levels of intelligence:
  1. invoice metadata extraction,
  2. invoice line item extraction,
  3. allocation matching by budget-line context with proportional fallback.
- This should handle agency invoices covering several PO lines more cleanly than the first proportional-only pass.

## Known Gaps / Technical Debt
- Matching is still deterministic token scoring after AI extraction, not a second Claude call with explicit PO context.
- If invoice language is very different from budget line naming, it may still fall back or match imperfectly.
- The drawer does not yet expose manual "assign this invoice line to this allocation" controls.

## Exact Next Steps
1. Add manual invoice-line-to-allocation review controls in the bill drawer.
2. Add PO PDF generation and email send.
3. Add secure supplier onboarding links for new Blackbook suppliers.
4. Add grouped bill paid/unpaid controls once FreeAgent matching is ready.

---

# HANDOVER - 2026-05-27 - AI Bill Parsing for Grouped POs

## Built This Session
- Added AI invoice/bill parsing to the grouped PO bill drawer.
- When a PDF or image invoice is selected in the `POs` tab bill drawer:
  - the backend sends it through the existing Anthropic document/image parser,
  - invoice number is extracted,
  - invoice date is extracted,
  - supplier/vendor is extracted,
  - net/gross/VAT totals are extracted,
  - bill allocation suggestions are generated against the grouped PO allocations.
- The drawer now pre-fills:
  - invoice number,
  - invoice date,
  - suggested final allocation amounts.
- The drawer shows a compact AI confidence/summary card after parsing.

## Backend
- Updated `backend/src/services/receiptParser.ts`.
- Existing parser now also extracts `invoiceNumber`.
- Updated `backend/src/routes/budgets.ts`.
- New endpoint:
  - `POST /api/budgets/purchase-orders/:purchaseOrderId/parse-bill`
- The endpoint accepts multipart field:
  - `invoiceFile`
- Accepted file types:
  - PDF,
  - JPEG,
  - PNG,
  - GIF,
  - WEBP.
- Max file size:
  - 25MB.
- Allocation suggestion logic:
  - uses parsed net amount where present,
  - falls back to gross amount,
  - distributes the parsed total proportionally across the PO's existing allocation amounts,
  - rounds to 2 decimals and adjusts the final allocation so totals match.

## Frontend
- Updated `frontend/src/pages/Productions.tsx`.
- In `PurchaseOrderBillPanel`, choosing an invoice file now immediately calls the parse endpoint.
- Parsed data updates the bill form before save.
- Existing `Convert to bill` save flow remains unchanged and still uploads/saves the selected invoice file to job files.

## Deployment / Verification
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- `pm2 reload 0` completed.
- Health check passed:
  - `GET /api/health` returned `{"status":"ok"}`.

## Current State
- Grouped POs can now move from:
  - multi-line supplier PO,
  - to AI-assisted bill review,
  - to saved bill allocations linked to the uploaded invoice file.
- This uses the already installed PDF/image AI route capability rather than a new parser stack.

## Known Gaps / Technical Debt
- AI parsing does not yet do semantic line-item matching to specific budget lines; it proportionally suggests allocations from existing PO amounts.
- The parser extracts invoice-level totals and references, not supplier bank/payment details.
- The invoice file is parsed once before save and uploaded again on save; we can optimize this later by parsing and storing in one backend transaction.

## Exact Next Steps
1. Add semantic invoice line-item matching against grouped PO allocation descriptions.
2. Add PO PDF generation and email send.
3. Add secure supplier onboarding links for new Blackbook suppliers.
4. Add grouped bill paid/unpaid controls once FreeAgent matching is ready.

---

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
