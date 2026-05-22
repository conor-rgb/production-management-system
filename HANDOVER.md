# HANDOVER - 2026-05-22 - Options Candidate Images

## Built This Session
- Added pictures back to active Options candidate sheets as the first column.
- Added `OptionCandidatePhoto` storage for matrix candidate options, separate from the older legacy board-option photos.
- Added image upload/management modal from the candidate row thumbnail.
- Uploaded option images are converted server-side with `sharp`:
  - accepts JPG, PNG, WEBP,
  - rotates based on metadata,
  - resizes to max 1800px on the longest edge without upscaling,
  - converts to JPEG quality 82 with mozjpeg,
  - stores the optimised file on disk for digital PDF/deck use.
- Each image can be marked `Export to PDF`; this is stored now so the future PDF generator can decide which selected images to include.
- Candidate rows show a 48px thumbnail and image count.
- Photo manager shows dimensions, caption field, delete action, and selected-for-export checkbox.

## Schema
- Added `OptionCandidatePhoto` model mapped to `pms_option_candidate_photos`.
- Fields include candidate relation, filename, stored path, file size, width, height, order, caption, `exportSelected`, and created date.
- Migration applied non-interactively via `prisma migrate deploy`:
  - `20260522192000_option_candidate_photos`

## Backend
- Installed `sharp` in backend dependencies.
- Updated `backend/src/routes/options.ts`:
  - matrix responses now include candidate photos with serve URLs,
  - added candidate photo upload endpoint,
  - added candidate photo update endpoint for caption/export selection,
  - added candidate photo delete endpoint,
  - added candidate photo serve endpoint,
  - deletes candidate photo files when a candidate is deleted.
- Existing legacy options-board photo endpoints remain untouched.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Candidate sheet now starts with `Image | Option | Project note | Project rate | State | dates...`.
- Added `PhotoThumb` and `PhotoManager` components.
- Photo manager uploads via multipart fetch and updates the matrix immediately after each change.

## Verification
- Prisma migration applied successfully.
- Prisma client generated.
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- PM2 process `0` reloaded.
- Health check passed after reload.

## Current Options / Blackbook State
- Options matrix remains project-specific for candidates, rates, notes, holds, assignments, and now images.
- Candidate photos are stored as optimised JPEGs in the production job folder under `Options/[group]/[candidateId]/`.
- Image `exportSelected` flags are ready for the next PDF/export pass.
- Blackbook remains the reusable source of truth for people/suppliers/locations/companies and opens as a right-side overlay from linked option rows.
- Company Blackbook records behave as CRM rollups for people, emails, options, opportunities, and productions.

## Known Gaps / Technical Debt
- No drag reorder UI for candidate images yet, though the backend has a reorder endpoint.
- The future PDF generator still needs to consume `exportSelected` images and define layout rules.
- Candidate photo captions save on blur; there is no inline saved indicator in the photo modal yet.
- Company notes are plain text only. No files, rich text, pinned fields, or note history yet.
- Company rollup currently uses attached people/contact IDs/emails. It does not yet infer unknown people from company email domains.
- Focused email links currently request up to 500 messages for the thread. A future performance pass should fetch a cursor window around the target message instead.
- Supplier view still applies the broad legacy `SERVICE` filter. Category chips now let you get to all configured groups, but supplier taxonomy can be refined further once records are migrated/classified.
- No Airtable-style template designer or client PDF options designer yet.

## Exact Next Steps
1. Start the options PDF/deck export planning and wire it to selected candidate images.
2. Add image reorder controls before PDF layout if cover/ordering matters in the user-supplied deck reference.
3. Add explicit field-source rules for PDFs: Blackbook fields vs project candidate overrides.
4. Add company files and pinned company fields once the note model is settled.
5. Refine supplier/client taxonomy now that legacy Contacts are in Blackbook.
