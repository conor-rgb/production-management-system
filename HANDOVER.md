# HANDOVER — 2026-05-11 — Gmail API Email Sync Foundation

## Built this session
- Replaced Gmail-account sync with Gmail API sync while keeping IMAP support for non-Gmail accounts.
- Added Gmail-native schema fields to email tables:
  - `EmailAccount.gmailHistoryId`
  - `EmailThread.gmailThreadId`, `historyId`, `snippet`, Gmail label booleans, participant names, inbox/sent timestamps
  - `EmailMessage.gmailMessageId`, `gmailThreadId`, label booleans, `snippet`, Gmail attachment metadata
- Added migration `20260511170000_gmail_api_foundation` and applied it with `prisma migrate deploy`.
- Created `backend/src/services/gmailService.ts` for Gmail API auth, token refresh, thread fetch, message parsing, label operations, attachment download, send/reply, and history reads.
- Created `backend/src/services/gmailSyncService.ts` for full sync, incremental sync, per-thread sync, and smart CRM linking.
- Updated app startup so Google accounts use Gmail API full sync plus 2-minute incremental polling; IMAP IDLE is skipped for Google accounts and still used for IMAP accounts.
- Wiped existing synced email messages/threads once manually because `GMAIL_RESYNC_DONE=true` was already present in `.env`.
- Updated email routes so Gmail archive/unarchive, star/unstar, read/unread, manual sync, attachment download, and send/reply call Gmail API for Google accounts.
- Updated email frontend folder navigation to use Inbox, Sent, Starred, Unread, Archived; added star indicators and linked record pills in thread rows.

## Verification
- `backend`: `npm run build` passed.
- `frontend`: `npm run build` passed.
- Frontend build copied to `/var/www/agent`.
- PM2 reloaded with `pm2 reload 0 --update-env`.
- Health check passed: `curl http://localhost:3000/api/health` returned `ok`.
- Gmail API full sync completed in PM2 logs: `Full sync complete: 151 threads for conor@unlimited.bond`.
- Database after sync: 151 threads, 255 messages, 132 inbox threads, 7 sent threads, 19 archived threads.

## Current email module state
- Gmail is now synced from Gmail API using native `gmailThreadId`, label state, and Gmail attachment IDs.
- Sent folder ordering has the data needed for correct sent-date sorting via `lastSentMessageAt`.
- Archive/unarchive changes Gmail labels (`INBOX` removed/added) and updates local state.
- Star/unstar uses Gmail `STARRED` label and keeps existing UI `isFlagged` compatibility.
- Read/unread uses Gmail `UNREAD` label and keeps existing UI `isRead` compatibility.
- Existing email UI contracts are preserved where practical: `externalThreadId`, `externalMessageId`, `isRead`, `isFlagged`, `isArchived`, `latestPreview`, `participantNames`, avatars, and filed attachments remain available.
- IMAP paths remain in `emailService.ts` for provider `IMAP` only.

## Issues / technical debt
- PM2 error log still contains older pre-reload IMAP timeout and budget `pms_budget_revisions.version` errors; no new Gmail startup crash was observed after reload.
- Gmail history incremental sync is polling-based every 2 minutes. Push notifications/webhooks are not implemented.
- Gmail search endpoint is local database search only. Full Gmail server-side search can be added later if needed.
- Frontend quick actions are minimal: detail header supports star/archive, folder nav supports Starred/Unread. Swipe/hover actions can be expanded in Prompt 2.
- The startup wipe guard remains enabled via `GMAIL_RESYNC_DONE=true`; do not unset it unless intentionally wiping all synced email again.

## Exact next step — Prompt 2 CRM actions
Build the Daylite-style CRM actions on top of the Gmail foundation:
1. Add thread action endpoints for linking/unlinking threads to opportunities, productions, and contacts using Gmail participants including CC addresses.
2. Add “Create opportunity from thread” using subject/snippet/participants as defaults.
3. Add “Create person from address” for From/To/CC participants, with duplicate detection by email.
4. Add thread detail UI side panel/actions for linked records, participant chips, and create/link flows.
5. Keep Gmail sync engine untouched unless a CRM action needs a local field.
