# Storage And Assets

## Local Storage

- Root: `backend/storage`.
- Verified size at backup/export time: `7.9G`, `8,383,949,127` bytes, `16,636` files.
- Backed up byte-for-byte into `/srv/backups/production-management-system/20260731T120838Z/source/backend/storage`.

## Storage Layout

- `backend/storage/jobs/<jobCode> - <client brand>/`: production-specific folders.
- Standard job folders from `fileStorage.ts`: `Briefs`, `Estimates`, `Budgets`, `Contracts`, `Crew Deals`, `Receipts`, `References`, `Selects`, `Delivery`, `Mail Attachments`.
- `backend/storage/mail-attachments`: unlinked/global mail attachments.
- `backend/storage/email-drafts`: draft attachment folders.
- `backend/storage/receipts/pending`: receipt-capture staging.

## Metadata Coupling

- `JobFile` stores original filename, stored filename, MIME type, size, production/folder, source email references, receipt metadata, and linked budget line.
- `Production.storagePath` may contain absolute local paths and must be migrated or rewritten carefully.
- Stills/selects data references `JobFile` for original assets, thumbnails, retouch versions, source assets, and SKU thumbnails.
- Crew itinerary file links use `CrewItineraryItemFile` to connect itinerary items to `JobFile`.

## S3-Style Storage

`S3_BUCKET`, `S3_REGION`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, and `S3_ENDPOINT` are configured in env, but the audited `fileStorage.ts` writes local filesystem files. Treat S3 as configured-but-not-confirmed until historical deployment behavior is clarified.

## Assets To Migrate

- All `JobFile` rows and corresponding stored files.
- Selects/stills originals and thumbnails.
- Candidate option photos/PDFs/static maps.
- Email attachments saved as job files.
- Receipt captures and pending receipt files.
- Crew itinerary generated PDFs and attached travel/accommodation files.
