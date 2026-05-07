# unlimited.bond — Claude Code Instructions

## Project
Production management web app for unlimited.bond.
Full brief is in BRIEF.md — read it before doing anything.

## Stack
- Node.js + Express backend (TypeScript)
- PostgreSQL database via Prisma ORM
- React frontend (mobile-first, TypeScript)
- ImapFlow for IMAP, Nodemailer for SMTP
- Claude API for receipt parsing
- FreeAgent API integration

## Database
- PostgreSQL running locally on VPS
- Use Prisma ORM for all database access
- Schema defined in /backend/prisma/schema.prisma
- All schema changes via Prisma migrations (npx prisma migrate dev)
- Never write raw SQL migrations manually
- Use Prisma Client for all queries throughout the codebase

## Code style
- TypeScript throughout — no plain JS files
- Use async/await, no callbacks
- All API routes under /api/
- Mobile-first CSS, minimum 44px tap targets
- Error handling on every async operation
- Comment any non-obvious logic

## Project structure
- /backend — Express API, Prisma, file storage
- /frontend — React app
- /backend/storage/jobs/ — per-job file system

## Key decisions already made
- Single user auth (Conor), session-based
- Job codes: YYNN format, resets January each year
- Two budget views: internal and client-facing
- AICP section structure for budgets (see brief)
- File storage: local VPS filesystem under /backend/storage/jobs/
- Prisma already installed and configured on VPS

## Environment
- VPS connected via VS Code Remote SSH
- Restore .env variables from saved copy before running
- Phase 6 email variables live in `/backend/.env`:
  - `EMAIL_ENCRYPTION_KEY` — exactly 32 characters for AES-256 token/password encryption
  - `GOOGLE_CLIENT_ID` — Google Cloud OAuth2 client ID
  - `GOOGLE_CLIENT_SECRET` — Google Cloud OAuth2 client secret
  - `GOOGLE_REDIRECT_URI` — `https://agent.unlimited.bond/api/email/oauth/google/callback`
  - `EMAIL_SYNC_DAYS` — number of recent days to search when syncing email, default `7`
  - `EMAIL_SYNC_LIMIT` — maximum number of recent messages to fetch per sync, default `200`
- Gmail OAuth endpoints must return `{ error: "Google OAuth not configured" }` when Google credentials are blank. IMAP/SMTP password accounts must still work without Google credentials.

## When context is running low
Write a handover note to /HANDOVER.md covering:
- What was built this session
- Key decisions made
- Current state of the codebase
- Exact next step for the next session
Then stop.
