# HANDOVER - 2026-05-22 - Options Source-Of-Truth Visual Pass

## Built This Session
- Updated the options candidate sheet so the distinction between reusable Blackbook data and project-specific option data is visible.
- The first column is now `Blackbook source`.
  - Linked candidates show the live Blackbook display name as the primary identity.
  - Shows source metadata from Blackbook: company/title/email/phone/city.
  - Shows Blackbook flags such as default rate and dietaries.
  - Clicking the source card opens the real Blackbook overlay.
- Candidate/project fields now sit separately:
  - `Project option` = job-specific alias/name
  - `Project note` = job-specific subtitle/context
  - `Project rate` = rate for this production
  - state/date holds remain project-specific
- Unlinked candidates now clearly show `No Blackbook source linked` with the link/create control beneath.
- The small Blackbook link button remains available for linked rows for relink/unlink/create actions, but it no longer pretends to be the source record itself.

## Schema
- No schema changes in this pass.
- Uses existing `OptionCandidate.blackbookEntryId` -> `BlackbookEntry` relation.

## Backend
- No backend changes in this pass.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Added helper display functions for Blackbook metadata and flags.
- Candidate sheet columns now read:
  - Blackbook source
  - Project option
  - Project note
  - Project rate
  - State
  - date hold columns

## Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- PM2 process `0` reloaded.
- Health check passed after reload.

## Known Gaps / Technical Debt
- Outreach notes save on blur. This avoids a PATCH on every keystroke, but there is not yet a subtle saved indicator.
- Target list archive is one-way in the UI. The backend keeps archived lists; a future Settings/Admin view can expose restoration.
- The email overlay links to `?message=...`, but Email still needs the exact target-message expansion/minimise behaviour.
- Company comms aggregation is based on known email addresses. It now benefits from linked people, but contacts without email addresses will still not contribute messages.
- Supplier view still applies the broad legacy `SERVICE` filter. Category chips now let you get to all configured groups, but supplier taxonomy can be refined further once records are migrated/classified.
- Candidate snapshot fields are intentionally still separate from Blackbook. The visual split is now clearer, but future PDF/export logic must continue to choose deliberately between source fields and project fields.
- No Airtable-style template designer or client PDF options designer yet.

## Exact Next Steps
1. Wire Email `?message=` behavior so a clicked activity opens the full thread with that message expanded.
2. Add company-level notes/files once the activity model is settled.
3. Add saved indicators/toasts for target-list status, notes, and follow-up date updates.
4. Refine supplier/client taxonomy now that legacy Contacts are in Blackbook.
5. Add explicit field-source rules for future option PDFs/decks.
6. Then continue into the Blackbook-backed outreach workflow and PDF/template planning.
