# Workspace cleanup — implementation history

The initial cleanup added Home, Actions, command search and project Overview while retaining the existing production tools. Actions support inline edits, keyboard use, filtering, selection, bulk updates, title paste, failure rollback, one-operation undo and a notes drawer. It did not migrate the platform or financial model.

The 16 September follow-up adds Finance navigation, slim project reads and Drive integration. Current primary navigation is Home · Projects · People · Finance · Files & exports; Actions remains accessible. See [the implementation guide](production-hub/DRIVE-IMPLEMENTATION.md) and [release record](releases/2026-09-16-production-hub.md).

The original proposal's Next.js/Supabase migration is no longer the active plan. Retain React/Vite/Express/Prisma/Postgres; use session auth and app-owned Google Drive authorisation. Per-project staff permissions and the independent financial ledger are still future work.

Existing limitations remain: action history shows latest updates rather than an immutable audit trail; bulk changes are individual requests; undo is local to the previous successful edit; title paste updates existing visible rows. Do not represent these as transactional spreadsheet editing.

Regression check: `node scripts/tests/workspace-smoke.cjs` with Vite on port 5175. It uses fixtures and does not touch live Sheets or business records. The [original document](archive/2026-09-16-before-direction-reset/docs/v1-cleanup.md) is preserved.
