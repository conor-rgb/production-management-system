# 16 September 2026 — new project estimates and Drive workflow

Status: deployed and live-verified at 2026-09-16T13:48:53.769Z. User authorised substantial rework and continued deployment, with new projects preferred over migration.

Scope: [new project workflow](../production-hub/NEW-PROJECT-WORKFLOW.md). Starter estimates, separate client/planned supplier pricing, atomic versioned edits, immutable recorded approvals, planned-cost handoff, mapped automatic Drive setup and invoice-folder review. Existing projects and historical financial records remain intact.

Validation: backend/frontend builds; isolated actual migration/backfill and financial/Drive tests; browser create → estimate → approval → live costs → Drive invoice review; desktop/mobile rendering; client PDF privacy. Final checks, backup details and live deployment evidence will be appended below.

Limits: no automatic PO linkage, client receivables, credit notes, FX or formal financial close. Drive files inherit folder sharing. Tests use mocked Google and isolated schemas; they do not constitute a live project publishing acceptance test.

## Deployment evidence

- Release: `20260916T134425Z`. Initial publication at 13:46:49 UTC; final frontend update at 2026-09-16T13:48:53.769Z fixes restored email drafts covering project forms. Saved drafts remain available and only expand on request.
- Source: 201 files, SHA-256 `744e89d6cae8b0be2889fe5f80949a0add3414dfe4f1c12fd42bfe3454f5df35`; [source manifest](2026-09-16-workspace-source-manifest.json). The initial publication manifest is retained in the private backup.
- Applied only `20260916150000_new_project_workflow`; all 74 migrations applied. Migration uses a transaction and a database default for new stable line keys, allowing older app processes to insert during rollout/rollback. Existing keys were backfilled from line IDs.
- Backup: `/srv/backups/production-management-system/20260916T134425Z-new-project-workflow`. Verified custom-format DB dump; exact prior served frontend; private environment/nginx; working source/disk build snapshot. Test schemas excluded. Existing local storage retained in place, not copied. The pre-release disk build is not necessarily the old PM2-loaded JavaScript; prior release snapshots remain available.
- PM2 reloaded and local/public health passed. An immediate health request arrived before restart finished; retry passed before frontend publication. Old hashed assets retained; entry point replaced atomically.
- [Live checks](2026-09-16-workspace-live-check.json): Home, Finance, Files, Drive connected, new-project wizard, quiet draft restoration, existing pilot costs/invoices/reconcile and mobile layout; zero runtime errors. Unauthenticated workspace/finance/Drive routes return 401. Temporary smoke session removed.
- Read-only post-release counts: 9 existing projects; 0 new workspaces, approval snapshots or supplier invoices. No live project, finance transaction or Google Drive folder/file was created for tests.

## Validation detail

Backend and frontend builds, Prisma validation/status, nginx validation, full frontend lint (zero errors; the existing SelectsPortal hook warning remains), clean targeted lint, and documentation inventory/link/archive checks passed. Isolated suites: new-project workflow, finance regression, Drive integration, Drive error handling/session cookie, workspace interaction smoke and Drive browser smoke. Browser workflow additionally checks spreadsheet paste/undo and importing a Drive document into an invoice draft.

The live wizard and existing-project routes are verified without submission. A real new-project folder/approved budget/invoice acceptance run remains the next operational step; mocked Google tests do not claim this has happened.
