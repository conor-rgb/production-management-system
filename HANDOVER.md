# HANDOVER — 2026-05-22 — Blackbook Foundation Before Options PDFs

## Built this session
- Reviewed the historical reference material in `build references/options and crew list/`:
  - `Locations V6 | 2431U | DISNEY Ganni x Daisy Duck.pdf`
  - `Casting V8 | 2431U | DISNEY Ganni x Daisy Duck.pdf`
  - crew/status sheet screenshots
- Decision: do not build the final PDF/deck generator yet. The old docs prove the PDF needs a richer blackbook data layer first.
- Added the first Blackbook foundation layer for the Options Matrix:
  - reusable people/company/location/talent/service records
  - structured location address and technical fields
  - talent agency/link/stat fields
  - person-level dietary flags, allergens, and dietary notes
  - candidate-to-blackbook linking from the candidate sheet
- Added a compact Blackbook column to each Options candidate row:
  - search existing blackbook entries
  - link a candidate to an existing entry
  - create a blackbook entry from the candidate row
  - unlink if needed
  - show dietaries/allergens inline when present
- Added a sticky-note style Blackbook details pad from the candidate row:
  - display name
  - company/agency
  - email/phone/website
  - location type and structured address
  - UK/FR agency and book/social/polas/models.com links
  - dietary flags, allergens, and notes

## Schema
- Added enums:
  - `BlackbookEntryType`: `PERSON`, `COMPANY`, `LOCATION`, `TALENT`, `SERVICE`
  - `BlackbookCategory`: `CREW`, `SERVICE`, `LOCATION`, `EQUIPMENT`, `TALENT`, `TRANSPORT`, `POST`, `OTHER`
- Added model:
  - `BlackbookEntry`
- Added `OptionCandidate.blackbookEntryId` and relation to `BlackbookEntry`.
- Migration deployed:
  - `backend/prisma/migrations/20260522150000_blackbook_foundation/migration.sql`
- Important: generated Prisma diff included an accidental `DROP TABLE "pms_sessions";`; this was removed before deploy.

## Backend
- Extended `/api/options`:
  - `GET /api/options/blackbook?q=&category=&entryType=&limit=`
  - `POST /api/options/blackbook`
  - `PATCH /api/options/blackbook/:entryId`
  - `POST /api/options/matrix/candidates/:candidateId/link-blackbook`
- Matrix response now includes each candidate’s linked `blackbookEntry`.
- Candidate creation can accept `blackbookEntryId`.
- Linking a candidate to blackbook copies key defaults into the candidate row:
  - name
  - company/subtitle
  - email/phone/website
  - default rate/rate unit/currency
- Creating from a candidate infers blackbook entry type/category from the option group type.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Candidate sheet now includes:
  - Name
  - Blackbook
  - Subtitle
  - Rate
  - State
  - per-date hold statuses
- The Blackbook cell supports:
  - search and link
  - create from row
  - unlink
  - edit blackbook details
  - immediate dietary/allergen visibility

## Reference doc findings for the future PDF/deck generator
- Location decks are landscape 16:9, one option per page, not a normal report.
- Location option pages need:
  - name/studio
  - status per production date
  - full structured address
  - PDF/website links
  - 4 hero/reference images
  - map
  - daylight/blackout
  - sqm, shooting area, ceiling height
  - access/loading/facilities/client/HMU/styling/catering notes
- Casting decks need:
  - model/talent name and role
  - UK/FR agency
  - book/social/polas/self-tape/models.com links
  - stats: height, eyes, hair, bust, waist, hips, shoe
  - 3 hero images
  - status per production date
  - client-safe notes
- Crew/status sheet needs:
  - role
  - confirmed person per role/date
  - email/phone/address/city/postcode/country
  - travel/parking/taxi/NDA
  - dietaries and dietary counts

## Verification
- Prisma migration deployed.
- Prisma client generated.
- Backend build passed.
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- PM2 process `0` reloaded.
- Health check passed: `GET /api/health`.

## Known gaps / technical debt
- No final PDF/deck generator work was done by design.
- The old `OptionsBoard`, `OptionsCategory`, `Option`, `OptionPhoto`, and `optionsPdf.ts` still exist for legacy compatibility.
- Candidate photos are still attached to the old flat `Option` model, not yet to `OptionCandidate` or `BlackbookEntry`.
- Existing GANNI location candidates are not automatically linked to blackbook entries yet; each can now be linked or converted from the candidate sheet.
- Blackbook does not yet have a standalone main navigation page.
- Dietaries are now stored on blackbook entries, but production-specific dietary overrides are not implemented yet.
- Main Dates tab and calendar do not yet show option/hold status summaries.

## Exact next step
Build the media/data bridge before PDFs:
1. Add candidate/blackbook photo storage so each candidate can carry deck images independently of the legacy flat options board.
2. Add a bulk action to convert existing candidates in a group into blackbook entries.
3. Add a status/crew list export view that pulls confirmed assignments and dietaries from blackbook.
4. Then pause for the revised client deck design before replacing `optionsPdf.ts` with the smart landscape generator.
