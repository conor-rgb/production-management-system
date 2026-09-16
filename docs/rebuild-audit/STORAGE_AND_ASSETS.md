# Storage and assets

Updated 16 September 2026. [Drive implementation](../production-hub/DRIVE-IMPLEMENTATION.md); [historical inventory](../archive/2026-09-16-before-direction-reset/docs/rebuild-audit/STORAGE_AND_ASSETS.md).

## Current ownership

PostgreSQL stores IDs, relationships, file metadata, remote links and publishing state. Drive stores published document binaries under the user's `_PROJECTS` tree. Existing project folders are linked explicitly or created with a job-code/title name. Legacy app-managed children use `Production Hub/<category>`; new projects use [mapped numbered category folders](../production-hub/NEW-PROJECT-WORKFLOW.md); existing folders/documents are not moved.

Local `backend/storage` remains required (about 7.9G at release preflight). It includes job files, selects/stills originals/thumbnails, option photos/maps/PDFs, mail attachments, draft attachments, pending receipts and itinerary evidence. Uploads and `autoFileDocument` outputs queue for Drive after the project is linked. Other direct filesystem paths are not automatically migrated.

JobFile now includes Drive ID/link/status/error/time/lease fields; Production has folder ID/name. Synced preview/download routes read Drive. Local copies remain available for recovery, but unavailable published Drive content does not silently fall back to a stale local version.

## Migration and recovery

Never delete local files based on a successful upload count alone. Verify document identity, bytes/content, audience and downloadable output, and retain the underlying linked assets and a recovery plan. Drive is not a backup of PostgreSQL. A database dump is not a backup of local assets. The release record states exactly what its deployment backup contains.

Do not use names to merge files or projects. IDs and explicit provenance remain stable. Drive permissions are inherited; internal finance files require an appropriate destination audience. Arbitrary remote edits are not synchronised into local financial records. S3 is not the implemented storage adapter.
