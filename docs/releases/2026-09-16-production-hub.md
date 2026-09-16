# 2026-09-16 — production hub deployment and documentation reset

Status: **deployed and live-verified** at 2026-09-16T11:55:17.403Z. Google Drive app consent was pending at initial release and was verified subsequently; see the connected-Drive update below. User explicitly authorised deployment of all current changes and a documentation direction reset.

## Scope

Deploy the current shared working-tree application: UI/Actions/project entry points, slim project reads, Finance index, Drive OAuth/folder/browse/publish/download foundation, plus pre-existing uncommitted production features. Preserve current operational IDs, assets, share links and existing production tools. No claim that the new financial ledger or workbook consolidation is implemented.

Reset active Markdown guidance to the current stack and finance/Drive direction. Preserve 24 existing Markdown files and 9 previously deleted Git versions in the dated archive (33 originals), with checksums. Keep the full old handover and original changelog. Generated July export results remain explicitly historical.

## Preflight and backup

- PM2: `production-management-api`, online, port 3000; nginx static root `/var/www/agent`.
- Git base: `153b47af95b33f16f37a1b06429d281b85354c54`; working tree contains later uncommitted source/migrations.
- 72 migration directories; earlier 71 applied. Only `20260916130000_project_drive_storage` pending.
- Database/schema diff also found pre-existing session JSON/JSONB and index differences. These are outside the Drive migration and are intentionally not auto-applied.
- Backup: `/srv/backups/production-management-system/20260916T114446Z-production-hub` (protected directory).
- Custom DB dump: 45,010,129 bytes, verified readable with `pg_restore --list`; source/config snapshot, exact served frontend, dirty-tree patch/status and SHA-256 manifest retained.
- Existing 7.9G storage retained in place; this release backup does not duplicate it. No asset migration or deletion is part of deployment.
- Rollback limitation: disk build/source snapshot does not reconstruct older JavaScript already loaded by the pre-release PM2 process. Exact served frontend was captured; additive schema can remain during application recovery.

## Pre-deployment validation

- Prisma schema validation: passed.
- Backend TypeScript build: passed.
- Frontend production build: passed.
- Frontend lint: zero errors; one existing SelectsPortal dependency warning.
- Isolated migration/Drive integration test: passed.
- Workspace and Drive browser fixture tests: passed.

## Deployment outcome

- Applied `20260916130000_project_drive_storage`; all 72 migrations are now applied. No unrelated schema-diff operations were applied.
- Configured the Drive callback/root in private server environment; preserved Google mail configuration and encryption/session keys.
- Reloaded PM2 `production-management-api`; local health returned HTTP 200, process online.
- Published frontend assets, retained older hashed assets, then atomically replaced index.html. Public release marker: `/release.json`.
- Authenticated live HTTPS reads passed for health, current user, project summaries, actions, Drive status, files and per-project Drive status. Unauthenticated Drive status correctly returned 401.
- Actual live summary response: **9 projects, 4,421 bytes, 33 ms** in this one request. This is a single request observation, not a latency percentile or proof every module is fast. The earlier 49.5 MB benchmark used the old broad database payload.
- Live browser checks passed for Home, Finance, Files and mobile width; zero browser runtime errors observed. The short-lived verification session was removed afterward.
- Google state: `configured=true`, `connected=false`. No live Drive document was published or moved during verification.
- Code/source hash: `af8adb5ae9fdbfbde47fdd555858a74900eff11e33e432d9f775dfc6f5bd9931` over 191 source/config/migration files. [Source manifest](2026-09-16-source-manifest.json); [live checks](2026-09-16-live-check.json).
- Documentation checks passed: 64 Markdown files classified, 33 historical originals preserved byte-for-byte, and all active local links resolve. `node scripts/tests/docs-check.cjs` verifies the inventory/archive.
- Public HTML matches the new built index byte-for-byte; the public release marker returns the expected code hash. PM2 remains online with one intentional reload and its process list saved.
- Documentation checksum/inventory and final backup artifacts are recorded alongside this release. No Git commit or push is claimed; the deployed source is the reviewed working tree.

## External activation and next work

App Google consent/live publishing is not complete. Complete consent using the shared callback described in the hotfix below in Files & exports; then validate one reviewed document. Independent invoice/payment allocations, reconciliation, manual workbook migration, bound Apps Script parity and project-level staff permissions remain planned.

## Observed integration warning

The existing Gmail background sync logged a 404 for a remote thread that no longer resolves. The API and tested UI remained healthy; this is not a claim that all mail/calendar integrations were end-to-end verified. Investigate stale Gmail history/thread handling separately rather than enabling destructive resync cleanup. No test messages were sent.

## OAuth callback hotfix — 2026-09-16T12:05:22.241Z

The first Drive connection attempt returned Google `redirect_uri_mismatch`: the dedicated Drive callback was not accepted. The correction reuses the existing registered `https://agent.unlimited.bond/api/email/oauth/google/callback`. Drive consent uses a `drive.` random state prefix, requires the authenticated session and validates/consumes the exact expiring state before exchanging the code. Gmail dispatch and separate encrypted token stores are retained. An explicit Drive callback override remains supported; otherwise it falls back to `GOOGLE_REDIRECT_URI`.

Backend rebuilt and PM2 reloaded; no schema changes. Isolated integration tests passed for successful Drive callback/token exchange, no Gmail account writes, rejected wrong/expired/replayed/duplicate state, authentication and normal Gmail dispatch. Live Google navigation reached its sign-in page without redirect mismatch; this verifies the URI correction, not completed user consent. Start a fresh connection from Files & exports rather than reloading the old error URL.

Hotfix release: `20260916T114446Z-oauth-hotfix`. Source SHA-256: `6c4b6680e654a189d6c8a6b91b07bb9fd7802cdf29f551e598f3de4d310b897f`. The [hotfix manifest](2026-09-16-oauth-hotfix-source-manifest.json) preserves the revised source snapshot alongside the initial release manifest. [Live OAuth check](2026-09-16-oauth-hotfix-check.json) records provider-page verification. The prior private environment was preserved in the protected release backup.

Post-hotfix [authenticated live checks](2026-09-16-oauth-hotfix-live-check.json) passed for APIs, Home, Finance, Files and mobile width with zero browser runtime errors. Drive remains configured and awaiting user consent. A final source/documentation snapshot is retained as `released-working-tree.tar.gz` in the same protected backup; local operational asset storage remains in place.

## Existing-session cookie hotfix — 2026-09-16T12:27:16.544Z

The user reached the shared callback but received 401 Unauthorised. Read-only aggregate diagnostics found seven active sessions stored with SameSite=Strict, including one pending Drive flow. Changing the server default did not replace persisted cookie settings. OAuth start now updates the existing cookie to Lax before saving the consent state, preserving Secure/HttpOnly and session authentication.

Backend build, isolated Drive integration and `scripts/tests/drive-session-cookie.cjs` passed. A live browser fixture started with a Strict cookie, followed the app link to Google, verified the new Lax/Secure/HttpOnly cookie, and navigated back from Google with a simulated cancellation. It reached authenticated Drive validation (400 cancelled/expired), rather than 401; no provider token exchange or project/file changes occurred. Actual user consent remains pending. See [browser evidence](2026-09-16-session-cookie-check.json).

Deployed `20260916T114446Z-session-cookie-hotfix` by PM2 reload; no migration or frontend source changes. Source SHA-256 `5006700dcbe656e8a93ec49d923dd675ed3998b9981dde5c3855402ce5d2a732`; [source manifest](2026-09-16-session-cookie-hotfix-source-manifest.json). Earlier release records and snapshots remain preserved.

## Drive activation diagnostics — 2026-09-16T12:30:11.437Z

Following the session correction, the user reached Drive root verification and received a generic 403. Its original provider reason was discarded, so the exact cause cannot be established retrospectively. DriveClient now maps known reason codes to disabled API, missing scope, Workspace policy and quota guidance, retaining safe fallback handling for other denials. No raw provider data is exposed.

Backend build, `scripts/tests/drive-errors.cjs` and session-cookie regression passed. Reloaded PM2 and saved its process configuration; no migration or frontend changes. Release `20260916T114446Z-drive-errors-hotfix`, source SHA-256 `663d4e10e70966e83832b6d07ef1e28a66967690f343f0d896b95c9362b68c30`; [source manifest](2026-09-16-drive-errors-hotfix-source-manifest.json). User is checking Cloud API enablement before retrying consent; successful live connection/publishing remains unverified.

## Connected Drive and working documents — 2026-09-16T12:35:11.402Z

App-owned Google consent completed at 12:30:50 UTC. Read-only verification refreshed the token, read `_PROJECTS`, confirmed canAddChildren and listed 30 immediate folders. Sampled two existing project-folder layouts. No app projects were linked and no remote folders/files were modified. Project codes/titles disagree across several app/Drive records; do not auto-link by code alone.

The user clarified “two way” means editing a presentation in Google Slides. The app already opens the same Google file; its Drive browser now refreshes on window focus and has a manual Refresh action. PDFs remain separately issued snapshots. Category-to-existing-folder mapping, pinned working documents, background indexing and native-deck PDF publication are planned, not delivered. See [workflow](../production-hub/DRIVE-WORKFLOW.md).

Frontend build, targeted ESLint and browser fixture checks passed, including same Slides URL after rename, focus/manual refresh, folder navigation and mobile width. Published frontend assets with atomic index replacement and retained previous assets; no backend reload or migration needed. Release `20260916T114446Z-drive-working-documents`, source SHA-256 `c6d9e41dd251d0128d41d142f9bd2c32d061ae9fbd7ef61c1d18ad93fb81ed90`; [source manifest](2026-09-16-drive-working-documents-source-manifest.json).

[Authenticated live checks](2026-09-16-drive-working-documents-check.json) passed after publication: Home, Finance, Files, mobile and API checks; Drive reports connected=true. No live project files were changed.
