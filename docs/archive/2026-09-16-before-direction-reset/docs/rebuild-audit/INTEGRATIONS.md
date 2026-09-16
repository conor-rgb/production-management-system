# Legacy Integrations

No secret values are included.

## Google Workspace

- OAuth start route: `GET /api/email/oauth/google/start`.
- OAuth callback routes: `GET /api/email/oauth/google/callback` mounted twice, once directly in `server.ts` and once in `email.ts`.
- OAuth config keys: `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GOOGLE_REDIRECT_URI`.
- Token storage: `EmailAccount.encryptedAccessToken`, `EmailAccount.encryptedRefreshToken`, `EmailAccount.tokenExpiresAt`, encrypted by `EMAIL_ENCRYPTION_KEY`; tokens are redacted from export.
- Gmail code paths: `services/emailService.ts`, `services/gmailService.ts`, `services/gmailSyncService.ts`, `routes/email.ts`, `services/emailDraftService.ts`.
- Gmail data entities: `EmailAccount`, `EmailThread`, `EmailMessage`, `EmailDraft`, `EmailDraftAttachment`, `EmailCategoryRule`, `EmailTemplate`, `JobFile` source email references.
- Calendar code paths: `services/googleCalendarService.ts`, `services/calendarSyncService.ts`, `routes/calendar.ts`, `routes/productions.ts`, `routes/projectActions.ts`.
- Calendar data entities: `CalendarEvent`, production date Google IDs, project action calendar event links.

## Google Maps / Places

- Config keys: `GOOGLE_MAPS_API_KEY`, `GOOGLE_PLACES_API_KEY` fallback behavior in code.
- Code paths: `services/googlePlacesService.ts`, `services/optionMapService.ts`, `routes/options.ts`.
- Data entities: `BlackbookAddress` place metadata, `OptionCandidate` map/static-map fields, candidate map serve routes.

## FreeAgent

- Config keys: `FREEAGENT_CLIENT_ID`, `FREEAGENT_CLIENT_SECRET`, `FREEAGENT_REDIRECT_URI`, `FREEAGENT_SANDBOX`.
- Data references: `Production.freeAgentInvoiceStatus`, invoice status enum, budget/PO conversion paths.
- No complete FreeAgent OAuth route surface was identified in mounted routes; treat FreeAgent as partially implemented or planned.

## Anthropic

- Config key: `ANTHROPIC_API_KEY`.
- Code paths: `services/receiptParser.ts`, `services/travelItineraryParser.ts`.
- Use: parse receipt captures and travel/accommodation itinerary documents.

## OpenAI / SendGrid / S3 / Redis

- Config keys exist for `OPENAI_API_KEY`, `SENDGRID_API_KEY`, `S3_*`, `REDIS_URL`.
- Current inspected code primarily uses local filesystem storage, Nodemailer/Gmail/IMAP email, and Anthropic parsing.
- S3-style keys are present in environment but no active S3 storage service was identified in `fileStorage.ts`; verify historical branches before omitting cloud object storage migration.

## Background Sync

- Gmail full sync on startup, incremental sync every 2 minutes.
- IMAP IDLE for non-Google accounts.
- Calendar push/pull on startup and Google pull every 5 minutes.
- Root crontab contains a legacy DB backup command for `scripts/backup_db.sh`, but the script path was not found in the current tree.
