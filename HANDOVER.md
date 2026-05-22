# HANDOVER - 2026-05-22 - Options Candidate Drag Reorder

## Built This Session
- Replaced candidate row up/down reorder arrows with a click-hold drag handle.
- The compact right-side action area now shows:
  - drag handle,
  - delete.
- Dragging a row handle over another row and dropping persists the new order.
- Drag target rows highlight while hovering.
- Dragged rows fade slightly while moving.
- Existing row-level image drag/drop still works; file drops still upload images to the option row.

## Frontend
- Updated `frontend/src/components/options/OptionsBoardView.tsx`.
- Added candidate reorder drag state:
  - `dragCandidateId`,
  - `dropCandidateId`.
- `CandidateRow` now handles:
  - row reorder drag-over/drop for text drag payloads,
  - image upload drag/drop for file payloads.
- Reorder drag starts only from the `⋮⋮` handle.
- Dropping persists via the existing candidate reorder endpoint.
- After a drag reorder, the sheet returns to manual order.

## Backend
- No backend changes this session.
- Existing endpoint used:
  - `PATCH /api/options/matrix/groups/:groupId/candidates/reorder`

## Deployment / Verification
- Frontend build passed.
- Frontend copied to `/var/www/agent`.
- No PM2 reload required.

## Current Options Sheet State
- Header sorting remains local/non-destructive.
- Manual order is saved when rows are drag-reordered.
- Drag-to-upload images over candidate rows still works.

## Known Gaps / Technical Debt
- Drag reorder uses browser native HTML5 drag/drop, so mobile touch reorder is not polished yet.
- There is no insertion line indicator, only row highlight.
- If dragging while a sorted header view is active, the visible sorted order becomes the new manual order after drop. This is intentional for now but could be made stricter later.

## Exact Next Steps
1. Test dragging candidate rows in the GANNI x Disney options sheet.
2. If the target feedback is not clear enough, add a thin insertion line above/below the hovered row.
3. Add touch-friendly reorder later if mobile options editing becomes important.
