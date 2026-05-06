# Phase 1 Handover — Production Management System

## What was built

### Backend (`/backend`)
- Node.js + Express + TypeScript (`ts-node-dev` for dev)
- Prisma ORM with PostgreSQL — all models use `pms_` table prefix (legacy tables untouched)
- **Session-based auth** via `express-session` + `connect-pg-simple` (sessions in `pms_sessions` table)
- Single-user credentials stored in `pms_settings` table; seeds `admin@example.com / admin` on first boot
- `requireAuth` middleware applied to all `/api/*` routes except `/api/auth`
- Routes: auth, dashboard, opportunities, productions, budgets, contacts, companies, files, email, settings

### Frontend (`/frontend`)
- React + TypeScript + Vite + Tailwind CSS v4 (uses `@tailwindcss/vite` plugin, no `tailwind.config.js`)
- **AppLayout**: dark `bg-gray-900` sidebar, **52px wide, icons only**, on desktop (`md:`); bottom nav with "More" drawer on mobile
- Navigation items: Dashboard, Email, Opportunities, Productions, Budgets, Contacts, Files, Settings
- **AuthContext** with session-based auth; `ProtectedRoute` redirects to `/login`
- Placeholder pages for all 8 modules (title + coming-soon message)
- Dashboard shows live counts from API
- Settings page has working change-password form

### Infrastructure
- Nginx at `https://agent.unlimited.bond` proxies `/api/` to `localhost:3000`, serves static files from `/var/www/agent`
- Session cookies work because backend has `app.set("trust proxy", 1)` + Nginx sets `X-Forwarded-Proto: https`
- Production build deployed to `/var/www/agent`

## Key decisions

1. **`pms_` table prefix** — avoids conflicts with existing legacy tables in the `production_mgmt` PostgreSQL database
2. **Session auth over JWT** — single-user system makes session-based auth the right choice; stored in PostgreSQL via connect-pg-simple
3. **Tailwind v4** — installed as `@tailwindcss/vite` Vite plugin, CSS uses `@import "tailwindcss"` instead of directives
4. **`trust proxy: 1`** — required for `secure` session cookies to work behind Nginx HTTPS proxy
5. **`DATABASE_URL` strip `?schema=public`** in Pool constructor — Prisma accepts it but `pg.Pool` does not

## What's left (Phase 2+)

Each module needs real CRUD UI:
1. **Opportunities** — Kanban/list, create/edit forms, status pipeline
2. **Productions** — List + detail view, dates, crew management
3. **Budgets** — Sections, line items, invoice tracking, totals
4. **Contacts** — Contact list, company associations, search
5. **Files** — File upload/download (needs S3 integration)
6. **Email** — Gmail OAuth integration, thread display
7. **Settings** — Email change, additional config

## Next step

Start with Productions list and detail view — it is the core entity that everything connects to (crew, budgets, files, email threads). Pattern: list page with status badges, detail page with tabs for Dates/Crew/Budget/Files.

## Running locally

```bash
# Backend (port 3000)
cd backend && npm run dev

# Frontend dev server (port 5173, proxies /api to 3000)
cd frontend && npm run dev
```

## Deploying

```bash
cd frontend && npm run build && cp -r dist/* /var/www/agent/
```
