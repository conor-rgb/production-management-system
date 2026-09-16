# Current migration and release risks

Updated 16 September 2026. The [original audit](../archive/2026-09-16-before-direction-reset/docs/rebuild-audit/MIGRATION_RISKS.md) is historical; its suggestions to drop sessions/empty tables are superseded.

- Preserve production IDs, share tokens, JobFile/local asset links and manual workbook-only records. No mass rekey, dedupe or table deletion is authorised by this direction reset.
- Approved estimates and live subcost/invoice/payment fields remain coupled in the existing model. Financial migration must separate them without duplicating commitments or losing evidence.
- Drive connection, deployment and verified publication are separate states. Project identity must be matched by exact folder ID, not similar names. Destination permissions govern audience.
- Protect local staging and unmigrated assets; a DB/config/code release backup alone is not full asset disaster recovery.
- GMAIL_RESYNC_CLEANUP is a destructive startup path; keep it disabled. Preserve sessions and account credentials during an in-place deployment.
- Calendar/email workers restart with the API; verify them without sending test messages or creating duplicate calendar events.
- Git HEAD predates many current working-tree features. Deploy the reviewed working snapshot and record hashes; do not reset to origin or claim a commit alone identifies the release.
- Use a reviewed additive migration, backup and rollback plan. If data migration is needed later, dry-run mappings, reconcile one completed and one live pilot, retain exception reports and then retire duplicate ownership.
