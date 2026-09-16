# Migration Risks

## High Risk

- File metadata and local files must stay aligned. `JobFile.storedFilename`, `folder`, `productionId`, and `Production.storagePath` are not useful without the corresponding file tree.
- OAuth tokens and passwords are intentionally not exported. Google Workspace and any future FreeAgent connection must be reauthorized.
- Email data is large and linked across threads, messages, contacts, opportunities, productions, actions, and files. Preserve IDs during migration.
- `GMAIL_RESYNC_CLEANUP` code can delete email rows and alter `.env`; keep it disabled.
- Current app has uncommitted production changes and is ahead of origin. Treat the working tree as the source of truth, not remote Git.

## Medium Risk

- Duplicate candidate groups require human review before dedupe.
- Empty tables may represent future features rather than obsolete data.
- Calendar sync has bidirectional behavior; avoid duplicate Google events during cutover.
- Public share tokens, onboarding tokens, and select links may be sensitive operational URLs; decide whether to preserve or rotate them.
- S3 config exists but active storage appears local; confirm before designing storage migration.

## Low Risk / Archive Candidates

- `Session` can be dropped.
- Empty legacy activity/task tables can likely be archived.
- Generated PDFs can be regenerated if source data is complete, but keeping existing `JobFile` assets is safer.
