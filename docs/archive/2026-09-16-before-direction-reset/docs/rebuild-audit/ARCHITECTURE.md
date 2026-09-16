# Legacy Architecture

Audit date: 2026-07-31. This is a read-only rebuild audit; no secret values are included.

## Runtime Shape

- Frontend: React/Vite app in `frontend`, built to static assets and served by nginx from `/var/www/agent`.
- Backend: Express/TypeScript API in `backend`, compiled to `backend/dist/index.js`.
- Process manager: PM2 process `production-management-api`, running `node /srv/production-management-system/backend/dist/index.js` from `backend`.
- Database: PostgreSQL through Prisma. Prisma uses `DATABASE_URL`; Express session storage strips Prisma-only query parameters and uses table `pms_sessions`.
- Reverse proxy: nginx terminates TLS for `agent.unlimited.bond`, serves static frontend, and proxies `/api/` and `/socket.io/` to `127.0.0.1:3000`.
- Local file storage: `backend/storage`, mostly job files, selects, mail attachments, draft attachments, and pending receipts.

## Backend Modules

- `src/server.ts`: Express app, middleware, session store, route mounts, health endpoint.
- `src/index.ts`: production config checks, seed routines, server start, email sync startup, calendar sync startup.
- `src/routes/*`: API modules for auth, opportunities, productions, budgets, contacts, companies, files, email, receipts, calendar, project actions, settings, options, public options, public supplier onboarding, and public selects.
- `src/services/*`: domain logic for budgets, PDFs, email, Gmail, Google Calendar, Google Places/Maps, receipt parsing, travel parsing, file storage, supplier onboarding, selects, and encryption.

## Background Processes

- Startup seeds: crew roles, budget section templates, email templates; optional non-production admin seed.
- Gmail sync: initial full sync for Google accounts, then incremental sync every 2 minutes.
- IMAP sync: IDLE sync for non-Google accounts.
- Calendar sync: production dates and opportunity follow-ups pushed to calendar; Google Calendar pull sync every 5 minutes.
- Frontend polling: unread email and dashboard widgets poll on intervals.

## Read-Only Constraints For Rebuild

- Do not run `GMAIL_RESYNC_CLEANUP=true`; that code deletes email rows and appends to `.env`.
- Do not call API routes with write verbs during audit.
- Do not run Prisma migrations or `db:push`.
- Treat local storage paths and `JobFile` metadata as a coupled dataset.
