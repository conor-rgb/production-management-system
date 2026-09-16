# Export Plan

## Implemented Utility

- Exporter: `scripts/legacy-export/export.ts`.
- Validator: `scripts/legacy-export/validate.ts`.
- README: `scripts/legacy-export/README.md`.
- Package commands in `backend/package.json`:
  - `legacy:export:dry`
  - `legacy:export`
  - `legacy:validate`

## Export Behavior

- Reads via Prisma `count`, `findMany`, and validator `findFirst` only.
- Excludes `Session`.
- Redacts `Settings.password` and `EmailAccount` encrypted credential/token fields.
- Redacts scalar fields matching password, secret, OAuth token, refresh token, session, JWT, API key, or client secret patterns.
- Preserves scalar IDs, timestamps, nullable fields, arrays, JSON fields, and foreign-key scalar fields.
- Writes JSON and CSV per exported Prisma model.
- Writes `manifest.json`, `errors.json`, `validation-results.json`, and `exports/VALIDATION_REPORT.md`.

## Latest Runs

- Dry run: `exports/legacy-export/2026-07-31T122838146Z-dry-run`.
- Validated full export: `exports/legacy-export/2026-07-31T123004279Z-full`.
- Export size: `580M`.
- Models exported: 68.
- Source rows: 31,695.
- Exported rows: 31,695.
- Count mismatches: 0.
- Checksum failures: 0.
- Orphan relationship groups: 0.
- Duplicate candidate groups: 266.

## Restore / Import Preparation

- Use JSON for canonical migration because nulls, arrays, and JSON values are preserved exactly.
- Use CSV for spreadsheet review and stakeholder sign-off.
- Rehydrate file assets from `backend/storage` using `JobFile` and related still/selects metadata.
- Reconnect Gmail/Google/FreeAgent credentials through new OAuth flows rather than importing encrypted tokens.
