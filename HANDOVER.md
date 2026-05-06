# Phase 4 Handover — File System

## What Was Built

### Backend File Storage
- Base job storage path is `/srv/production-management-system/backend/storage/jobs/`.
- Every new Production now gets a physical job folder named `YYNN — Client Brand`.
- Each job folder is auto-created with:
  - `Briefs/`
  - `Estimates/`
  - `Budgets/`
  - `Contracts/`
  - `Crew Deals/`
  - `Receipts/`
  - `References/`
  - `Selects/`
  - `Delivery/`
- Folder creation is automatic in both production creation paths:
  - Direct `POST /api/productions`
  - Opportunity Won flow creating a Production
- Folder creation is idempotent. Existing folders are skipped silently.
- `Production.storagePath` stores the absolute job folder path.
- Existing productions without `storagePath` are backfilled lazily when their file tree or upload endpoint is used.

### Backend File Metadata
- Replaced the Phase 1 placeholder `JobFile` shape with the Phase 4 metadata model:
  - `productionId`
  - `folder`
  - `originalFilename`
  - `storedFilename`
  - `mimeType`
  - `sizeBytes`
  - `uploadedAt`
  - `linkedBudgetLineId`
  - `isReceipt`
  - `receiptVendor`
  - `receiptAmount`
  - `receiptDate`
  - `notes`
- Added relation from `JobFile.linkedBudgetLineId` to `BudgetLineItem`.
- Added Prisma migration `20260506170000_phase4_file_storage`.
- Installed backend dependencies:
  - `multer`
  - `mime-types`
  - `@types/multer`
  - `@types/mime-types`

### Backend File API
- Replaced `/api/files` placeholder routes with:
  - `GET /api/files/production/:productionId/tree`
  - `POST /api/files/production/:productionId/upload`
  - `GET /api/files/:fileId/download`
  - `GET /api/files/:fileId/preview`
  - `PATCH /api/files/:fileId`
  - `DELETE /api/files/:fileId`
  - `GET /api/files/all`
  - `GET /api/files/storage-info`
- Uploads use multipart form data through Multer.
- Upload limit is 100MB per file with clear JSON `413` response.
- Server detects MIME type using `mime-types` from the uploaded filename; it does not trust the browser content type.
- Stored filenames use UUIDs plus extension to avoid collisions.
- Disk write happens before database record creation; if DB creation fails, the disk file is removed.
- Moving a file to a new folder physically moves it on disk and updates the DB.
- Delete removes the physical file and then the DB row.
- Preview behavior:
  - Images stream inline.
  - PDFs stream inline.
  - Other file types return metadata with `previewable: false`.
- Cross-job browser supports `folder`, `search`, `productionId`, and `page` query params with 50 files per page.
- Added hook functions in `backend/src/services/fileStorage.ts`:
  - `autoFileDocument(productionId, folder, buffer, filename, mimeType, options)`
  - `autoFileReceipt(productionId, buffer, filename, mimeType, options)`
- These hooks are ready for Phase 5 budget PDF export and Phase 7 receipt capture.

### Production Files Tab
- Replaced the Production detail Files placeholder with a working file browser.
- Folder navigation:
  - All nine folders always shown.
  - File count badges per folder.
  - Current folder highlighted.
  - Mobile uses horizontal scrolling folder tabs.
  - Desktop uses a left folder rail.
- File list:
  - Shows file type icon, filename, size, upload date.
  - Rows are at least 52px high.
  - Desktop hover shows Rename, Move, Download, Delete actions.
  - Mobile swipe-left or More button reveals Rename, Move, Download, Delete actions.
- Upload:
  - Upload button is always visible.
  - Desktop supports file picker and drag/drop over the list area.
  - Mobile shows Camera, Photo Library, and Files App choices.
  - Multiple files can be uploaded.
  - Upload progress is shown as per-file “Uploading…” rows.
  - Uploaded files appear after API completion without a full page reload.
- Preview:
  - Desktop opens a right-side panel.
  - Mobile opens full-screen.
  - Images render inline.
  - PDFs render in an iframe via the preview endpoint.
  - Other files show icon, filename, metadata, and Download button.
  - Notes field saves on blur.
  - Budget line dropdown is present with Phase 5 placeholder.
  - Receipt metadata section appears for receipt files and is read-only until Phase 7.
- Empty folders show an empty state and upload button.
- Briefs is selected by default on first open.

### Cross-Job Files Screen
- Replaced the main Files placeholder page with a working cross-job file browser.
- Search by filename across all jobs.
- Filter by folder.
- Filter by production/job.
- File list shows:
  - File type icon
  - Filename
  - Job code and client/title
  - Folder
  - Size
  - Upload date
- Tapping opens the same preview panel used by the Production Files tab.
- Supports “Load more” pagination.
- Empty state explains that files uploaded to productions appear there.

### Settings Storage Section
- Added Settings storage summary:
  - Total storage used
  - Number of files
  - Base storage path

## Key Decisions

- Kept storage local to the VPS under `backend/storage/jobs` per the brief.
- Used absolute `Production.storagePath` to make later file-system operations direct and avoid recalculating names if client/brand changes later.
- Used UUID stored filenames to avoid disk collisions while preserving the original filename in metadata.
- Kept folder names as plain strings in Prisma rather than an enum so future folders can be added without an enum migration.
- Kept receipt-specific metadata on `JobFile` now, but Phase 7 will populate it.
- Kept budget-line linking nullable; Phase 5 will populate the dropdown with real budget lines.
- Kept the same preview panel for Production Files and global Files to avoid duplicate UI behavior.
- Used Prisma migration diff tooling and `prisma migrate deploy` because `prisma migrate dev` is not usable in this non-interactive environment.
- The production database had no `_prisma_migrations` table even though the Phase 3 schema was present. I baselined the existing local migration folders with `prisma migrate resolve --applied`, then applied the Phase 4 migration normally.

## Verification

- Prisma schema validated.
- Phase 4 migration applied with `npx prisma migrate deploy`.
- Prisma Client regenerated.
- Backend build passes with `npm run build`.
- Frontend build passes with `npm run build`.
- Live PM2 API reloaded.
- Frontend build copied to `/var/www/agent`.
- Live HTTPS API test completed:
  - Created disposable Production `Phase 4 File Test`.
  - Verified folder tree created on disk at `backend/storage/jobs/2647 — Test Client File System`.
  - Uploaded `phase4-upload.txt` to `Briefs`.
  - Verified `tree` endpoint showed the file and all empty folders.
  - Verified non-previewable preview response for `text/plain`.
  - Renamed and moved the file to `Receipts`.
  - Verified physical file moved on disk.
  - Downloaded file and confirmed contents.
  - Verified `/api/files/all` returned the file with production context.
  - Deleted file through API.
  - Deleted disposable Production.
  - Removed disposable job folder.
  - Reset `Settings.jobCodeSequence` back to `46`; next real job code remains `2647`.
  - Verified `/api/files/storage-info` returns storage totals and base path.

## Current Module State

### Dashboard
- Phase 2 opportunity widgets and Phase 3 production widgets remain working.
- File-system storage is not surfaced on dashboard.
- Receipt capture remains Phase 7.

### Opportunities
- Won flow is fixed from the prior bugfix:
  - Confirmation first
  - `PATCH /api/opportunities/:id`
  - Production creation
  - Direct navigation to `/productions?production=<id>`
- Won-created productions now also receive their physical folder structure automatically.

### Productions
- Phase 3 production core remains in place.
- Files tab is now a working file browser.
- New productions automatically create storage folders.
- Existing productions get folders lazily when files are opened/uploaded.
- Budget tab remains Phase 5 placeholder.

### Production Dates
- CRUD and dashboard agenda remain in place.
- No calendar sync yet.

### Crew
- CRUD and Settings-managed roles remain in place.
- Call sheet export is not built.

### Contacts
- Phase 2 contacts remain in place.
- Supplier auto-create from crew remains in place.

### Files
- Phase 4 file system is implemented:
  - Production-scoped browser
  - Cross-job browser
  - Upload/download/preview/rename/move/delete
  - Physical disk storage
  - DB metadata
- File upload and preview behavior is browser-native; advanced image zoom controls are not custom-built.

### Settings
- Account password and crew roles remain.
- Storage info section added.
- Job code sequence is stored but still has no UI editor.

### Budgets
- Still placeholder UI.
- `BudgetLineItem.actualCost` exists from Phase 3.
- `JobFile.linkedBudgetLineId` is ready for Phase 5 budget-line linking.

### Email
- Still placeholder UI.
- Email attachment save-to-file-system will be Phase 6.

## Known Issues And Technical Debt

- Browser automation tooling is not installed, so I did not run Playwright mobile screenshots at 390px. Frontend build and manual responsive class review passed.
- Mobile upload choice opens browser file inputs; exact Camera/Photo Library/Files behavior depends on iOS Safari.
- Swipe actions are implemented with a simple horizontal touch threshold; they are functional but not animated.
- Upload progress is per-file state text, not byte-level progress. Fetch does not expose upload progress without XHR.
- MIME detection uses `mime-types` based on filename because that is what the required package provides. Content sniffing could be added later if stronger validation is needed.
- Deleting a Production cascades DB file records but does not automatically remove the physical production folder. Phase 4 explicit file delete removes disk files correctly. A future cleanup hook can remove entire production folders if desired.
- Existing unrelated worktree changes remain untouched: deleted repo metadata/docs files and untracked `BRIEF.md` / `CLAUDE.md`.

## Exact Next Step For Phase 5

Start Phase 5 with the Budget backend and schema:
1. Expand `Budget`, `BudgetSection`, and `BudgetLineItem` to the AICP model from `BRIEF.md`.
2. Add internal/client rates, quantity, days/units labels, actual cost, variance, markup, and invoice metadata.
3. Build budget totals service so Production quoted value and actual spend are driven by budget data.
4. Add Budget API routes for sections, line items, reordering, totals, and linked file/receipt lookups.
5. Then replace the Production Budget placeholder with the internal/client-facing budget UI.
6. Use the Phase 4 `autoFileDocument()` hook when exporting estimate PDFs into the job’s `Estimates/` folder.
