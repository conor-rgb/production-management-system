# Phase 6 Handover — Email Client

## Built This Session

## Phase 7 — Receipt Capture — 2026-05-07

### PDF Receipt Parsing Fix
- Fixed PDF receipt parsing in `backend/src/services/receiptParser.ts`.
- PDFs now go to Anthropic as a `document` content block with `media_type: application/pdf`.
- Images still go through the existing `image` content block.
- The parser now shares one receipt prompt and one JSON response parser across PDF and image inputs.
- Backend TypeScript build passes after the change.
- Direct parser smoke test passed using a generated PDF invoice:
  - vendor: `Acme Taxi Ltd`
  - amount: `2450` pence
  - date: `2026-05-07`
  - suggested section: `D` / `Location & Travel`

### Built
- Added backend receipt parsing infrastructure.
  - Installed `@anthropic-ai/sdk`.
  - Added `backend/src/services/receiptParser.ts`.
  - Uses Claude model `claude-opus-4-5` for image and PDF receipt parsing.
  - Extracts vendor, amount in pence, date, currency, description, suggested AICP section, confidence, and raw text.
  - If `ANTHROPIC_API_KEY` is missing, parsing fails gracefully with `API key not configured`.
  - PDF receipt parsing uses Claude's document content block with native `application/pdf` support instead of the image endpoint.
- Added receipt capture schema.
  - New `ReceiptCaptureStatus` enum.
  - New `ReceiptCapture` model mapped to `pms_receipt_captures`.
  - Relations added to Production, BudgetLineItem, and JobFile.
  - Stores pending file metadata, parsed Claude fields, assignment fields, offline/sync fields, and timestamps.
- Added receipt API at `/api/receipts`.
  - `POST /api/receipts/capture`
  - `POST /api/receipts/:captureId/parse`
  - `GET /api/receipts`
  - `GET /api/receipts/:captureId`
  - `GET /api/receipts/:captureId/file`
  - `PATCH /api/receipts/:captureId`
  - `PATCH /api/receipts/:captureId/assign`
  - `DELETE /api/receipts/:captureId`
- Receipt capture files are stored first under:
  - `/backend/storage/receipts/pending/`
- On assignment:
  - the file is moved to the production `Receipts/` folder
  - a `JobFile` is created with `isReceipt: true`
  - receipt vendor, amount, and date are copied onto the `JobFile`
  - a paid `LineItemInvoice` is created against the selected budget line
  - `syncProductionTotals()` is called for the production
- Added Dashboard receipt capture.
  - Desktop capture button beside the Dashboard title.
  - Desktop drag/drop upload zone above the dashboard widgets.
  - Mobile floating 56px camera button using `accept="image/*"` and `capture="environment"`.
  - Upload opens a right-side review panel on desktop and bottom-sheet style panel on mobile.
  - Review panel supports parsing, parsed, failed/manual, and assigned states.
  - Polls receipt status every 2 seconds while parsing.
  - User can edit vendor, amount, date, and AICP category before assignment.
  - User can search/select production and budget line.
  - Pending parsed/failed receipts show a Dashboard attention badge.
  - Offline upload fallback stores images as base64 in `localStorage` and retries when the browser comes back online.
- Updated Production Files receipt display.
  - Receipt files now use a receipt icon.
  - Receipt rows show parsed vendor and amount when available.
  - Receipt preview panel shows an `Assign to a budget line` hint when no budget line is linked.

### Verification
- Migration applied: `20260507120000_phase7_receipt_capture`.
- Prisma client regenerated.
- Backend build passes: `cd backend && npm run build`.
- PDF parser smoke test passes against the compiled parser with a generated PDF invoice.
- Frontend build passes: `cd frontend && npm run build`.
- Frontend bundle copied to `/var/www/agent`.
- API reloaded with `pm2 reload 0 --update-env`.
- API health check passes at `http://localhost:3000/api/health`.

### Known Gaps / Technical Debt
- PDF receipt parsing now uses Claude's native document API path. A browser upload of a real PDF invoice should be used as the final live smoke test after deployment.
- Receipt review panel currently lives on Dashboard. Opening a receipt file from Production Files shows receipt metadata in the file preview but does not open the full Dashboard review panel.
- Budget invoice rows were not rebuilt in this pass; receipt-created invoices are created and visible through existing invoice data, but a dedicated camera icon/modal inside the budget invoice stack still needs a UI pass.
- Offline queue uses localStorage and warns on files over 5MB; this is pragmatic for v1 but IndexedDB would be more robust for repeated large receipt captures.

## Exact Next Step For Phase 8

Start FreeAgent + Automations:
1. Add FreeAgent OAuth connection management in Settings.
2. Pull invoice status into Production records and Dashboard outstanding invoices.
3. Implement Wrapped production invoice prompt to create a FreeAgent invoice draft from budget totals.
4. Add weekly digest cron job.
5. Add remaining automation hardening for follow-ups, over-accrual/over-budget alerts, and email digest content.

## Unlinked Mail Attachments — 2026-05-07

### Fixed
- Email attachments no longer require a production link before filing.
- `JobFile.productionId` is now nullable.
  - Production files still behave as before when linked to a job.
  - Unlinked files are allowed only in the `Mail Attachments` folder.
- Added global disk storage for unlinked mail attachments:
  - `/backend/storage/mail-attachments/`
- Clicking an email attachment from an unlinked email thread now saves the raw file globally and opens the file preview.
- The master Files screen shows unlinked saved mail attachments under the `Mail Attachments` folder.
  - Rows display `Unlinked mail attachment` instead of a job code/client.
- Production Files tabs remain scoped to that production only.
- Preview/edit behavior was adjusted for unlinked files.
  - PDF/image/video previews work.
  - Notes can be edited.
  - Budget-line linking and moving folders are disabled until the file is linked to a production in a future files workflow.

### Verification
- Migration applied: `20260507110500_unlinked_mail_attachments`.
- Prisma client regenerated.
- Backend build passes: `cd backend && npm run build`.
- Frontend build passes: `cd frontend && npm run build`.
- Frontend bundle copied to `/var/www/agent`.
- API reloaded with `pm2 reload 0 --update-env`.
- API health check passes at `http://localhost:3000/api/health`.

## Email Thread Performance — 2026-05-07

### Fixed
- Thread detail loading is now paginated.
  - Opening a thread loads the latest 10 messages first.
  - Older messages are loaded in batches of 20 via `before=<sentAt>&limit=20`.
  - Thread responses now include `hasMoreOlder` and `totalMessageCount`.
- Added a `Load earlier messages` button at the top of long email threads.
- Reduced frontend render cost for long threads.
  - Collapsed messages no longer run DOMPurify, quote detection, or signature splitting.
  - Expensive HTML processing now runs only when a message is expanded.
  - Latest message still expands immediately.
- Added database index `pms_email_messages_threadId_sentAt_idx` to make per-thread chronological paging fast.

### Verification
- Migration applied: `20260507102000_email_message_thread_sent_index`.
- Prisma client regenerated.
- Backend build passes: `cd backend && npm run build`.
- Frontend build passes: `cd frontend && npm run build`.
- Frontend bundle copied to `/var/www/agent`.
- API reloaded with `pm2 reload 0 --update-env`.
- API health check passes at `http://localhost:3000/api/health`.

### Notes
- IMAP is still only used for sync and raw attachment retrieval. Opening a thread now uses Postgres only.
- A future optimisation would be storing precomputed sanitized/quote-stripped HTML per message, but this pass avoids that complexity by lazy-processing expanded messages only.

## Email Attachment Filing — Mail Attachments Folder — 2026-05-07

### Built
- Added `Mail Attachments` as a first-class job folder.
  - It is created alongside Briefs, Estimates, Budgets, Contracts, Crew Deals, Receipts, References, Selects, and Delivery whenever production folders are ensured.
  - It appears in the production Files tab folder list.
  - It appears in the global Files screen folder filter, giving a master view of all saved mail attachments across all productions.
- Added email-source metadata to `JobFile`.
  - `sourceEmailThreadId`
  - `sourceEmailMessageId`
  - `sourceEmailAttachmentIndex`
  - `sourceEmailFilename`
  - These fields link saved files back to the original email thread/message/attachment.
- Updated email attachment filing.
  - Clicking an unsaved email attachment now files the raw attachment into `Mail Attachments`.
  - If the email thread is linked to a production, the production is used automatically.
  - If the thread is not linked to a production, the user is prompted to choose a production.
  - Duplicate filing is prevented by reusing an existing `JobFile` with the same source email message, attachment index, and production.
  - Inline `cid:` email images are excluded from attachment chips and cannot be filed as job files.
- Updated email attachment display.
  - Filed attachments show as `Filed`.
  - Clicking a filed attachment opens the saved file preview instead of downloading from IMAP again.
- Expanded file preview support.
  - Existing preview panel now supports videos with native browser controls.
  - PDFs and images continue to preview inline.

### Verification
- Migration applied: `20260507100000_mail_attachment_file_links`.
- Prisma client regenerated.
- Backend build passes: `cd backend && npm run build`.
- Frontend build passes: `cd frontend && npm run build`.
- Frontend bundle copied to `/var/www/agent`.
- API reloaded with `pm2 reload 0 --update-env`.
- API health check passes at `http://localhost:3000/api/health`.

### Notes
- Existing synced messages need their IMAP mailbox/UID metadata from the previous attachment pass before raw attachment filing can work. If an older email says the attachment is unavailable until resynced, run Settings → Email → Sync.
- Opportunity-only email threads still need a production choice before filing because the physical file system is production/job-folder based.

## Email Client Fixes — Sent Sync, Quotes, Reply Persistence — 2026-05-07

### Fixed
- Email sync now processes Sent mail after INBOX.
  - Tries `[Gmail]/Sent Mail`, `Sent`, `Sent Items`, then `Sent Messages`.
  - Uses the same parse/upsert logic for INBOX and Sent.
  - Sent-folder messages are forced to `isFromMe: true`.
  - Sent replies use the same `threadId` / `References` / `In-Reply-To` grouping path so they can appear in the same thread as received messages.
  - Threads with both received and sent messages now qualify for both Inbox and Sent views.
- Improved quoted-text hiding in the thread message renderer.
  - Gmail quote blocks are removed.
  - `<blockquote>` content is hidden.
  - Outlook/corporate quote headers starting with `From:` and containing `Sent:` or `Date:` plus `To:` are detected and hidden.
  - Plain-text quote splitting now handles Outlook, Apple Mail, original-message dividers, and underscore dividers.
  - Hidden quotes show a compact `Show previous message` pill and expand inline.
- Improved signature handling.
  - `--` signature divider and following content are separated from the visible body.
  - Expanded messages show signatures in muted italic text.
  - Collapsed previews keep signatures out of the visible preview body.
- Reworked reply persistence.
  - Reply state now lives at the Email page level rather than inside the selected thread detail.
  - Opening another thread no longer changes the active reply draft.
  - When replying to a different thread than the one currently selected, an amber banner shows the original thread subject with `Switch to that thread` and `Close reply`.
  - Discard now confirms inline when the draft has body content.
  - Reply UI is tighter: recipient chips, compact toolbar, optional From selector, optional CC field, muted signature, attach icon, and dark Send button.

### Verification
- Backend build passes: `cd backend && npm run build`.
- Frontend build passes: `cd frontend && npm run build`.
- Frontend bundle copied to `/var/www/agent`.
- API reloaded with `pm2 reload 0 --update-env`.
- API health check passes at `http://localhost:3000/api/health`.
- Manual sync from Settings was not triggered from the terminal because it requires an authenticated app session; use Settings → Email → sync icon to pull the new Sent folder data.

### Remaining Issues
- Attachment downloads still depend on the existing `501` attachment endpoint until raw IMAP attachment retrieval is implemented.
- Sent-folder sync depends on the provider exposing one of the known Sent mailbox names; logs will show each attempted folder.

## Email Client Spark View Update — 2026-05-07

### Fixed And Improved
- Fixed the Sent folder by adding a real `folder` query path to `getThreads`.
  - Inbox now returns non-archived threads with at least one received message.
  - Sent now returns threads with at least one sent message.
  - Flagged returns flagged, non-archived threads.
  - Archived returns archived threads.
- `GET /api/email/threads` now accepts `folder=inbox|sent|flagged|archived`.
- `getThread(threadId)` continues returning all messages ordered oldest to newest.
- Added sender display-name resolution:
  - Contact match first.
  - Email header `fromName` second.
  - Readable name derived from email address as fallback.
  - Generic senders such as `noreply`, `info`, and `support` resolve from the domain name.
- Added deterministic avatar colors from email address, with sent-from-me messages using `#1a1a1f`.
- Thread list responses now include:
  - `resolvedSenderName`
  - `avatarColor`
  - `messageCount`
  - `hasAttachments`
- Thread detail responses now include per-message:
  - `resolvedFromName`
  - `avatarColor`
- Thread detail responses now include a top-level attachment summary:
  - `attachments`
  - `totalAttachmentCount`
- Installed Tiptap packages for rich reply editing:
  - `@tiptap/react`
  - `@tiptap/pm`
  - `@tiptap/starter-kit`
  - `@tiptap/extension-link`
  - `@tiptap/extension-placeholder`
  - `@tiptap/extension-underline`

### Frontend Email UI
- Reworked the Email thread list to a Spark-style layout:
  - 36px sender avatars with initials and API-provided colors.
  - unread dot.
  - sender name, subject, preview, time, attachment indicator.
  - message-count badge on multi-message threads.
  - desktop date separators: Today, Yesterday, Last Week, or date.
  - mobile keeps the simpler full-screen list without date separator clutter.
- Reworked the thread detail view:
  - fixed Spark-style header with subject, participants, star/archive actions.
  - attachment chips in the header on desktop, up to three with `+ N more`.
  - attachment chips call `/api/email/messages/:messageId/attachment/:index`.
  - messages render as collapsible blocks.
  - latest message stays expanded.
  - collapsed messages show a one-line preview.
  - HTML is still sanitized with DOMPurify before rendering.
  - external images are blocked until the user clicks `Show images`.
  - simple quoted-message hiding is in place for common HTML and plain-text quote patterns.
  - unread thread view includes a `New messages` divider.
- Replaced the old modal reply flow with a pinned bottom reply bar using Tiptap.
  - Collapsed state: `Reply to ...`
  - Expanded state: account selector, recipient chips, formatting toolbar, signature, attach button, send/discard.

### Verification
- Backend build passes: `cd backend && npm run build`.
- Frontend build passes: `cd frontend && npm run build`.
- Frontend bundle copied to `/var/www/agent`.
- API reloaded with `pm2 reload 0 --update-env`.
- API health check passes at `http://localhost:3000/api/health`.
- Browser/mobile screenshot testing was not run because Playwright is not installed in this project.

### Remaining Issues
- Attachment chips are wired to the existing attachment endpoint, but `GET /api/email/messages/:messageId/attachment/:index` still returns `501` until raw IMAP UID/mailbox storage is added.
- Composer still uses the earlier textarea-based editor; this pass upgraded the thread reply bar to Tiptap as requested.

## OAuth Email Scope Fix — 2026-05-07

### Fixed
- Updated the Google OAuth authorization URL to request:
  - `https://mail.google.com/`
  - `https://www.googleapis.com/auth/gmail.send`
  - `https://www.googleapis.com/auth/gmail.modify`
  - `email`
  - `profile`
- Added full `[OAUTH] Userinfo response:` logging after token exchange.
- Added fallback to Google tokeninfo when `userinfo.email` is missing or returns `unknown`.
- OAuth callback now fails visibly with `Could not get email address. Please try again.` instead of creating a placeholder Gmail account.
- OAuth callback deletes placeholder accounts with `unknown.local` or `unknown` email addresses before creating the newly connected Gmail account.

### Verification
- Backend build passes: `cd backend && npm run build`.
- Generated OAuth URL scope was checked and includes `email profile`.
- Removed 1 existing placeholder email account from the database.
- API reloaded with `pm2 reload 0 --update-env`.
- API health check passes at `http://localhost:3000/api/health`.

### Remaining Manual Test
- Reconnect Gmail through Settings → Email → Connect Gmail.
- Expected log after consent: `[OAUTH] User email: conor@unlimited.bond`.
- Full Google consent flow still requires browser interaction, so it was not completed from the terminal.

## Phase 6 Hardening Update — 2026-05-07

### Fixed
- Added configurable email sync controls in `/backend/.env`:
  - `EMAIL_SYNC_DAYS=7`
  - `EMAIL_SYNC_LIMIT=200`
- Documented `EMAIL_SYNC_DAYS` and `EMAIL_SYNC_LIMIT` in `CLAUDE.md`.
- Reworked `syncAccount(accountId)` logging with consistent prefixes:
  - `[SYNC]`
  - `[IMAP]`
  - `[TOKEN]`
  - `[OAUTH]`
- Sync now logs:
  - account loading
  - provider/token presence
  - IMAP client creation
  - IMAP connection attempt
  - mailbox open
  - configured sync window
  - UID search count
  - fetched message count
  - new thread/message/error counts
  - smart-link pass
  - `lastSyncedAt` update
  - IMAP logout
- Replaced hardcoded 90-day sync with `EMAIL_SYNC_DAYS`.
- Added `EMAIL_SYNC_LIMIT` slicing so only the most recent configured messages are fetched.
- Updated manual sync endpoint to return `{ status: "syncing" }` immediately, then run the sync with explicit `[EMAIL SYNC]` start/completion/failure logs.
- Changed `getImapClient(account)` so it creates an ImapFlow client but does not connect. Callers now call `connect()` explicitly, which makes connection logs meaningful.
- Added Google token refresh logging and clearer token refresh errors.
- Added OAuth token exchange logging:
  - response status
  - access-token presence
  - refresh-token presence
  - token expiry
  - user email
- Added Google IMAP failure guidance when IMAP/OAuth connection fails:
  - enable IMAP in Gmail Settings → Forwarding and POP/IMAP
  - for Google Workspace, admin may need to enable IMAP access
- Fixed email signature placeholder behavior:
  - `/api/email/signature` replaces `[emailAddress]` with the primary active account email.
  - stored settings signature was updated to `Conor | unlimited.bond | conor@unlimited.bond`.
  - frontend fallback no longer shows `[emailAddress]` literally.

### Verification From Logs
- Backend build passes: `npm run build`.
- Frontend build passes: `npm run build`.
- Frontend bundle deployed to `/var/www/agent`.
- API reloaded with `pm2 reload production-management-api --update-env`.
- API health check passes.
- Manual sync was triggered through the protected route with an authenticated curl session.
- Logs showed:
  - `[EMAIL SYNC] Starting manual sync for account d6b3f9b7-b3c5-4d3b-a59d-133ba566cd8f`
  - `[SYNC] Loading account d6b3f9b7-b3c5-4d3b-a59d-133ba566cd8f`
  - `[SYNC] Account: conor@unlimited.bond, provider: GOOGLE, hasAccessToken: true, hasRefreshToken: true`
  - `[SYNC] Creating IMAP client for conor@unlimited.bond`
  - `[IMAP] Creating Google OAuth2 ImapFlow client for conor@unlimited.bond`
  - `[SYNC] Connecting to IMAP...`
  - `[SYNC] IMAP connection failed for conor@unlimited.bond: Command failed`
  - `[IMAP] Google auth hint: Enable IMAP in Gmail Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP. For Google Workspace, the admin may need to enable IMAP access.`
- Sync is **not confirmed working** yet because IMAP connection fails before mailbox open/search. No `[SYNC] Opened INBOX`, UID search, or message fetch logs appeared.

### Current Email Sync Blocker
- The Google account has encrypted access and refresh tokens in the database.
- Token presence is confirmed.
- The failure happens at IMAP connection time.
- Next manual action: in Gmail, go to Settings → See all settings → Forwarding and POP/IMAP → Enable IMAP → Save. If this is Google Workspace, the Workspace admin may also need to allow IMAP access.
- After enabling IMAP, trigger Sync again from Settings → Email and watch for `[SYNC] Opened INBOX` and `[SYNC] Found ... messages since ...` logs.

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
- Email attachments can now be filed to production-linked or unlinked `Mail Attachments`.
- Receipt assignment creates receipt `JobFile` records in production `Receipts/`.

### Settings
- Existing account, crew roles, storage, and item catalog settings remain.
- Email accounts, signature, and templates are now managed in Settings.

## Decisions
- Used Prisma enum values `GOOGLE` and `IMAP` to match existing uppercase enum style.
- Kept synced email threads/messages when an account is deleted by making `EmailThread.accountId` nullable and using `onDelete: SetNull`.
- Composer attachment chips for budget PDFs currently show generated file metadata; actual SMTP binary attachment from a `JobFile` still needs a send-time file-loading path.
- Email HTML rendering uses DOMPurify rather than iframes to keep the implementation lightweight and safe.
- Used local storage for the budget-to-email draft handoff so the Budget view can open the Email route without adding global state.

## Known Issues And Technical Debt
- Composer rich text controls are visual placeholders; the body is currently a textarea accepting HTML/plain text.
- Contact autocomplete in composer is not implemented yet.
- Attach-from-job in composer is not implemented yet.
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
- `feat: dashboard receipt capture and parsing`

## Exact Next Step For Phase 8

Start FreeAgent + Automations:
1. Add FreeAgent OAuth connection management in Settings.
2. Pull invoice status into Production records and Dashboard outstanding invoices.
3. Implement Wrapped production invoice prompt to create a FreeAgent invoice draft from budget totals.
4. Add weekly digest cron job.
5. Add remaining automation hardening for follow-ups, over-accrual/over-budget alerts, and email digest content.
