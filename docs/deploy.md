# Production deployment runbook

Current direction and release procedure, 16 September 2026. Product scope: [BRIEF.md](../BRIEF.md). Outcomes: [release records](releases/README.md). The old deployment document is preserved in the dated archive.

## Live layout

- URL: https://agent.unlimited.bond
- Repository: `/srv/production-management-system`
- Backend: PM2 `production-management-api`, working directory `backend`, entry point `backend/dist/index.js`, port 3000.
- Frontend: Vite build served by nginx from `/var/www/agent`.
- PostgreSQL: local server, credentials in private `backend/.env`; sessions in `pms_sessions`.
- Assets: `backend/storage`; Drive integration does not make those existing local assets disposable.

## Prepare

1. Establish the release scope and user authorisation. Inspect `git status`, PM2 app identity, nginx paths, disk capacity and Prisma migration status. This checkout includes important uncommitted features; do not reset/pull over it or treat Git HEAD as the deployed source.
2. Create a dated, mode-0700 backup directory outside the repository. Capture a custom-format PostgreSQL dump and verify it with `pg_restore --list`. Store credentials in protected environment/file inputs, never shell arguments or output. Snapshot private environment/config, the working source/build files and the actually served frontend. Hash backup artifacts.
3. State whether uploaded assets are included. The September release retains storage in place and does not mutate it; its release backup is DB/config/source/static only. Maintain a separate asset backup strategy.
4. Record a source manifest (path, bytes, SHA-256), excluding secrets, node_modules, customer import artifacts, generated business exports and storage. Preserve build-output checksums separately. Record dirty-tree status and base Git commit.

## Validate

From repository root:

```sh
npm --prefix backend run build
npm --prefix frontend run lint
npm --prefix frontend run build
node scripts/tests/drive-integration.cjs
node scripts/tests/workspace-smoke.cjs
node scripts/tests/drive-ui-smoke.cjs
```

The browser fixtures require Vite on 127.0.0.1:5175. The database test creates/drops its own schema and mocks Google. It does not prove live Google consent. Run Prisma schema validation and inspect migration SQL/status from `backend` as well. Do not upgrade dependencies merely because Prisma prints an update notice.

## Apply and publish

1. Set only reviewed environment changes. For Drive: `GOOGLE_DRIVE_REDIRECT_URI=https://agent.unlimited.bond/api/email/oauth/google/callback`, `GOOGLE_DRIVE_ROOT_FOLDER_ID=1-0gwnfN5lGiLa4WGbC_q2nQ50l3e-iSR`. Reuse the registered Gmail callback; preserve existing keys. Confirm production seed and destructive mail cleanup remain disabled.
2. In `backend`, run `npx prisma migrate deploy` after checking that every pending migration is intended. Regenerate Prisma Client when needed. Never use `migrate dev`, `migrate reset` or `db push` on production. Do not apply an automatically generated schema-diff script that includes unrelated drift.
3. Reload the named PM2 application with updated environment: `pm2 reload production-management-api --update-env`. Check local API health and process state before changing the frontend entry point.
4. Copy built frontend assets into `/var/www/agent`, retaining old hashed assets for open browser sessions. Publish `index.html` last via a same-filesystem temporary file plus rename. Do not delete an uploads directory or unrelated static files. Write a non-secret release marker.
5. Check local and public HTTPS health, new static entry-point hashes, authenticated APIs and browser navigation. Use a short-lived test session if necessary, never record its cookie, and delete it afterward. Do not send messages, publish real files or edit financial records just to smoke-test deployment.
6. Record results in CHANGELOG, HANDOVER and the dated release record. Update implementation docs from “not deployed” only after checks succeed. Save a final source manifest and deployment log.

## Google activation

The callback must be registered with the existing Google OAuth client and Google Drive API enabled. The user then completes **Connect Google Drive** in Files & exports. Deployment/configuration does not imply consent. Do not copy tokens out of the assistant connector or assume Gmail scopes include Drive. Verify one exact project folder and reviewed PDF before publishing a backlog.

## Recovery

Retain the additive Drive columns/table on an application rollback; existing records do not need to be destroyed to return the previous frontend. Restore the backed-up served frontend entry point/assets if required. Use a known compatible backend release; a source/disk snapshot taken after local builds may differ from the older code already loaded in PM2. That limitation must be stated in the release record rather than claiming exact runtime rollback.

Database restoration can erase writes since the dump: use it only as a deliberate recovery operation with the app stopped, not as a routine response to a frontend failure. Never automatically drop sessions, business tables or Drive documents. Keep backup paths private and artifacts outside the public web root.
