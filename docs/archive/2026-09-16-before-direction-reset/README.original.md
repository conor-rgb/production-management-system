# Production Management System

A private production management platform for unlimited.bond, covering opportunities, productions, budgets, email, calendar, files, options, selects, and supplier onboarding.

## Stack

- Backend: Node.js, Express, TypeScript, Prisma, PostgreSQL
- Frontend: React, TypeScript, Vite
- Storage: local filesystem under `backend/storage`
- Integrations: Gmail/Google Calendar, Google Maps/Places, Anthropic receipt parsing

## Local Setup

Backend:

```sh
cd backend
npm ci
cp .env.example .env
npm run db:generate
npm run build
npm run dev
```

Frontend:

```sh
cd frontend
npm ci
npm run dev
```

The API defaults to `http://localhost:3000`, and the frontend dev server defaults to `http://localhost:5173`.

## Validation

```sh
cd backend && npx prisma validate && npm run build
cd frontend && npm run lint && npm run build
```

## Deployment Notes

- Use `NODE_ENV=production`.
- Set a strong `SESSION_SECRET`; the server refuses to start in production without one.
- Run migrations with `npx prisma migrate deploy`.
- Keep `backend/storage` and PostgreSQL data backed up.
- Do not commit `.env`, uploaded files, generated PDFs, or local import spreadsheets.
