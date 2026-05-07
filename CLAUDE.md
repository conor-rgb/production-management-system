# unlimited.bond — Claude Code Instructions

## Project overview
Production management web app for unlimited.bond (registered: BOND UN LIMITED).
Full product brief is in BRIEF.md — read it fully before starting any session.
This is a single-user app for Conor, running on a VPS at agent.unlimited.bond.

## Server and deployment
- VPS: Linux/Ubuntu, connected via VS Code Remote SSH
- App runs under PM2, process ID 0
- Restart after any backend change: `pm2 reload 0`
- Frontend build output goes to: `/var/www/agent`
- After every frontend build: `cp -r /srv/production-management-system/frontend/dist/* /var/www/agent/`
- Health check: `curl http://localhost:3000/api/health`

## Tech stack
- Backend: Node.js + Express + TypeScript
- Database: PostgreSQL via Prisma ORM
- Frontend: React + TypeScript + Vite
- Email IMAP: ImapFlow
- Email SMTP: Nodemailer
- Email parsing: mailparser
- Receipt parsing: Claude API (Anthropic)
- Accounting: FreeAgent API
- File storage: local VPS filesystem

## Project structure
/srv/production-management-system/
├── backend/
│   ├── src/
│   │   ├── routes/        # Express API routes
│   │   ├── services/      # Business logic
│   │   └── index.ts       # App entry point
│   ├── prisma/
│   │   └── schema.prisma  # Database schema
│   ├── storage/
│   │   └── jobs/          # Per-job file storage
│   ├── dist/              # Compiled TypeScript output
│   └── .env               # Environment variables
└── frontend/
└── src/               # React app

## Database
- Engine: PostgreSQL
- Database name: `production_mgmt`
- User: `prod_mgmt`
- Connection string: stored in `/backend/.env` as `DATABASE_URL`
- ORM: Prisma — all queries use Prisma Client, never raw SQL
- All table names use `pms_` prefix (e.g. `pms_email_accounts`, `pms_productions`)
- Schema file: `/backend/prisma/schema.prisma`

### Prisma migrations — CRITICAL
- `npx prisma migrate dev` does NOT work on this VPS — it is non-interactive and will hang
- Always use this two-step process for schema changes:
  1. Update `schema.prisma`
  2. Generate migration: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/TIMESTAMP_description/migration.sql`
  3. Apply migration: `npx prisma migrate deploy`
  4. Regenerate client: `npx prisma generate`
- Never use `npx prisma migrate dev` on this server under any circumstances

## Building and running

### Backend
```bash
cd /srv/production-management-system/backend
npm run build        # Compile TypeScript
pm2 reload 0         # Restart the running process
pm2 logs 0 --lines 50  # Check for errors
```

### Frontend
```bash
cd /srv/production-management-system/frontend
npm run build
cp -r dist/* /var/www/agent/
```

### Both in one go
```bash
cd /srv/production-management-system/backend && npm run build && pm2 reload 0 && cd ../frontend && npm run build && cp -r dist/* /var/www/agent/
```

## Code standards
- TypeScript throughout — no plain JS files, no `any` types
- `async/await` everywhere — no callbacks, no `.then()` chains
- All API routes under `/api/`
- Mobile-first CSS — minimum 44px tap targets on all interactive elements
- Error handling on every async operation — never let errors fail silently
- Comment non-obvious logic

## Key architectural decisions
- Single user auth — session-based login, Conor only
- Job code format: YYNN (e.g. 2647) — resets to 01 each January
- Budget system: two views — internal (shows costs and margin) and client-facing (shows rates only)
- Budget sections follow AICP standard (A through P)
- File storage: local VPS filesystem at `/backend/storage/jobs/`
- Budget mode: opportunity budgets = bidding mode (shows margin), production budgets = production mode (shows accrual/PO/remaining)

## Environment variables
All in `/backend/.env`. Never log or expose these values.
DATABASE_URL                    # PostgreSQL connection string
SESSION_SECRET                  # Session cookie signing key
EMAIL_ENCRYPTION_KEY            # Exactly 32 characters — AES-256 for token encryption
GOOGLE_CLIENT_ID                # Google Cloud OAuth2 client ID
GOOGLE_CLIENT_SECRET            # Google Cloud OAuth2 client secret
GOOGLE_REDIRECT_URI             # https://agent.unlimited.bond/api/email/oauth/google/callback
EMAIL_SYNC_DAYS                 # Days of email to sync (default: 7)
EMAIL_SYNC_LIMIT                # Max messages per sync (default: 200)
ANTHROPIC_API_KEY               # Claude API for receipt parsing
FREEAGENT_CLIENT_ID             # FreeAgent OAuth client ID
FREEAGENT_CLIENT_SECRET         # FreeAgent OAuth client secret
PORT                            # Server port (default: 3000)
NODE_ENV                        # development or production

## Email system
- IMAP library: ImapFlow only
- SMTP library: Nodemailer only
- Parsing: mailparser only
- All OAuth tokens and passwords encrypted with AES-256 before storing
- Never store or log decrypted credentials
- Gmail OAuth routes return `{ error: "Google OAuth not configured" }` with 503 when Google credentials are missing — never crash
- IMAP/SMTP password accounts work independently of Google credentials
- Sync uses `EMAIL_SYNC_DAYS` and `EMAIL_SYNC_LIMIT` from .env
- Log prefixes: `[SYNC]`, `[IMAP]`, `[TOKEN]`, `[OAUTH]` for all email log lines

## Company details (used in PDFs and signatures)
- Trading name: unlimited.bond
- Registered entity: BOND UN LIMITED
- VAT number: GB 493336372
- Company number: 16215041
- Address: 128 City Road, London EC1V 2NX
- Job code sequence: YYNN format, next code stored in Settings table, resets each January

## FreeAgent integration
- All figures ex-VAT — VAT applied at invoice stage in FreeAgent
- VAT number GB 493336372 pre-filled on all FreeAgent records

## When context is running low
Before stopping, write a complete handover note to `/HANDOVER.md` covering:
1. Exactly what was built this session
2. All key decisions made and why
3. Current state of every module touched
4. Any issues, bugs, or technical debt
5. The exact next step — specific enough that a new session can start immediately without re-reading everything

Then stop. Do not start new work after writing the handover.
