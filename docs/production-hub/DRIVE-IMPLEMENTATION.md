# Workspace and Drive implementation

Implemented and deployed 16 September 2026. The live application passed authenticated API and browser checks; Google Drive consent is now complete. The app refreshed its token, read `_PROJECTS` and confirmed write capability. No projects were linked at verification and no live files have been published by this release workflow. See [the release record](../releases/2026-09-16-production-hub.md). The isolated integration tests mock Google; they do not replace a live publishing pilot.


Subsequent extension: [new project setup](NEW-PROJECT-WORKFLOW.md) now provisions mapped numbered Drive categories. The `Production Hub` layout below continues to apply to legacy projects.

## What changed

- Main navigation prioritises Home, Projects, People, Finance and Files & exports. Operational tools remain below them.
- Finance replaces the empty Budgets landing page with a searchable project index, filters and links into Costs, POs and documents. It displays saved project totals in each budget's currency, not a new invoice/payment ledger.
- Home, Actions, command search, project index and Files use `/api/productions/summary`. The summary selects project metadata, saved financial totals, one upcoming date, crew count and budget identity. It excludes file lists, budget line graphs and email bodies. Project selection no longer reloads the entire list; search is debounced and stale search responses are ignored.
- Project detail no longer downloads email bodies for thread previews; full messages remain available through the email endpoints.
- Files includes a Google connection panel, exact folder linking, nested browsing, pagination, publishing counts, errors and retry. This also appears inside each project's Files module.
- Project uploads and exports filed through `autoFileDocument` create a durable pending record alongside their local staging copy. A worker publishes them to Drive. Existing files require an explicit publish action.
- Synced file preview/download routes stream from Drive. Local copies are retained; there is no destructive file migration or silent fallback to an outdated local copy when a published Drive file is unavailable.

## Configured destination

The default root is the user-supplied [_PROJECTS folder](https://drive.google.com/drive/folders/1-0gwnfN5lGiLa4WGbC_q2nQ50l3e-iSR), ID `1-0gwnfN5lGiLa4WGbC_q2nQ50l3e-iSR`. It can be overridden with `GOOGLE_DRIVE_ROOT_FOLDER_ID`.

A producer selects the exact existing job folder or chooses **New job? Create its project folder**. The create action uses the job code and project title, reuses one exact matching folder on retry and rejects ambiguous duplicates. Folder IDs are unique across projects, validated through Google metadata, checked for write capability and constrained to the configured root. Linking never moves existing documents. Folder reassignment is blocked because it needs a deliberate migration of published records.

New app-managed files use:

```
_PROJECTS/
  <existing project folder>/
    Production Hub/
      Briefs/
      Estimates/
      Budgets/
      Contracts/
      Crew Deals/
      Receipts/
      References/
      Selects/
      Delivery/
      Mail Attachments/
```

Only needed folders are created. Existing children can be browsed directly without importing their contents into database records. No sharing permissions are changed: new files inherit their Drive destination's permissions. Existing project-folder audiences must therefore be appropriate for the documents published there. This implementation does not generate public links or separate client/internal access policies.

## Activation

For the current live release, the migration, builds, restart and server Drive variables are complete. The remaining external steps are exact project-folder linking and a reviewed document pilot. The sequence below also serves future installations; do not rerun completed migration steps unnecessarily.

1. Back up the deployment database and review its existing migration state. Apply `backend/prisma/migrations/20260916130000_project_drive_storage/migration.sql` through the deployment's migration process. It adds nullable project-folder metadata, file publishing fields, indexes and a separate encrypted Drive connection table; it does not migrate existing files. Do not blindly apply unrelated pending migrations in this already-modified checkout.
2. Generate Prisma Client and rebuild/restart the backend and frontend. The new client and source require the new database columns.
3. Enable Google Drive API for the existing Google Cloud OAuth client. Reuse the existing authorised Google redirect URI:
   `https://agent.unlimited.bond/api/email/oauth/google/callback`
4. Set `GOOGLE_DRIVE_REDIRECT_URI` to that URI. Retain the existing `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` and 32-character `EMAIL_ENCRYPTION_KEY`. No tokens or secrets belong in frontend configuration or source control.
5. In Files & exports, choose **Connect Google Drive** and consent using the account that manages `_PROJECTS`. This authorisation belongs to the app; a ChatGPT/Codex Drive connector does not supply the app with reusable credentials.
6. Select a project, link its exact folder and inspect the destination in Drive. New app uploads and supported filed exports queue automatically. Use **Publish existing files / retry** to publish the project's local backlog.
7. Verify a pilot estimate and PDF by opening the published document, refreshing the app and downloading it through the app. Confirm filenames, audience and destination before a broader backlog migration.

The initial dedicated Drive callback produced a redirect_uri_mismatch. The hotfix reuses the existing Google callback, dispatching Drive by session-bound state while keeping token storage separate. GOOGLE_DRIVE_REDIRECT_URI is optional and falls back to GOOGLE_REDIRECT_URI; an explicit alternative must be registered in Google Cloud. User consent and root API access are verified; live publishing still needs a pilot.

## Backend behaviour

`DriveConnection` is workspace-scoped, matching the existing single-team authentication model. Refresh tokens are encrypted using the application's encryption service. OAuth uses a ten-minute session-bound random state, validates the granted scope, verifies root access and consumes state before exchanging the code. Session cookies use SameSite=Lax to support the top-level Google callback; OAuth start explicitly updates stored sessions that still carry the former Strict policy; HttpOnly and production Secure remain enabled.

Existing arbitrary project folders require the full Drive scope in this implementation. A narrower `drive.file` integration would need a Google Picker/open-with permission workflow; accepting a pasted ID alone does not grant per-file access. This is not implemented as a pretend limited scope. Google consent describes the actual permission.

The queue states are LOCAL → PENDING → SYNCING → SYNCED, with ERROR for failures. A database lease recovers abandoned work. Per-project advisory locking avoids concurrent destination-folder creation. The worker reserves a Drive file ID and saves it before upload. A retry checks that same ID, so losing an upload response does not create another file. App properties also identify managed uploads. Tokens and provider response bodies are not returned to the browser.

The worker checks every 15 seconds, handles up to ten records per pass and records actionable failures for explicit retry. It runs from the backend entry point, not in HTTP GET handlers. Published and queued files cannot be renamed, moved or deleted through local file controls; new export versions remain separate documents. Drive-native edits are made in Drive. A file moved or trashed externally requires attention rather than automatic destructive correction.

API routes under authenticated `/api/drive`:

| Route | Purpose |
| --- | --- |
| GET `/status` | Configuration/connection state; never tokens |
| GET `/oauth/start`, `/oauth/callback` | Google connection |
| GET `/folders` | Paginated root folder choices |
| GET `/projects/:id` | Link, counts and publishing failures |
| POST `/projects/:id/link` | Verify and link existing project folder |
| POST `/projects/:id/create-folder` | Create/reuse the exact job-code/title folder under the root |
| GET `/projects/:id/browse` | Paginated, root-constrained Drive browsing |
| POST `/projects/:id/publish` | Queue LOCAL/ERROR files, preserving already-published documents |

## Validation

- Backend TypeScript build; frontend production build and lint.
- `node scripts/tests/drive-integration.cjs`: creates/drops its own PostgreSQL schema and exercises the actual additive migration; checks new-folder retry, staging/queue persistence, lost-response retry without duplicate upload, retained local source, out-of-root rejection, revoked tokens, compact summary contract, OAuth-state rejection, published-file deletion protection, Drive-backed downloads and retry.
- `node scripts/tests/drive-ui-smoke.cjs`: fixture browser checks for Finance links, slim requests, folder linking, queue feedback, failed browse/retry, nested folders and mobile layout.
- `node scripts/tests/workspace-smoke.cjs`: existing Home/Actions/editing/undo/navigation regression test, updated for the summary endpoint.

Browser tests expect the Vite server on `127.0.0.1:5175`. Google is mocked, so they establish application behaviour, not live Google permission or deployment readiness. The integration test requires PostgreSQL schema-create permission and never starts the production background jobs.

## Remaining scope

The foundation release described here did not implement the finance redesign. Subsequent [finance register](FINANCE-IMPLEMENTATION.md) and [new project workflow](NEW-PROJECT-WORKFLOW.md) releases add that separation, mapped category folders and reviewed Drive invoice import. Workbook/domain duplication also remains and needs a migration that preserves manual rows. This release does not replace bound Apps Scripts, parse existing Drive files into financial records, migrate every direct disk-writing path, implement Google change notifications or synchronise arbitrary edits bidirectionally. The app's existing auth remains single-team.

Technical references: [Google OAuth server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [Drive uploads](https://developers.google.com/workspace/drive/api/guides/manage-uploads), [shared-drive support](https://developers.google.com/workspace/drive/api/guides/enable-shareddrives), [files.generateIds](https://developers.google.com/workspace/drive/api/reference/rest/v3/files/generateIds).

## Activation error handling

Adding an OAuth scope or trusting the app in Workspace Admin does not enable Google Drive API in Cloud Console. Drive 403 responses are mapped to specific safe messages for `accessNotConfigured`/`SERVICE_DISABLED`, missing scope, domain policy and quota. Unknown reasons fall back to account/folder guidance; raw Google error payloads are not exposed. A prior generic 403 cannot establish which cause applied.

See [the working-document workflow](DRIVE-WORKFLOW.md) for editing the same presentation from Drive or the app, existing folder mapping and the distinction between a working deck and an issued PDF.
