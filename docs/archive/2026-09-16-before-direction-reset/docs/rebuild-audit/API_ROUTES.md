# API Route Inventory

Mounted routes come from `backend/src/server.ts`. All protected route groups use `requireAuth` except health, auth login/logout, and public share/onboarding/selects routes.

## Mounted Route Groups

- `/api/health`
- `/api/auth`
- `/api/public/options`
- `/api/public/supplier-onboarding`
- `/api/public/selects`
- `/api/email/oauth/google/callback`
- `/api/dashboard`
- `/api/opportunities`
- `/api/productions`
- `/api/budgets`
- `/api/contacts`
- `/api/companies`
- `/api/files`
- `/api/email`
- `/api/receipts`
- `/api/calendar`
- `/api/project-actions`
- `/api/settings`
- `/api/options`

## Active Route Summary

- Auth: login, logout, current user.
- Dashboard: summary dashboard.
- Opportunities: list, overdue, stage counts, detail, create, update, stage change, delete, notes, tasks.
- Productions: list/detail/create/update/status/delete, dates, crew, crew itineraries, itinerary items/files/appendix pages, itinerary PDF exports, production notes/tasks.
- Budgets: production/opportunity lookup, revisions, sections, lines, subcosts, purchase orders, PO PDF/send/parse/convert, advances, templates.
- Contacts/companies: CRUD and relationship detail.
- Files: production tree, upload, all files, storage info, download, preview, update, delete.
- Email: accounts, IMAP tests, Google OAuth, threads, drafts, draft attachments, thread state/category/linking, create opportunity from thread, send/reply, attachments, templates, signature, unread count, search, health.
- Receipts: capture, parse, list/detail/file, update, assign, delete.
- Calendar: events, today/upcoming, linked target, create/update/delete, sync.
- Project actions: workstreams, actions, email-message action creation.
- Options: blackbook, places, addresses, lists, option matrix, workstreams, groups, requirements, dates, columns, views, candidates, candidate photos/PDF/maps, deck templates, simple board categories/options/photos/export.
- Public options: candidate PDF by token.
- Public supplier onboarding: form read/submit by token.
- Public selects: share link, event stream, unlock, selections, ratings, annotations, submit, retouch versions, previews/downloads, retouch package, zip download.
- Settings: settings read, password/email update, crew roles, blackbook config categories/types.

## Unmounted Route Files

- `backend/src/routes/catalog.ts` defines `GET /`, but is not mounted in `server.ts`.
- `backend/src/routes/selects.ts` defines the authenticated stills/selects API, but is not mounted in `server.ts` in the audited runtime. Frontend references suggest this may be expected functionality and needs human clarification.

## Complete Route Extraction

The integration-config backup contains `inventory/oauth-callback-route-inventory.md`. For migration, regenerate the route list from source with:

```bash
rg -n 'router\\.(get|post|patch|put|delete)' backend/src/routes backend/src/server.ts
```
