# Security and data handling

Private business application. Never publish credentials, database dumps, uploaded assets, private Drive documents, financial exports or email data. Report issues privately to the repository owner.

## Current controls and limits

- Existing staff login uses server-side sessions in PostgreSQL; it is a single-team model, not per-project staff access control.
- Production requires a strong SESSION_SECRET, HTTPS and Secure/HttpOnly cookies. SameSite=Lax supports the Google top-level callback.
- Drive OAuth uses session-bound expiring state, encrypted refresh tokens and verified folder boundaries. The current integration requests Drive scope for existing project folders; it is not a Picker-based drive.file-only implementation.
- Drive sharing is inherited from the destination. Do not publish internal finance material to client-shared folders. No permissions are automatically made public.
- Public share/onboarding routes have their own token/password behaviour; don't claim all historical links expire without checking their implementation.
- Disable default-admin seeding and GMAIL_RESYNC_CLEANUP in production. Preserve session records during normal migrations.

## Releases and recovery

Use [the deployment runbook](docs/deploy.md). Keep protected database/config backups and retain local storage until a verified asset migration and recovery plan exists. Exclude `.env`, storage, exports and customer import files from commits. A redacted export is not a complete disaster-recovery backup.
