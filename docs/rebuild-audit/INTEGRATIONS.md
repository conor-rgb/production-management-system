# Integration status

Updated 16 September 2026. [Original July inventory](../archive/2026-09-16-before-direction-reset/docs/rebuild-audit/INTEGRATIONS.md).

## Google Drive

App-owned OAuth with separate encrypted DriveConnection. Existing `_PROJECTS` root, verified folder links/new-folder creation, pagination, browse, publication/retry and Drive-backed downloads. The assistant's connector is not reusable app credentials. Full external consent and a live file pilot must be verified separately from deployment. [Implementation/activation](../production-hub/DRIVE-IMPLEMENTATION.md).

## Gmail, IMAP/SMTP and Calendar

Retain existing account/token models and mail/draft/attachment flows. The email callback remains `/api/email/oauth/google/callback`; Drive reuses that registered callback with a `drive.` state prefix and authenticated session validation. The dedicated `/api/drive/oauth/callback` remains available if separately registered. Consent and encrypted tokens remain separate.

Existing startup/incremental Gmail sync, non-Google IMAP IDLE and Calendar sync remain. Deployment may restart those existing workers; it must not enable destructive resync cleanup or send test messages to real recipients. Token refresh or background-sync health must be checked independently of an HTTP health endpoint.

## Production helpers

Maps/Places serve location lookup and maps. Anthropic handles existing receipt/travel extraction. Existing branded budget/options/location/casting/itinerary/selects services remain. Bound Apps Script source/parity is still incomplete; do not replace working generators from inspection of only the two old starter scripts.

## Not established as complete

FreeAgent has status fields/configuration but no complete mounted accounting integration was established. OpenAI structured workflow tools, S3 storage, Redis queues and a SendGrid rewrite are not this release. Source/document links are evidence; AI matches must not silently approve financial records.
