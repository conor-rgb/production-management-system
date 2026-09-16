# V1 workspace cleanup

This change aligns the existing application’s main entry points with the Unlimited.Bond proposal. It is an incremental interface change, not a completed platform migration.

## Delivered

- Restrained Home with real outstanding actions and active projects; no seeded example projects in production data.
- Home, Projects, Actions, People and Files as the main navigation; existing specialist tools retained.
- Project links honour the requested module. Overview is the default; the existing workbook is explicitly accessible from the header.
- Project Overview presents stage, next date, confirmed crew, next actions and recent action updates. Existing financial and project settings remain below a disclosure.
- Global and per-project Actions use the same database records and existing mutation routes. Inline title/status edits, keyboard focus and Enter/Escape, filtering, sorting, selection, bulk status updates, multi-row title paste, title-column resizing, date-column visibility, frozen title column, optimistic updates with failure rollback, one-operation undo and a modal notes drawer.
- Cmd/Ctrl+K searches projects and navigation. This is an honest search foundation, not an AI integration.
- Existing receipt capture and reporting remain at `/receipts`.

## Architecture still required by the proposal

The current stack remains React/Vite, Express, Prisma and PostgreSQL, session/password authentication, and existing local file storage. Next.js, Supabase/RLS, Google OAuth sign-in, canonical Google Drive storage, configurable phases/casting statuses, dedicated casting views and OpenAI structured tools are not implemented in this cleanup. The existing casting/options and People records are retained, not migrated or duplicated.

A migration must preserve existing production IDs, project relationships, uploaded assets and shared links. Map and backfill those records before switching storage/authentication. Future Drive records should store file/folder IDs and metadata, with no asset binaries in PostgreSQL. AI changes should be proposed as typed, auditable operations with explicit acceptance, not direct unreviewed writes.

## Limits

- Action history shows each record’s latest update, not an audit log.
- Multi-row paste accepts one title per line and updates existing visible rows only. It rejects extra columns, blank titles and overflow before saving.
- Bulk saves are individual requests. Successful rows are retained; failed rows are restored. Undo applies to successful rows from the previous edit operation during the current visit.
- The current single-team authorization model remains. No claim of per-project access isolation is made.

## Validation

Frontend production build and backend TypeScript build passed. Frontend lint has no errors; its existing SelectsPortal hook dependency warning remains. `scripts/tests/workspace-smoke.cjs` uses Playwright and intercepted fixture APIs to verify Home, inline edits, undo, failed-save rollback, bulk statuses, multi-row title paste, notes, creation, reload, project navigation and mobile command search. This does not verify a live database or Google integrations.

Run the browser check with the frontend on port 5175:

```sh
npm run dev --prefix frontend -- --host 127.0.0.1 --port 5175
# In a second terminal (install the Playwright Chromium browser first if needed):
node scripts/tests/workspace-smoke.cjs
```
