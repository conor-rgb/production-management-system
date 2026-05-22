# HANDOVER - 2026-05-22 - Options Blackbook Link Button Pass

## Built This Session
- Simplified the Options candidate sheet Blackbook UI per latest feedback.
- Removed the dominant `Blackbook source` column/card treatment from the options rows.
- The candidate name is now the primary row identity again, with a compact Blackbook link control beside it.
- The Blackbook control is intentionally small:
  - Unlinked rows show a grey `Link` button.
  - Linked rows show a darker underlined `Blackbook` button.
  - The dropdown still supports search/link, create from row, open record, and unlink.
- Removed user-facing explanation copy such as `No Blackbook source linked` and source metadata blocks from the table.
- Kept the shared source-of-truth behavior: opening a linked row still opens the actual Blackbook record overlay, and closing that overlay refreshes the options matrix.

## Schema
- No schema changes in this pass.

## Backend
- No backend changes in this pass.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx` only.
- Candidate sheet columns now read:
  - Option
  - Project note
  - Project rate
  - State
  - date hold columns
- Removed now-unused Blackbook metadata/flag display helpers.

## Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- PM2 process `0` reloaded.
- Health check passed after reload.

## Current Options / Blackbook State
- Options matrix remains project-specific for candidates, rates, notes, holds, and assignments.
- Blackbook remains the reusable source of truth for people/suppliers/locations/companies and opens as a right-side overlay from linked option rows.
- The options row link control is deliberately low-emphasis so the sheet can stay readable while still making linking/creation available.

## Known Gaps / Technical Debt
- Outreach notes save on blur. This avoids a PATCH on every keystroke, but there is not yet a subtle saved indicator.
- Target list archive is one-way in the UI. The backend keeps archived lists; a future Settings/Admin view can expose restoration.
- The email overlay links to `?message=...`, but Email still needs the exact target-message expansion/minimise behaviour.
- Company comms aggregation is based on known email addresses. It now benefits from linked people, but contacts without email addresses will still not contribute messages.
- Supplier view still applies the broad legacy `SERVICE` filter. Category chips now let you get to all configured groups, but supplier taxonomy can be refined further once records are migrated/classified.
- Candidate snapshot fields are intentionally still separate from Blackbook. Future PDF/export logic must continue to choose deliberately between source fields and project fields.
- No Airtable-style template designer or client PDF options designer yet.

## Exact Next Steps
1. Wire Email `?message=` behavior so a clicked activity opens the full thread with that message expanded.
2. Add company-level notes/files once the activity model is settled.
3. Add saved indicators/toasts for target-list status, notes, and follow-up date updates.
4. Refine supplier/client taxonomy now that legacy Contacts are in Blackbook.
5. Add explicit field-source rules for future option PDFs/decks.
6. Then continue into the Blackbook-backed outreach workflow and PDF/template planning.
