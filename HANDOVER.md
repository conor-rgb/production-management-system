# Phase 6 Handover — Email Client

## Built This Session

### Environment And Dependencies
- Added Phase 6 email dependencies:
  - `imapflow`
  - `nodemailer`
  - `mailparser`
  - `@types/nodemailer`
  - `@types/mailparser`
  - `node-cron`
  - frontend `dompurify`
  - frontend `@types/dompurify`
- Added `/backend/.env` values on the VPS:
  - `EMAIL_ENCRYPTION_KEY` with a 32-character AES key
  - `GOOGLE_CLIENT_ID`
  - `GOOGLE_CLIENT_SECRET`
  - `GOOGLE_REDIRECT_URI=https://agent.unlimited.bond/api/email/oauth/google/callback`
- Updated `CLAUDE.md` to document the email environment variables and the requirement that Gmail OAuth routes return a clear JSON error when Google credentials are blank.

### Schema And Migration
- Added migration `20260506220000_phase6_email_client`.
- Baselined the already-present Phase 1-5 migrations in `_prisma_migrations`, because the production database had the tables but not Prisma migration bookkeeping.
- Added `EmailProvider` enum:
  - `GOOGLE`
  - `IMAP`
- Added `EmailAccount`.
- Replaced the old placeholder `EmailThread` / `EmailMessage` fields with Phase 6 thread/message fields.
- Added `EmailTemplate`.
- Added `Settings.defaultEmailSignature`.
- Added `EmailThread` relations to `Contact`, `Opportunity`, and `Production`.
- Made `EmailThread.accountId` nullable with `onDelete: SetNull` so deleting an account keeps synced threads/messages, matching the Phase 6 requirement.

### Backend Services
- Added `backend/src/services/encryptionService.ts`.
  - AES-256-CBC encryption/decryption.
  - Validates `EMAIL_ENCRYPTION_KEY` is exactly 32 characters when encryption/decryption is used.
  - Passwords and OAuth tokens are encrypted before storage.
- Added `backend/src/services/emailService.ts`.
  - `getImapClient(account)`
  - `getSmtpTransporter(account)`
  - Google token refresh path.
  - `syncAccount(accountId)` using ImapFlow and mailparser.
  - Thread upsert by provider thread key.
  - Message upsert by external message id.
  - `smartLinkThread(threadId)` by matching participant email addresses against Contacts.
  - IMAP IDLE start/stop with reconnect timer.
  - `sendEmail(options)` using Nodemailer.
  - `getThreads(options)` and `getThread(threadId)`.
- Sync skips individual parse failures and continues.
- Decrypted credentials are not logged.

### Backend API
- Replaced the placeholder `/api/email` routes with Phase 6 routes:
  - `GET /api/email/accounts`
  - `POST /api/email/accounts`
  - `PATCH /api/email/accounts/:accountId`
  - `DELETE /api/email/accounts/:accountId`
  - `POST /api/email/accounts/:accountId/sync`
  - `POST /api/email/accounts/:accountId/test`
  - `POST /api/email/test-imap`
  - `GET /api/email/oauth/google/start`
  - `GET /api/email/oauth/google/callback`
  - `GET /api/email/threads`
  - `GET /api/email/threads/:threadId`
  - `PATCH /api/email/threads/:threadId/read`
  - `PATCH /api/email/threads/:threadId/flag`
  - `PATCH /api/email/threads/:threadId/archive`
  - `PATCH /api/email/threads/:threadId/link`
  - `PATCH /api/email/threads/:threadId/unlink`
  - `POST /api/email/send`
  - `POST /api/email/threads/:threadId/reply`
  - `GET /api/email/messages/:messageId/attachment/:index`
  - `GET /api/email/templates`
  - `POST /api/email/templates`
  - `PATCH /api/email/templates/:id`
  - `DELETE /api/email/templates/:id`
  - `GET /api/email/signature`
  - `PATCH /api/email/signature`
  - `GET /api/email/unread-count`
  - `GET /api/email/health`
- Gmail OAuth start/callback return `{ error: "Google OAuth not configured" }` with `503` when credentials are blank.
- Account responses redact encrypted password/token fields.
- IMAP account save tests the connection before keeping the account.
- All routes are mounted behind existing session auth middleware.

### App Startup
- `backend/src/index.ts` now:
  - seeds default email templates when `EmailTemplate` is empty
  - starts IDLE sync for active email accounts after server startup
- Seeded templates:
  - Quote follow-up
  - Shoot confirmation
  - PPM invite
  - Wrap notification
  - Invoice chase

### Frontend Email Client
- Replaced the placeholder Email page with a working full-screen email client.
- Desktop layout:
  - dark 200px account/folder sidebar
  - 320px thread list
  - flexible thread detail pane
- Mobile layout:
  - thread list first
  - thread detail full-screen on selection
  - floating compose button
- Thread list includes search, All/Unread/Flagged filters, linked entity pill, unread dot, active row state, and message previews.
- Thread detail includes:
  - subject header
  - linked entity indicator
  - participant initials
  - message cards rendered with DOMPurify sanitisation
  - attachment metadata rows
  - reply entry point
- Composer modal/bottom sheet includes:
  - From account
  - To/CC/BCC fields
  - template selector
  - subject
  - simple rich-text-style toolbar placeholder
  - body editor
  - signature preview
  - attachment chip display for generated estimate PDFs
- Reply composer posts to `/api/email/threads/:threadId/reply`.

### Email Settings
- Added an Email section to Settings:
  - Connected accounts list with provider badge, status dot, last synced, set primary, sync, and remove.
  - Connect Gmail button using OAuth start endpoint.
  - Connect IMAP form with connection test before save.
  - Signature editor and preview.
  - Template list and create/delete form.

### Comms Integration
- Production Comms tab now includes linked email thread cards in the unified timeline.
- Opportunity Comms tab now includes linked email thread cards in the unified timeline.
- Both Comms tabs include a Link email search flow.
- Email thread cards navigate to `/email?thread=<threadId>`.
- Email cards include unread dot, preview, timestamp, and unlink action.

### Budget Email Estimate Integration
- The full-screen budget “Email estimate” action now:
  - exports the client PDF
  - saves the PDF to the production `Estimates/` folder through the existing PDF/file hook
  - creates a local email draft payload
  - opens `/email?compose=draft`
  - pre-fills subject/body/link context and shows the generated PDF as an attachment chip

### Dashboard And Navigation
- Sidebar Email nav item polls `/api/email/unread-count` every 60 seconds and shows a badge when unread count is non-zero.
- Dashboard now has an “Unread email” metric card that polls every 60 seconds and opens the Email screen.

## Verification
- Prisma schema validated.
- Migration deployed with `npx prisma migrate deploy`.
- Prisma Client regenerated.
- Backend build passes: `npm run build`.
- Frontend build passes: `npm run build`.
- Frontend bundle deployed to `/var/www/agent`.
- API reloaded with `pm2 reload production-management-api --update-env`.
- API health check passes at `http://localhost:3000/api/health`.
- Default email template seed verified in PostgreSQL: 5 templates.

## Current Module State

### Dashboard
- Existing agenda, opportunities, productions, and follow-up widgets remain.
- Email unread metric is now present and navigates to Email.

### Email
- Backend account storage, encryption, IMAP sync, SMTP send, thread APIs, templates, signature, unread count, and health endpoints exist.
- Frontend Email screen is usable for connected accounts, thread browsing, reading, compose, and replies.
- Gmail OAuth is scaffolded and safely reports unconfigured state until real Google credentials are provided.
- IMAP username/password accounts can be configured independently of Google credentials.

### Opportunities
- Opportunity CRUD and Won flow remain.
- Opportunity Comms timeline now includes linked email threads.
- Opportunity Budget email flow opens the email composer draft, but PDF export still depends on production PDF export support.

### Productions
- Production CRUD, dates, crew, files, budgets, and comms remain.
- Production Comms timeline now includes linked email threads.
- Production budget email estimate flow generates a PDF and opens the email composer draft.

### Budgets
- Phase 5 budget and PO stack remain.
- “Email estimate” now opens the Email composer with generated estimate context and attachment chip.

### Files
- Phase 4 file storage remains.
- Budget PDFs continue auto-filing to `Estimates/`.
- Email attachment “Save to job” UI is visible but not fully wired to stream IMAP attachment content into the file system yet.

### Settings
- Existing account, crew roles, storage, and item catalog settings remain.
- Email accounts, signature, and templates are now managed in Settings.

## Decisions
- Used Prisma enum values `GOOGLE` and `IMAP` to match existing uppercase enum style.
- Kept synced email threads/messages when an account is deleted by making `EmailThread.accountId` nullable and using `onDelete: SetNull`.
- Kept IMAP attachment download as a clear `501` route for now because raw MIME bodies are not stored locally and the current schema only stores attachment metadata. Full on-demand IMAP attachment fetch needs provider UID/mailbox tracking in Phase 6 hardening or Phase 7/9 polish.
- Composer attachment chips for budget PDFs currently show generated file metadata; actual SMTP binary attachment from a `JobFile` still needs a send-time file-loading path.
- Email HTML rendering uses DOMPurify rather than iframes to keep the implementation lightweight and safe.
- Used local storage for the budget-to-email draft handoff so the Budget view can open the Email route without adding global state.

## Known Issues And Technical Debt
- Gmail OAuth has not been tested with real Google credentials; credentials are currently blank.
- IMAP/SMTP live connection has not been tested against a real mailbox in this session.
- `GET /api/email/messages/:messageId/attachment/:index` returns `501` until raw message UID/mailbox storage is added.
- Composer rich text controls are visual placeholders; the body is currently a textarea accepting HTML/plain text.
- Contact autocomplete in composer is not implemented yet.
- Attach-from-job in composer is not implemented yet.
- Save email attachment to job is UI-only until attachment streaming is implemented.
- Sent budget estimate emails show the generated PDF as an attachment chip before send, but the backend `sendEmail` route does not yet load `JobFile` binary content into Nodemailer attachments.
- Opportunity budget PDF email export still needs an opportunity/bid PDF path; current PDF export service requires a production budget.
- IMAP seen/flag/archive state updates are currently database-only; provider flag writes are still to do.
- Browser automation tooling is not installed, so I did not run Playwright screenshots at 390px. TypeScript builds passed and mobile layouts were implemented responsively.
- Existing unrelated worktree changes remain untouched: deleted repo metadata/docs files and untracked `BRIEF.md`.

## Commits This Phase
- `feat: add email schema and dependencies`
- `feat: add email services and API routes`
- `feat: add email client UI and settings`
- `feat: show linked email threads in comms timelines`
- `feat: open email composer from budget estimate`

## Exact Next Step For Phase 7

Start Phase 7 with Receipt Capture:
1. Build the Dashboard receipt capture widget for camera/upload/drag-drop.
2. Save captured receipt files into the selected production `Receipts/` folder.
3. Add Claude API receipt parsing for vendor, amount, date, and suggested budget line.
4. Build the confirmation/assignment UI to attach a receipt to a production and budget line.
5. Create a `LineItemInvoice` with status `PAID` when a receipt is assigned.
6. Update the relevant budget financial stack immediately after assignment.
7. Add offline/mobile-friendly capture queue behavior if time allows.
