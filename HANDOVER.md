# HANDOVER — 2026-05-22 — Options Matrix First Pass

## Built this session
- Reworked the Production Options tab from a flat options sheet into an operational Options Matrix.
- The matrix now represents the end-goal production requirements list:
  - rows are requirement slots such as `Photographer`, `Photo Assistant 1`, `Photo Assistant 2`, `Catering`, `Location`
  - columns are production dates
  - each row/date cell has a required toggle
  - required cells derive a pipeline color from the strongest candidate status for that role/service and date
- Clicking/opening a requirement row takes you into the shared candidate sheet for that role/service group.
- Multi-slot requirements share one candidate sheet:
  - `Photo Assistant 1`, `Photo Assistant 2`, and `Photo Assistant 3` can all point to the same `Photo Assistant` candidate pool.
- Added production date status for matrix date columns:
  - proposed
  - optioned
  - confirmed
  - released
  - cancelled
- Added requirement row controls:
  - change requirement type
  - move row up/down
  - duplicate requirement slot
  - delete requirement slot
- Added slot assignment:
  - each requirement/date cell can now assign one active candidate from the shared group pool
  - assigned cells show the candidate name and derive as confirmed in the matrix
- Confirmed candidate holds now automatically populate the visible matrix slot for that date.
- Manual slot assignment now also marks the selected candidate/date hold as confirmed.

## Schema
- Added matrix models:
  - `OptionGroup`
  - `OptionRequirement`
  - `RequirementDateNeed`
  - `OptionCandidate`
  - `CandidateDateStatusRecord`
  - `OptionSlotAssignment`
- Added enums:
  - `OptionRequirementType`
  - `OptionRequirementState`
  - `OptionCandidateState`
  - `CandidateDateHoldStatus`
  - `ProductionDateStatus`
- Added relations:
  - `Production.optionGroups`
  - `Production.optionRequirements`
  - `Production.optionCandidates`
  - `ProductionDate.requirementNeeds`
  - `ProductionDate.candidateStatuses`
  - `ProductionDate.optionSlotAssignments`
- Migration:
  - `backend/prisma/migrations/20260522100000_options_matrix/migration.sql`
  - `backend/prisma/migrations/20260522110000_production_date_status/migration.sql`
  - `backend/prisma/migrations/20260522120000_option_slot_assignments/migration.sql`
- Prisma migration deployed and Prisma client regenerated.

## Backend
- Extended `/api/options` with matrix endpoints:
  - `GET /api/options/production/:productionId/matrix`
  - `POST /api/options/production/:productionId/matrix/dates`
  - `POST /api/options/production/:productionId/matrix/groups`
  - `PATCH /api/options/matrix/requirements/:requirementId`
  - `PATCH /api/options/matrix/requirements/:requirementId/dates/:dateId`
  - `POST /api/options/matrix/groups/:groupId/candidates`
  - `PATCH /api/options/matrix/candidates/:candidateId`
  - `DELETE /api/options/matrix/candidates/:candidateId`
  - `PATCH /api/options/matrix/candidates/:candidateId/dates/:dateId`
  - `POST /api/options/matrix/requirements/:requirementId/duplicate`
  - `DELETE /api/options/matrix/requirements/:requirementId`
  - `PATCH /api/options/matrix/dates/:dateId`
  - `PATCH /api/options/matrix/requirements/:requirementId/dates/:dateId/assignment`
- Existing legacy Options Board, photo, and PDF endpoints remain in place for compatibility.
- The new date endpoint creates normal `ProductionDate` rows, so dates remain part of the production record.

## Frontend
- Replaced `frontend/src/components/options/OptionsBoardView.tsx` with the matrix UI.
- Top-level Options view now shows:
  - production requirement rows
  - production dates as columns
  - `+ Date`
  - `+ Role / service`
- Requirement cells:
  - blank = not required
  - `Need` = required but no active candidate status yet
  - `Req`
  - `2nd`
  - `1st`
  - `Conf`
  - `No`
  - `Rel`
- Cell colors are deliberately calm pipeline colors:
  - confirmed = emerald
  - first option = lime
  - second option = sky
  - requested = violet
  - needed = soft amber
  - unavailable/released = muted gray
- Hovering a matrix cell shows candidate summaries for that role/date.
- Double-clicking a matrix cell, or clicking the row’s “Open options” link, opens the candidate sheet.
- Candidate sheet includes:
  - candidate name
  - subtitle
  - rate
  - active/parked/released state
  - one status dropdown per production date
  - delete candidate
  - add candidate
- Matrix date headers now show styled date status dropdowns.
- Requirement rows now expose hover controls for move, duplicate, and delete.
- Required matrix cells now expose a compact assignment dropdown for active candidates in that group.
- Assigned cells show the assigned candidate name instead of the generic `Conf` label.

## Verification
- Prisma migration deployed successfully.
- Prisma client generated successfully.
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- PM2 process `0` reloaded successfully.
- Date status + requirement controls pass built, copied to `/var/www/agent`, and PM2 reloaded successfully.
- Slot assignment pass built, copied to `/var/www/agent`, and PM2 reloaded successfully.

## Known gaps / technical debt
- This is the first operational matrix pass. It does not yet include the reusable Blackbook schema.
- Legacy `OptionsBoard`, `OptionsCategory`, `Option`, and `OptionPhoto` still exist. They are not removed yet because they preserve the earlier client options/PDF work.
- Candidate photos/client presentation are not reconnected to the new matrix candidate model yet.
- Requirement row reorder is currently a simple order nudge via up/down controls, not drag-and-drop.
- If multiple confirmed candidates exist for the same role/date, the matrix maps them to required slots by row order and candidate order unless an explicit slot assignment overrides it.
- Date statuses exist in the matrix, but are not yet surfaced in the main Dates tab or calendar views.
- Master timeline/date-first view is not implemented yet.

## Suggested next build
1. Surface date status in the main Dates tab and calendar views.
2. Add proper drag/drop row reorder rather than temporary up/down order nudges.
3. Add Blackbook entries and link candidates to reusable people/companies/locations.
4. Rebuild client presentation/PDF from candidate groups once Blackbook/photos are in place.
5. Add date-first timeline/master chasing view.
